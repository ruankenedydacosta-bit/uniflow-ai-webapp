// Cliente da Edge Function uni-insights (#122): a Uni escreve as frases da
// Leitura do mês a partir dos números já calculados no app. Nunca lança:
// qualquer falha volta como { leituras: null, error } e a Home mostra a
// leitura calculada.

import { isSupabaseConfigured, supabase, supabaseAnonKey, supabaseUrl } from './supabaseClient.js';

export const UNI_INSIGHTS_FUNCTION_NAME = 'uni-insights';

// Sem cache, a Home mostra o carregamento enquanto espera. Passou disso, a
// leitura calculada entra no lugar. A função para o modelo em 7 s, antes
// deste prazo, para a leitura paga não chegar depois de o app desistir.
export const UNI_INSIGHTS_TIMEOUT_MS = 10000;

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
  const failure = (code) => ({ leituras: null, error: { code } });

  // O prazo vale até o corpo inteiro chegar: conexão que trava depois dos
  // cabeçalhos também cai na leitura calculada.
  try {
    const response = await fetchImpl(`${url}/functions/v1/${UNI_INSIGHTS_FUNCTION_NAME}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) return failure(CODIGO_POR_STATUS[response.status] ?? 'PROVIDER_ERROR');

    let data;
    try {
      data = await response.json();
    } catch {
      return failure(controller.signal.aborted ? 'TIMEOUT' : 'PARSE_ERROR');
    }
    if (!Array.isArray(data?.leituras) || data.leituras.length === 0) return failure('INVALID_RESPONSE');
    return { leituras: data.leituras, error: null };
  } catch {
    return failure(controller.signal.reason === 'timeout' ? 'TIMEOUT' : 'NETWORK');
  } finally {
    runtime.clearTimeout?.(timeout);
  }
}
