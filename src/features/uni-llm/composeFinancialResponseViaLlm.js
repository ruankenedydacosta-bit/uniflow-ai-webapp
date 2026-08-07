// Sprint 4 Ciclo 3 (Bloco 4.4): composição natural REAL via LLM. Chama a
// MESMA Edge Function já usada pelo chat (uni-chat-llm), só com
// mode='financial_response_compose' -- mesmo padrão de
// interpretFinancialIntent.js/phraseStructuredFact.js.
//
// Contrato: composeFinancialResponseViaLlm({...}) -> { text, error }.
// NUNCA lança; qualquer falha (flag desligada, rede, timeout, HTTP, texto
// vazio/malformado) volta como { text: null, error }, para o chamador cair
// no composer determinístico existente (composeNaturalFinancialResponse.js)
// sem nenhuma regressão -- exatamente o fallback exigido pelo Bloco 4.4.5.
import { UNI_LLM_FUNCTION_NAME } from './uniLlmProvider.js';

export const FINANCIAL_RESPONSE_COMPOSE_TIMEOUT_MS = 6000;
const MAX_FACTS_JSON_CHARS = 900;

function safeStringifyFacts(facts) {
  if (!facts || typeof facts !== 'object') return null;
  try {
    const json = JSON.stringify(facts);
    return typeof json === 'string' ? json.slice(0, MAX_FACTS_JSON_CHARS) : null;
  } catch {
    return null;
  }
}

export function createFinancialResponseComposer({
  supabase,
  supabaseUrl,
  supabaseAnonKey,
  enabled = false,
  fetchImpl = globalThis.fetch,
  runtime = globalThis,
  timeoutMs = FINANCIAL_RESPONSE_COMPOSE_TIMEOUT_MS,
} = {}) {
  // Fase 1 (correção do kill switch, Bloco 4.10): `enabled` pode ser um
  // booleano (comportamento original) OU uma função (thunk). Quando é uma
  // função, ela é chamada A CADA verificação -- nunca memoizada -- para que
  // um kill switch runtime (ex.: isLlmResponseComposerKillSwitchActive(),
  // que lê localStorage) tenha efeito IMEDIATO, mesmo numa aba já aberta
  // (o serviço em si só é criado uma vez, via useMemo, em UniChatPage.jsx).
  // Um booleano estático continua funcionando exatamente como antes.
  function resolveEnabled() {
    try {
      return Boolean(typeof enabled === 'function' ? enabled() : enabled);
    } catch {
      return false;
    }
  }

  function isSupported() {
    return Boolean(resolveEnabled() && supabase && supabaseUrl && supabaseAnonKey && fetchImpl);
  }

  async function composeFinancialResponseViaLlm({
    userIntent = null,
    operation = null,
    structuredFacts = null,
    conversationStyle = 'simple',
    emotionalContext = null,
    explanationRequest = null,
  } = {}) {
    if (!isSupported()) {
      return { text: null, error: { code: 'UNSUPPORTED', message: 'financial_response_compose_unavailable' } };
    }
    const factsJson = safeStringifyFacts(structuredFacts);
    if (!factsJson || factsJson === '{}' || factsJson === 'null') {
      return { text: null, error: { code: 'INSUFFICIENT_INPUT', message: 'financial_response_compose_missing_facts' } };
    }

    let accessToken;
    try {
      const sessionResult = await supabase.auth.getSession();
      accessToken = sessionResult?.data?.session?.access_token ?? null;
    } catch {
      accessToken = null;
    }
    if (!accessToken) {
      return { text: null, error: { code: 'UNAUTHORIZED', message: 'financial_response_compose_auth_required' } };
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
        body: JSON.stringify({
          mode: 'financial_response_compose',
          financialResponseCompose: {
            userIntent: typeof userIntent === 'string' ? userIntent.slice(0, 60) : null,
            operation: typeof operation === 'string' ? operation.slice(0, 20) : null,
            structuredFacts,
            conversationStyle: typeof conversationStyle === 'string' ? conversationStyle.slice(0, 20) : 'simple',
            emotionalContext: emotionalContext ? true : null,
            explanationRequest: explanationRequest ? true : null,
          },
        }),
        signal: controller.signal,
      });
    } catch {
      const code = controller.signal.reason === 'timeout' ? 'TIMEOUT' : 'NETWORK';
      return { text: null, error: { code, message: 'financial_response_compose_request_failed' } };
    } finally {
      runtime.clearTimeout?.(timeout);
    }

    if (!response.ok) {
      const code = response.status === 401 ? 'UNAUTHORIZED'
        : response.status === 403 ? 'FORBIDDEN'
          : response.status === 429 ? 'RATE_LIMIT'
            : response.status === 422 ? 'INVALID_RESPONSE'
              : response.status === 503 ? 'NOT_CONFIGURED'
                : response.status === 504 ? 'TIMEOUT' : 'PROVIDER_ERROR';
      return { text: null, error: { code, message: 'financial_response_compose_request_rejected' } };
    }

    let data;
    try {
      data = await response.json();
    } catch {
      return { text: null, error: { code: 'PARSE_ERROR', message: 'financial_response_compose_bad_response' } };
    }

    const text = typeof data?.text === 'string' ? data.text.trim() : '';
    // Sprint 4 Ciclo 4 (Bloco 4.9) -- a Edge Function já calcula e devolve
    // `usage` (tokens reais de entrada/saída) desde a Sprint 1; só nunca
    // tinha sido repassado ao cliente. Puramente aditivo: nenhum consumidor
    // existente que desestrutura `{ text, error }` é afetado.
    const usage = data?.usage && typeof data.usage === 'object'
      ? {
        promptTokens: Number.isFinite(data.usage.promptTokens) ? data.usage.promptTokens : null,
        completionTokens: Number.isFinite(data.usage.completionTokens) ? data.usage.completionTokens : null,
      }
      : null;
    if (!text) {
      return { text: null, error: { code: 'INVALID_RESPONSE', message: 'financial_response_compose_empty' }, usage };
    }

    return { text, error: null, usage };
  }

  return { isSupported, composeFinancialResponseViaLlm };
}
