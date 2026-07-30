import { UNI_LLM_FUNCTION_NAME } from '../uni-llm/uniLlmProvider.js';
import { FINANCIAL_PLAN_TIMEOUT_MS } from './financialPlanConfig.js';
import { validateFinancialPlanResponse } from './financialPlanContract.js';
import { buildFinancialPlanPayload } from './financialPlanPayload.js';

// BLOCO E: chama a MESMA Edge Function ja usada pelo chat (uni-chat-llm),
// com mode='financial_plan' -- nenhuma nova funcao/endpoint, nenhum novo
// secret, nenhuma nova variavel de ambiente (mesmo padrao do Bloco D).
// Contrato: interpret(input) -> { plan, error }. NUNCA lanca; qualquer
// falha (rede, timeout, HTTP, JSON invalido, resposta fora do contrato)
// volta como { plan: null, error }, para o chamador cair no fluxo
// determinístico existente (parser de uma unica operacao) sem quebrar o
// registro manual.
export function createFinancialPlanService({
  supabase,
  supabaseUrl,
  supabaseAnonKey,
  enabled = false,
  fetchImpl = globalThis.fetch,
  runtime = globalThis,
  timeoutMs = FINANCIAL_PLAN_TIMEOUT_MS,
} = {}) {
  function isSupported() {
    return Boolean(enabled && supabase && supabaseUrl && supabaseAnonKey && fetchImpl);
  }

  async function interpret({
    phrase, pendingPlanSummary, accounts, categories, referenceDate, timezone,
  } = {}) {
    if (!isSupported()) {
      return { plan: null, error: { code: 'UNSUPPORTED', message: 'financial_plan_unavailable' } };
    }

    const payload = buildFinancialPlanPayload({
      phrase, pendingPlanSummary, accounts, categories, referenceDate, timezone,
    });
    if (!payload.phrase) {
      return { plan: null, error: { code: 'INSUFFICIENT_INPUT', message: 'financial_plan_insufficient_input' } };
    }

    let accessToken;
    try {
      const sessionResult = await supabase.auth.getSession();
      accessToken = sessionResult?.data?.session?.access_token ?? null;
    } catch {
      accessToken = null;
    }
    if (!accessToken) {
      return { plan: null, error: { code: 'UNAUTHORIZED', message: 'financial_plan_auth_required' } };
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
        body: JSON.stringify({ mode: 'financial_plan', financialPlan: payload }),
        signal: controller.signal,
      });
    } catch {
      const code = controller.signal.reason === 'timeout' ? 'TIMEOUT' : 'NETWORK';
      return { plan: null, error: { code, message: 'financial_plan_request_failed' } };
    } finally {
      runtime.clearTimeout?.(timeout);
    }

    if (!response.ok) {
      const code = response.status === 401 ? 'UNAUTHORIZED'
        : response.status === 403 ? 'FORBIDDEN'
          : response.status === 429 ? 'RATE_LIMIT'
            : response.status === 503 ? 'NOT_CONFIGURED'
              : response.status === 504 ? 'TIMEOUT' : 'PROVIDER_ERROR';
      return { plan: null, error: { code, message: 'financial_plan_request_rejected' } };
    }

    let data;
    try {
      data = await response.json();
    } catch {
      return { plan: null, error: { code: 'PARSE_ERROR', message: 'financial_plan_bad_response' } };
    }

    const validation = validateFinancialPlanResponse(data?.plan);
    if (!validation.valid) {
      return { plan: null, error: { code: 'INVALID_RESPONSE', message: validation.reason } };
    }

    return { plan: validation.plan, error: null };
  }

  return { isSupported, interpret };
}
