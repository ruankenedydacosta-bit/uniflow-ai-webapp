// Edge Function: uni-voice-tts
//
// Fundação geral de Text-to-Speech via ElevenLabs (ELEVEN1), com cache
// persistente por usuário (ELEVEN2.1) para evitar gerações repetidas e
// consumo desnecessário de créditos. Diferente de generate-uni-premium-voice
// (demo restrita por allowlist, ligada ao chat principal), esta função é a
// base REUTILIZÁVEL: qualquer usuário autenticado pode usá-la. Nesta fase
// ela é chamada tanto por /dev/uni-audio-library quanto pelo chat principal
// (ELEVEN2).
//
// A chave real do provedor (ELEVENLABS_API_KEY) vive APENAS aqui, no
// ambiente da Edge Function, nunca no bundle Vite/frontend. O mesmo vale
// para a service role key usada no cache: nunca sai deste arquivo.

const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1/text-to-speech';
const DEFAULT_MODEL_ID = 'eleven_multilingual_v2';
const DEFAULT_OUTPUT_FORMAT = 'mp3_44100_128';
const DEFAULT_TIMEOUT_MS = 15000;
const MAX_TEXT_LENGTH = 600;

// ELEVEN2.1: cache persistente (Supabase Storage + tabela de metadados).
const CACHE_BUCKET = 'uni-voice-cache';
const DEFAULT_CACHE_TTL_DAYS = 30;
// Versao explicita do algoritmo de sanitizacao/cache -- mudar este valor
// invalida todo o cache existente de forma segura (nunca reaproveita audio
// gerado com uma regra de sanitizacao antiga/diferente).
const CACHE_ALGO_VERSION = 'v1';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  // ELEVEN2.1: sem isso o navegador esconde o header de diagnostico
  // X-Uni-Voice-Cache de res.headers.get() no cliente (CORS so expoe um
  // conjunto minimo de headers "seguros" por padrao).
  'Access-Control-Expose-Headers': 'X-Uni-Voice-Cache',
};

function jsonResponse(
  status: number,
  code: string,
  message: string,
  details: { providerStatus?: number | null; retryable?: boolean } = {},
) {
  return new Response(JSON.stringify({
    error: {
      code,
      message,
      provider_status: Number.isInteger(details.providerStatus) ? details.providerStatus : null,
      retryable: Boolean(details.retryable),
    },
  }), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

async function readProviderErrorTag(response: Response) {
  const body = await response.json().catch(() => null);
  const candidate = body?.detail?.status ?? body?.detail?.code ?? body?.status ?? body?.code;
  return typeof candidate === 'string' ? candidate.toLowerCase() : '';
}

function providerErrorResponse(
  status: number,
  code: string,
  message: string,
  providerStatus: number | null,
  retryable: boolean,
) {
  // Diagnóstico seguro: somente classificação e status HTTP do provedor.
  // Nunca registra texto, usuário, voice ID, chave ou corpo da resposta.
  console.warn('uni_voice_tts_provider_failure', { code, providerStatus, retryable });
  return jsonResponse(status, code, message, { providerStatus, retryable });
}

function audioResponse(audio: BodyInit, contentType: string, cacheStatus: 'HIT' | 'MISS') {
  return new Response(audio, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
      // Diagnostico interno/nao sensivel -- nunca expoe texto, chave ou
      // caminho de storage, so se o pedido reaproveitou audio existente.
      'X-Uni-Voice-Cache': cacheStatus,
    },
  });
}

// Mesmo criterio de sanitizacao ja usado por generate-uni-premium-voice --
// remove markdown/HTML/blocos de codigo antes de enviar ao provedor de voz.
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
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[ -]/g, ' ')
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

async function getAuthenticatedUserId(authorization: string, supabaseUrl: string, anonKey: string) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: anonKey },
  });
  if (!response.ok) return null;
  const user = await response.json();
  return typeof user?.id === 'string' ? user.id : null;
}

async function sha256Hex(input: string) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Chave deterministica do cache -- NUNCA usa texto puro, nome, e-mail ou
// qualquer dado invisivel de sessao como caminho. So o hash entra no
// caminho de storage e na tabela de metadados.
async function computeCacheKey({
  userId, voiceId, modelId, outputFormat, text,
}: { userId: string; voiceId: string; modelId: string; outputFormat: string; text: string }) {
  return sha256Hex(`${CACHE_ALGO_VERSION}:${userId}:${voiceId}:${modelId}:${outputFormat}:${text}`);
}

type CacheRow = { storage_path: string; expires_at: string };

async function findCacheRow(
  { supabaseUrl, serviceRoleKey, userId, cacheKey }:
  { supabaseUrl: string; serviceRoleKey: string; userId: string; cacheKey: string },
): Promise<CacheRow | null> {
  const url = `${supabaseUrl}/rest/v1/uni_voice_cache`
    + `?user_id=eq.${encodeURIComponent(userId)}&cache_key=eq.${encodeURIComponent(cacheKey)}`
    + '&select=storage_path,expires_at&limit=1';
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey },
  });
  if (!response.ok) return null;
  const rows = await response.json();
  return Array.isArray(rows) && rows[0] ? rows[0] as CacheRow : null;
}

async function downloadCachedAudio(
  { supabaseUrl, serviceRoleKey, storagePath }:
  { supabaseUrl: string; serviceRoleKey: string; storagePath: string },
) {
  const response = await fetch(
    `${supabaseUrl}/storage/v1/object/${CACHE_BUCKET}/${storagePath}`,
    { headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey } },
  );
  if (!response.ok) return null;
  return response;
}

// Best-effort: nunca bloqueia nem falha a reproducao se a atualizacao do
// timestamp de acesso nao funcionar.
function touchLastAccessed(
  { supabaseUrl, serviceRoleKey, userId, cacheKey }:
  { supabaseUrl: string; serviceRoleKey: string; userId: string; cacheKey: string },
) {
  const url = `${supabaseUrl}/rest/v1/uni_voice_cache`
    + `?user_id=eq.${encodeURIComponent(userId)}&cache_key=eq.${encodeURIComponent(cacheKey)}`;
  fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ last_accessed_at: new Date().toISOString() }),
  }).catch(() => { /* nunca bloqueia a reproducao */ });
}

async function uploadCacheAudio(
  { supabaseUrl, serviceRoleKey, storagePath, audio, contentType }:
  { supabaseUrl: string; serviceRoleKey: string; storagePath: string; audio: ArrayBuffer; contentType: string },
) {
  // Caminho e conteudo sao deterministicos (mesmo hash == mesmos bytes) --
  // upsert e seguro mesmo sob concorrencia: duas escritas para o mesmo
  // caminho gravam o mesmo audio.
  const response = await fetch(
    `${supabaseUrl}/storage/v1/object/${CACHE_BUCKET}/${storagePath}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        'Content-Type': contentType,
        'x-upsert': 'true',
      },
      body: audio,
    },
  );
  return response.ok;
}

async function upsertCacheMetadata(
  {
    supabaseUrl, serviceRoleKey, userId, cacheKey, storagePath,
    voiceIdHash, modelId, outputFormat, characterCount, ttlDays,
  }: {
    supabaseUrl: string; serviceRoleKey: string; userId: string; cacheKey: string; storagePath: string;
    voiceIdHash: string; modelId: string; outputFormat: string; characterCount: number; ttlDays: number;
  },
) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);
  const url = `${supabaseUrl}/rest/v1/uni_voice_cache?on_conflict=user_id,cache_key`;
  await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({
      user_id: userId,
      cache_key: cacheKey,
      storage_path: storagePath,
      voice_id_hash: voiceIdHash,
      model_id: modelId,
      output_format: outputFormat,
      character_count: characterCount,
      last_accessed_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    }),
  }).catch(() => { /* falha ao registrar cache nunca impede a resposta ja gerada */ });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (request.method !== 'POST') return jsonResponse(405, 'METHOD_NOT_ALLOWED', 'Método não permitido.');

  const authorization = request.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) {
    return jsonResponse(401, 'UNAUTHORIZED', 'Entre novamente para gerar voz.');
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const providerKey = Deno.env.get('ELEVENLABS_API_KEY') ?? '';
  const voiceId = Deno.env.get('ELEVENLABS_VOICE_ID') ?? '';
  // Modelo/formato/timeout tem defaults seguros -- só a chave e o voice ID
  // são estritamente obrigatórios (a voz definitiva da Uni ainda não foi
  // escolhida; ELEVENLABS_VOICE_ID é provisório/de teste até então).
  const modelId = Deno.env.get('ELEVENLABS_MODEL_ID') || DEFAULT_MODEL_ID;
  const outputFormat = Deno.env.get('ELEVENLABS_OUTPUT_FORMAT') || DEFAULT_OUTPUT_FORMAT;
  const timeoutMs = Number(Deno.env.get('ELEVENLABS_TIMEOUT_MS')) || DEFAULT_TIMEOUT_MS;
  // Injetada automaticamente pelo runtime das Edge Functions -- nunca
  // configurada manualmente como secret customizado.
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const ttlDays = Number(Deno.env.get('ELEVENLABS_CACHE_TTL_DAYS')) || DEFAULT_CACHE_TTL_DAYS;
  // Cache e uma otimizacao, nunca um requisito -- sem service role key
  // disponivel, a funcao segue funcionando exatamente como na ELEVEN1/2
  // (sempre gera, nunca cacheia).
  const cacheEnabled = Boolean(serviceRoleKey);

  if (!supabaseUrl || !anonKey || !providerKey || !voiceId) {
    return jsonResponse(503, 'CONFIGURATION_ERROR', 'A geração de voz não está configurada neste ambiente.');
  }

  const userId = await getAuthenticatedUserId(authorization, supabaseUrl, anonKey);
  if (!userId) return jsonResponse(401, 'UNAUTHORIZED', 'Entre novamente para gerar voz.');

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, 'INVALID_REQUEST', 'Não foi possível ler esta solicitação.');
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return jsonResponse(400, 'INVALID_REQUEST', 'Não foi possível ler esta solicitação.');
  }
  if ('user_id' in payload || 'voice_id' in payload || 'model_id' in payload || 'api_key' in payload) {
    return jsonResponse(400, 'INVALID_REQUEST', 'A solicitação contém campos não permitidos.');
  }

  const text = sanitizeText(payload.text);
  if (!text) return jsonResponse(400, 'INVALID_REQUEST', 'Informe um texto para gerar a voz.');
  if (text.length > MAX_TEXT_LENGTH) {
    return jsonResponse(413, 'INVALID_REQUEST', `Use um texto de até ${MAX_TEXT_LENGTH} caracteres.`);
  }
  if (containsSensitiveData(text)) {
    return jsonResponse(422, 'INVALID_REQUEST', 'Este texto contém dados que não podem ser enviados ao provedor de voz.');
  }

  // ELEVEN2.1 -- procura cache antes de chamar a ElevenLabs. Qualquer falha
  // nesta etapa (rede, storage indisponivel) nunca bloqueia a geracao --
  // so significa que o pedido segue como se fosse cache miss.
  if (cacheEnabled) {
    try {
      const cacheKey = await computeCacheKey({
        userId, voiceId, modelId, outputFormat, text,
      });
      const cacheRow = await findCacheRow({
        supabaseUrl, serviceRoleKey, userId, cacheKey,
      });

      if (cacheRow && new Date(cacheRow.expires_at).getTime() > Date.now()) {
        const cached = await downloadCachedAudio({
          supabaseUrl, serviceRoleKey, storagePath: cacheRow.storage_path,
        });
        if (cached) {
          touchLastAccessed({
            supabaseUrl, serviceRoleKey, userId, cacheKey,
          });
          return audioResponse(
            cached.body ?? await cached.arrayBuffer(),
            cached.headers.get('Content-Type') ?? 'audio/mpeg',
            'HIT',
          );
        }
        // Metadado existe mas o arquivo sumiu (ex.: removido manualmente) --
        // trata como miss e regenera com seguranca, sem vazar nada.
      }
    } catch {
      // Falha ao consultar o cache -- segue para gerar normalmente.
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('timeout'), timeoutMs);

  try {
    const providerUrl = `${ELEVENLABS_BASE_URL}/${encodeURIComponent(voiceId)}`
      + `?output_format=${encodeURIComponent(outputFormat)}`;
    const providerResponse = await fetch(providerUrl, {
      method: 'POST',
      headers: {
        'xi-api-key': providerKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
      }),
      signal: controller.signal,
    });

    if (!providerResponse.ok) {
      const providerTag = await readProviderErrorTag(providerResponse);
      if (providerTag.includes('quota')) {
        return providerErrorResponse(
          502, 'PROVIDER_QUOTA_ERROR', 'O limite do serviço de voz foi atingido.',
          providerResponse.status, false,
        );
      }
      if (providerResponse.status === 401 || providerResponse.status === 403) {
        return providerErrorResponse(
          502, 'PROVIDER_AUTH_ERROR', 'O serviço de voz precisa ser reconectado.',
          providerResponse.status, false,
        );
      }
      if (providerResponse.status === 429) {
        return providerErrorResponse(
          429, 'PROVIDER_RATE_LIMIT', 'Muitas solicitações de voz. Tente novamente em instantes.',
          providerResponse.status, true,
        );
      }
      if (providerResponse.status === 400 || providerResponse.status === 422) {
        return providerErrorResponse(
          422, 'INVALID_REQUEST', 'O provedor recusou os parâmetros da geração de voz.',
          providerResponse.status, false,
        );
      }
      return providerErrorResponse(
        502, 'PROVIDER_ERROR', 'Não consegui gerar a voz agora.',
        providerResponse.status, providerResponse.status >= 500,
      );
    }

    const contentType = providerResponse.headers.get('Content-Type') ?? 'audio/mpeg';
    const audio = await providerResponse.arrayBuffer();

    // ELEVEN2.1 -- salva no cache em segundo plano (best-effort). Falha de
    // storage/metadados NUNCA impede a resposta: o audio ja gerado sempre
    // volta ao usuario.
    if (cacheEnabled) {
      try {
        const cacheKey = await computeCacheKey({
          userId, voiceId, modelId, outputFormat, text,
        });
        const storagePath = `${userId}/${cacheKey}.mp3`;
        const uploaded = await uploadCacheAudio({
          supabaseUrl, serviceRoleKey, storagePath, audio, contentType,
        });
        if (uploaded) {
          const voiceIdHash = await sha256Hex(voiceId);
          await upsertCacheMetadata({
            supabaseUrl,
            serviceRoleKey,
            userId,
            cacheKey,
            storagePath,
            voiceIdHash,
            modelId,
            outputFormat,
            characterCount: text.length,
            ttlDays,
          });
        }
      } catch {
        // Nunca falha a resposta por causa do cache.
      }
    }

    return audioResponse(audio, contentType, 'MISS');
  } catch (error) {
    const timedOut = controller.signal.reason === 'timeout'
      || (error instanceof DOMException && error.name === 'AbortError');
    return providerErrorResponse(
      timedOut ? 504 : 502,
      timedOut ? 'PROVIDER_TIMEOUT' : 'NETWORK_ERROR',
      timedOut ? 'A geração de voz demorou demais.' : 'Não foi possível conectar ao provedor de voz.',
      null,
      true,
    );
  } finally {
    clearTimeout(timeout);
  }
});
