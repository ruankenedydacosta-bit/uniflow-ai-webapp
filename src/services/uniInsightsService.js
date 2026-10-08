// Cliente da Edge Function uni-insights (#122): a Uni escreve as frases da
// Leitura do mês a partir dos números já calculados no app. Nunca lança:
// qualquer falha volta como { leituras: null, error } e a Home mostra a
// leitura calculada.

import { isSupabaseConfigured, supabase, supabaseAnonKey, supabaseUrl } from './supabaseClient.js';

export const UNI_INSIGHTS_FUNCTION_NAME = 'uni-insights';

// Sem cache, a Home mostra o carregamento enquanto espera. Passou disso, a
// leitura calculada entra no lugar.
export const UNI_INSIGHTS_TIMEOUT_MS = 8000;

const CODIGO_POR_STATUS = Object.freeze({
  400: 'INVALID_REQUEST',
  401: 'UNAUTHORIZED',
  429: 'RATE_LIMIT',
  503: 'NOT_CONFIGURED',
  504: 'TIMEOUT',
});

export async function requestUniInsights(payload, {
  client = supabase,
  url = supabaseUrl,
  anonKey = supabaseAnonKey,
  configured = isSupabaseConfigured,
  fetchImpl = globalThis.fetch,
  runtime = globalThis,
  timeoutMs = UNI_INSIGHTS_TIMEOUT_MS,
} = {}) {
  if (!configured || !client || !fetchImpl) return { leituras: null, error: { code: 'UNSUPPORTED' } };

  let accessToken;
  try {
    const sessionResult = await client.auth.getSession();
    accessToken = sessionResult?.data?.session?.access_token ?? null;
  } catch {
    accessToken = null;
  }
  if (!accessToken) return { leituras: null, error: { code: 'UNAUTHORIZED' } };

  const controller = new AbortController();
  const timeout = runtime.setTimeout?.(() => controller.abort('timeout'), timeoutMs);

  let response;
  try {
    response = await fetchImpl(`${url}/functions/v1/${UNI_INSIGHTS_FUNCTION_NAME}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch {
    return { leituras: null, error: { code: controller.signal.reason === 'timeout' ? 'TIMEOUT' : 'NETWORK' } };
  } finally {
    runtime.clearTimeout?.(timeout);
  }

  if (!response.ok) {
    return { leituras: null, error: { code: CODIGO_POR_STATUS[response.status] ?? 'PROVIDER_ERROR' } };
  }

  try {
    const data = await response.json();
    if (!Array.isArray(data?.leituras) || data.leituras.length === 0) {
      return { leituras: null, error: { code: 'INVALID_RESPONSE' } };
    }
    return { leituras: data.leituras, error: null };
  } catch {
    return { leituras: null, error: { code: 'PARSE_ERROR' } };
  }
}
