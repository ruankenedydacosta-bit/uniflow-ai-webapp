const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
const MAX_DURATION_MS = 15_000;
const PROVIDER_TIMEOUT_MS = 20_000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_MIME_TYPES = new Set(['audio/webm', 'audio/mp4', 'audio/ogg']);

function getAllowedOrigins() {
  return new Set(
    (Deno.env.get('APP_ALLOWED_ORIGINS') ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

function isAllowedOrigin(origin: string) {
  if (!origin) return false;
  if (getAllowedOrigins().has(origin)) return true;
  return /^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/.test(origin);
}

function corsHeaders(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin,
    Vary: 'Origin',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function jsonResponse(status: number, body: Record<string, unknown>, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

function normalizeMimeType(value: string) {
  return value.toLowerCase().split(';')[0];
}

function sanitizeTranscript(value: unknown) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 600);
}

async function getAuthenticatedUserId(authorization: string, supabaseUrl: string, anonKey: string) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: anonKey },
  });
  if (!response.ok) return null;
  const user = await response.json();
  return typeof user?.id === 'string' ? user.id : null;
}

async function hasWorkspaceMembership({
  authorization,
  supabaseUrl,
  anonKey,
  userId,
  workspaceId,
}: {
  authorization: string;
  supabaseUrl: string;
  anonKey: string;
  userId: string;
  workspaceId: string;
}) {
  const params = new URLSearchParams({
    select: 'workspace_id',
    workspace_id: `eq.${workspaceId}`,
    user_id: `eq.${userId}`,
    status: 'eq.active',
    limit: '1',
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/workspace_members?${params}`, {
    headers: { Authorization: authorization, apikey: anonKey },
  });
  if (!response.ok) return false;
  const rows = await response.json();
  return Array.isArray(rows) && rows.length === 1;
}

async function transcribeWithOpenAi({
  apiKey,
  model,
  audio,
  signal,
}: {
  apiKey: string;
  model: string;
  audio: File;
  signal: AbortSignal;
}) {
  const body = new FormData();
  body.append('file', audio, audio.name || 'uni-voice.webm');
  body.append('model', model);
  body.append('language', 'pt');
  body.append('response_format', 'json');

  return fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body,
    signal,
  });
}

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin') ?? '';
  if (!isAllowedOrigin(origin)) {
    return jsonResponse(403, { error: 'Origem nao autorizada.' }, origin);
  }
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Metodo nao permitido.' }, origin);
  }

  const authorization = request.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) {
    return jsonResponse(401, { error: 'Sessao obrigatoria.' }, origin);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const providerKey = Deno.env.get('OPENAI_API_KEY') ?? '';
  const model = Deno.env.get('UNI_TRANSCRIPTION_MODEL') ?? 'gpt-4o-mini-transcribe';
  if (!supabaseUrl || !anonKey || !providerKey) {
    return jsonResponse(503, { error: 'Transcricao indisponivel.' }, origin);
  }

  const userId = await getAuthenticatedUserId(authorization, supabaseUrl, anonKey);
  if (!userId) return jsonResponse(401, { error: 'Sessao invalida.' }, origin);

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonResponse(400, { error: 'Audio invalido.' }, origin);
  }

  const audio = formData.get('audio');
  const workspaceId = formData.get('workspace_id');
  const durationMs = Number(formData.get('duration_ms'));
  if (!(audio instanceof File) || !audio.size) {
    return jsonResponse(400, { error: 'Audio ausente.' }, origin);
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return jsonResponse(413, { error: 'Audio excede o limite.' }, origin);
  }
  if (!ALLOWED_MIME_TYPES.has(normalizeMimeType(audio.type))) {
    return jsonResponse(415, { error: 'Formato de audio nao permitido.' }, origin);
  }
  if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > MAX_DURATION_MS) {
    return jsonResponse(400, { error: 'Duracao invalida.' }, origin);
  }
  if (typeof workspaceId !== 'string' || !UUID_PATTERN.test(workspaceId)) {
    return jsonResponse(400, { error: 'Workspace invalido.' }, origin);
  }

  const isMember = await hasWorkspaceMembership({
    authorization,
    supabaseUrl,
    anonKey,
    userId,
    workspaceId,
  });
  if (!isMember) return jsonResponse(403, { error: 'Workspace nao autorizado.' }, origin);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('timeout'), PROVIDER_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const providerResponse = await transcribeWithOpenAi({
      apiKey: providerKey,
      model,
      audio,
      signal: controller.signal,
    });
    if (providerResponse.status === 429) {
      return jsonResponse(429, { error: 'Limite temporario atingido.' }, origin);
    }
    if (!providerResponse.ok) {
      return jsonResponse(502, { error: 'Transcricao indisponivel.' }, origin);
    }

    const data = await providerResponse.json();
    const text = sanitizeTranscript(data?.text);
    if (!text) return jsonResponse(422, { error: 'Fala nao identificada.' }, origin);

    console.log(JSON.stringify({
      at: 'uni-voice-transcribe',
      status: 'ok',
      durationMs: Date.now() - startedAt,
      audioBytes: audio.size,
      audioDurationMs: durationMs,
      model,
    }));
    return jsonResponse(200, { text }, origin);
  } catch {
    const timedOut = controller.signal.reason === 'timeout';
    return jsonResponse(timedOut ? 504 : 502, { error: 'Transcricao indisponivel.' }, origin);
  } finally {
    clearTimeout(timeout);
  }
});
