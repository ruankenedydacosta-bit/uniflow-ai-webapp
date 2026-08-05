// Sprint 1 (IA Conversacional): ponte "fato estruturado -> frase natural".
//
// Mesmo padrão de src/features/uni-category-inference/categoryInferenceService.js
// (BLOCO D) -- chama a MESMA Edge Function já usada pelo chat (uni-chat-llm),
// só com mode='phrase_fact', reaproveitando UNI_LLM_FUNCTION_NAME. Nenhuma
// nova função, nenhum novo secret, nenhuma nova variável de ambiente.
//
// Contrato: phraseFact({fact}) -> { text, error }. NUNCA lança; qualquer
// falha (flag desligada, rede, timeout, HTTP, resposta vazia/inválida)
// volta como { text: null, error }, para o chamador preservar o texto
// canônico já existente (uniResponseBuilder.js) sem qualquer regressão.
//
// `enabled` já deve vir combinado com a flag VITE_UNI_LLM_PHRASING_ENABLED
// pelo chamador (mesmo padrão de uniLlm.enabled/categoryInferenceService --
// leitura de env sempre no hook/componente, nunca dentro do service).
import { UNI_LLM_FUNCTION_NAME } from './uniLlmProvider.js';
import { looksLikeStructuredFinancialAction } from './llmResponseGuard.js';

export const PHRASE_STRUCTURED_FACT_TIMEOUT_MS = 8000;
const MAX_PHRASED_TEXT_CHARS = 300;

export function createPhraseStructuredFactService({
  supabase,
  supabaseUrl,
  supabaseAnonKey,
  enabled = false,
  fetchImpl = globalThis.fetch,
  runtime = globalThis,
  timeoutMs = PHRASE_STRUCTURED_FACT_TIMEOUT_MS,
} = {}) {
  function isSupported() {
    return Boolean(enabled && supabase && supabaseUrl && supabaseAnonKey && fetchImpl);
  }

  async function phraseFact({ fact } = {}) {
    if (!isSupported()) {
      return { text: null, error: { code: 'UNSUPPORTED', message: 'phrase_fact_unavailable' } };
    }
    if (!fact || typeof fact !== 'object' || Array.isArray(fact)) {
      return { text: null, error: { code: 'INSUFFICIENT_INPUT', message: 'phrase_fact_missing_fact' } };
    }

    let accessToken;
    try {
      const sessionResult = await supabase.auth.getSession();
      accessToken = sessionResult?.data?.session?.access_token ?? null;
    } catch {
      accessToken = null;
    }
    if (!accessToken) {
      return { text: null, error: { code: 'UNAUTHORIZED', message: 'phrase_fact_auth_required' } };
    }

    const controller = new AbortController();
    const timeout = runtime.setTimeout?.(() => controller.abort('timeout'), timeoutMs);

    let response;
    try {
      response = await fetchImpl(`${supabaseUrl}/functions/v1/${UNI_LLM_FUNCTION_NAME}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: supabaseAnonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mode: 'phrase_fact', phraseFact: { fact } }),
        signal: controller.signal,
      });
    } catch {
      const code = controller.signal.reason === 'timeout' ? 'TIMEOUT' : 'NETWORK';
      return { text: null, error: { code, message: 'phrase_fact_request_failed' } };
    } finally {
      runtime.clearTimeout?.(timeout);
    }

    if (!response.ok) {
      const code = response.status === 401 ? 'UNAUTHORIZED'
        : response.status === 403 ? 'FORBIDDEN'
          : response.status === 429 ? 'RATE_LIMIT'
            : response.status === 503 ? 'NOT_CONFIGURED'
              : response.status === 504 ? 'TIMEOUT' : 'PROVIDER_ERROR';
      return { text: null, error: { code, message: 'phrase_fact_request_rejected' } };
    }

    let data;
    try {
      data = await response.json();
    } catch {
      return { text: null, error: { code: 'PARSE_ERROR', message: 'phrase_fact_bad_response' } };
    }

    const text = typeof data?.text === 'string' ? data.text.trim().slice(0, MAX_PHRASED_TEXT_CHARS) : '';
    if (!text) {
      return { text: null, error: { code: 'EMPTY', message: 'phrase_fact_empty_response' } };
    }
    // Mesma defesa anti-alucinação/anti-ação-estruturada já usada no resto
    // do chat (llmResponseGuard.js) -- uma frase de clarificação nunca pode
    // se parecer com um comando/JSON de ação.
    if (looksLikeStructuredFinancialAction(text)) {
      return { text: null, error: { code: 'INVALID_RESPONSE', message: 'phrase_fact_looks_structured' } };
    }

    return { text, error: null };
  }

  return { isSupported, phraseFact };
}
