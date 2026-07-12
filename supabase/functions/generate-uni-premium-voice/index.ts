const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1/text-to-speech';
const MAX_TEXT_LENGTH = 320;
const PROVIDER_TIMEOUT_MS = 15000;
const activeUsers = new Set<string>();

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PRESETS = Object.freeze({
  balanced: { stability: 0.58, similarity_boost: 0.76, style: 0.24, speed: 1 },
  direct: { stability: 0.66, similarity_boost: 0.78, style: 0.16, speed: 1.06 },
  warm: { stability: 0.52, similarity_boost: 0.74, style: 0.34, speed: 0.96 },
  strategic: { stability: 0.64, similarity_boost: 0.8, style: 0.2, speed: 0.98 },
});

type PersonalityProfile = keyof typeof PRESETS;

function jsonResponse(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function sanitizeText(value: unknown) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(?:#{1,6}|>|[-*+]\s|\d+\.\s)/gm, ' ')
    .replace(/[*_~]/g, '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsSensitiveData(text: string) {
  return [
    /\b\d{3}\.\d{3}\.\d{3}-?\d{2}\b/,
    /\b(?:\d[ -]*?){13,19}\b/,
    /\b(?:senha|password|token|api[_ -]?key|chave privada|secret)\b/i,
    /\b(?:ag[eê]ncia|conta)\s*[:#-]?\s*\d{4,}\b/i,
  ].some((pattern) => pattern.test(text));
}

function readAllowlist(value = '') {
  return new Set(value.split(',').map((id) => id.trim()).filter(Boolean));
}

async function getAuthenticatedUserId(authorization: string, supabaseUrl: string, anonKey: string) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: anonKey },
  });
  if (!response.ok) return null;
  const user = await response.json();
  return typeof user?.id === 'string' ? user.id : null;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (request.method !== 'POST') return jsonResponse(405, 'Método não permitido.');

  const authorization = request.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) return jsonResponse(401, 'Entre novamente para usar a voz premium.');

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const providerKey = Deno.env.get('ELEVENLABS_API_KEY') ?? '';
  const voiceId = Deno.env.get('ELEVENLABS_VOICE_ID') ?? '';
  const modelId = Deno.env.get('ELEVENLABS_MODEL_ID') ?? '';
  const allowlist = readAllowlist(Deno.env.get('UNI_PREMIUM_VOICE_ALLOWED_USER_IDS'));
  if (!supabaseUrl || !anonKey || !providerKey || !voiceId || !modelId) {
    return jsonResponse(503, 'A voz premium não está configurada neste ambiente.');
  }

  const userId = await getAuthenticatedUserId(authorization, supabaseUrl, anonKey);
  if (!userId) return jsonResponse(401, 'Entre novamente para usar a voz premium.');
  if (!allowlist.has(userId)) return jsonResponse(403, 'A voz premium está disponível apenas no modo de apresentação.');
  if (activeUsers.has(userId)) return jsonResponse(409, 'Já existe uma geração de voz em andamento.');

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, 'Não foi possível ler esta solicitação de voz.');
  }
  if ('user_id' in payload || 'voice_id' in payload || 'model_id' in payload) {
    return jsonResponse(400, 'A solicitação contém campos não permitidos.');
  }

  const text = sanitizeText(payload.text);
  if (!text) return jsonResponse(400, 'Não há uma resposta para reproduzir.');
  if (text.length > MAX_TEXT_LENGTH) return jsonResponse(413, 'Use um resumo de até 320 caracteres.');
  if (containsSensitiveData(text)) return jsonResponse(422, 'Esta resposta contém dados que não podem ser enviados ao provedor de voz.');

  const personalityProfile = typeof payload.personalityProfile === 'string'
    && payload.personalityProfile in PRESETS
    ? payload.personalityProfile as PersonalityProfile
    : 'balanced';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  activeUsers.add(userId);

  try {
    const providerResponse = await fetch(`${ELEVENLABS_BASE_URL}/${encodeURIComponent(voiceId)}/stream`, {
      method: 'POST',
      headers: {
        'xi-api-key': providerKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: PRESETS[personalityProfile],
      }),
      signal: controller.signal,
    });
    if (!providerResponse.ok) return jsonResponse(502, 'Não consegui gerar a voz natural agora.');

    const audio = await providerResponse.arrayBuffer();

    return new Response(audio, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': providerResponse.headers.get('Content-Type') ?? 'audio/mpeg',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const timedOut = controller.signal.reason === 'timeout'
      || (error instanceof DOMException && error.name === 'AbortError');
    return jsonResponse(timedOut ? 504 : 502,
      'Não consegui gerar a voz natural agora.');
  } finally {
    clearTimeout(timeout);
    activeUsers.delete(userId);
  }
});
