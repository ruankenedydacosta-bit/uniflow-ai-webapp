// Sprint 3 (Interpretação Semântica): interpreta a intenção financeira de
// uma frase livre, chamando a MESMA Edge Function já usada pelo chat
// (uni-chat-llm), só com mode='financial_intent' -- mesmo padrão de
// src/features/uni-llm/phraseStructuredFact.js e
// src/features/uni-category-inference/categoryInferenceService.js.
// Nenhuma nova função, nenhum novo secret, nenhuma nova variável de
// ambiente além da flag de rollout (VITE_UNI_SEMANTIC_INTENT_ENABLED).
//
// Contrato: interpretFinancialIntent({...}) -> { interpretation, error }.
// NUNCA lança; qualquer falha (flag desligada, rede, timeout, HTTP, JSON
// fora do contrato) volta como { interpretation: null, error }, para o
// chamador cair no comportamento seguro anterior (pipeline determinístico
// / handleUnresolvedMessage) sem nenhuma regressão.
import { UNI_LLM_FUNCTION_NAME } from './uniLlmProvider.js';
import { validateFinancialIntentResponse } from './financialIntentSchema.js';

export const FINANCIAL_INTENT_TIMEOUT_MS = 8000;
const MAX_HISTORY_MESSAGES = 6;
const MAX_NAME_ENTRIES = 40;

function sanitizeHistory(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .slice(-MAX_HISTORY_MESSAGES)
    .filter((message) => message && typeof message.text === 'string' && (message.from === 'user' || message.from === 'uni'))
    .map((message) => ({ from: message.from, text: message.text.slice(0, 400) }));
}

function sanitizeNames(list) {
  if (!Array.isArray(list)) return [];
  return list
    .slice(0, MAX_NAME_ENTRIES)
    .map((name) => (typeof name === 'string' ? name : null))
    .filter(Boolean);
}

export function createFinancialIntentInterpreter({
  supabase,
  supabaseUrl,
  supabaseAnonKey,
  enabled = false,
  fetchImpl = globalThis.fetch,
  runtime = globalThis,
  timeoutMs = FINANCIAL_INTENT_TIMEOUT_MS,
} = {}) {
  function isSupported() {
    return Boolean(enabled && supabase && supabaseUrl && supabaseAnonKey && fetchImpl);
  }

  async function interpretFinancialIntent({
    text,
    conversationHistory = [],
    conversationalMemory = '',
    referenceDate = null,
    accounts = [],
    categories = [],
    availableTools = [],
    availableCapabilities = [],
  } = {}) {
    if (!isSupported()) {
      return { interpretation: null, error: { code: 'UNSUPPORTED', message: 'financial_intent_unavailable' } };
    }
    const cleanText = typeof text === 'string' ? text.trim() : '';
    if (!cleanText) {
      return { interpretation: null, error: { code: 'INSUFFICIENT_INPUT', message: 'financial_intent_missing_text' } };
    }

    let accessToken;
    try {
      const sessionResult = await supabase.auth.getSession();
      accessToken = sessionResult?.data?.session?.access_token ?? null;
    } catch {
      accessToken = null;
    }
    if (!accessToken) {
      return { interpretation: null, error: { code: 'UNAUTHORIZED', message: 'financial_intent_auth_required' } };
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
          mode: 'financial_intent',
          financialIntent: {
            text: cleanText.slice(0, 400),
            conversationHistory: sanitizeHistory(conversationHistory),
            conversationalMemory: typeof conversationalMemory === 'string' ? conversationalMemory.slice(0, 300) : '',
            referenceDate: typeof referenceDate === 'string' ? referenceDate : null,
            accounts: sanitizeNames(accounts),
            categories: sanitizeNames(categories),
            availableTools: sanitizeNames(availableTools),
            // Sprint 4 (Bloco 4.2.3): catálogo REAL de capacidades
            // disponíveis -- nunca deixa a LLM "descobrir" ou anunciar uma
            // capacidade que não existe no registro central.
            availableCapabilities: sanitizeNames(availableCapabilities),
          },
        }),
        signal: controller.signal,
      });
    } catch {
      const code = controller.signal.reason === 'timeout' ? 'TIMEOUT' : 'NETWORK';
      return { interpretation: null, error: { code, message: 'financial_intent_request_failed' } };
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
      return { interpretation: null, error: { code, message: 'financial_intent_request_rejected' } };
    }

    let data;
    try {
      data = await response.json();
    } catch {
      return { interpretation: null, error: { code: 'PARSE_ERROR', message: 'financial_intent_bad_response' } };
    }

    // Sprint 3 (Interpretação Semântica): defesa em profundidade -- a Edge
    // Function já validou o contrato, mas a resposta HTTP nunca é confiada
    // cegamente. Qualquer JSON fora do contrato cai no fallback seguro.
    const validated = validateFinancialIntentResponse(data?.interpretation);
    // Sprint 4 Ciclo 4 (Bloco 4.9) -- mesmo padrão de
    // composeFinancialResponseViaLlm.js: repassa `usage` (tokens reais),
    // puramente aditivo, nenhum consumidor existente é afetado.
    const usage = data?.usage && typeof data.usage === 'object'
      ? {
        promptTokens: Number.isFinite(data.usage.promptTokens) ? data.usage.promptTokens : null,
        completionTokens: Number.isFinite(data.usage.completionTokens) ? data.usage.completionTokens : null,
      }
      : null;
    if (!validated.valid) {
      return { interpretation: null, error: { code: 'INVALID_RESPONSE', message: `financial_intent_${validated.reason}` }, usage };
    }

    return { interpretation: validated.interpretation, error: null, usage };
  }

  return { isSupported, interpretFinancialIntent };
}
