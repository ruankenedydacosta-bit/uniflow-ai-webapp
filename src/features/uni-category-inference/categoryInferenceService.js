import { UNI_LLM_FUNCTION_NAME } from '../uni-llm/uniLlmProvider.js';
import { CATEGORY_INFERENCE_TIMEOUT_MS } from './categoryInferenceConfig.js';
import { validateCategoryInferenceResponse } from './categoryInferenceContract.js';
import { buildCategoryInferencePayload } from './categoryInferencePayload.js';

// BLOCO D: chama a MESMA Edge Function ja usada pelo chat (uni-chat-llm),
// so com mode='category_inference' -- nenhuma nova funcao/endpoint, nenhum
// novo secret, nenhuma nova variavel de ambiente. Contrato:
// infer(input) -> { inference, error }. NUNCA lanca; qualquer falha
// (rede, timeout, HTTP, JSON invalido, resposta fora do contrato) volta
// como { inference: null, error }, para o chamador cair no fluxo
// deterministico existente sem quebrar o registro da transacao.
export function createCategoryInferenceService({
  supabase,
  supabaseUrl,
  supabaseAnonKey,
  enabled = false,
  fetchImpl = globalThis.fetch,
  runtime = globalThis,
  timeoutMs = CATEGORY_INFERENCE_TIMEOUT_MS,
} = {}) {
  function isSupported() {
    return Boolean(enabled && supabase && supabaseUrl && supabaseAnonKey && fetchImpl);
  }

  async function infer({ description, transactionType, categories } = {}) {
    if (!isSupported()) {
      return { inference: null, error: { code: 'UNSUPPORTED', message: 'category_inference_unavailable' } };
    }

    const payload = buildCategoryInferencePayload({ description, transactionType, categories });
    if (!payload.description || payload.categories.length === 0) {
      return { inference: null, error: { code: 'INSUFFICIENT_INPUT', message: 'category_inference_insufficient_input' } };
    }

    let accessToken;
    try {
      const sessionResult = await supabase.auth.getSession();
      accessToken = sessionResult?.data?.session?.access_token ?? null;
    } catch {
      accessToken = null;
    }
    if (!accessToken) {
      return { inference: null, error: { code: 'UNAUTHORIZED', message: 'category_inference_auth_required' } };
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
        body: JSON.stringify({ mode: 'category_inference', categoryInference: payload }),
        signal: controller.signal,
      });
    } catch {
      const code = controller.signal.reason === 'timeout' ? 'TIMEOUT' : 'NETWORK';
      return { inference: null, error: { code, message: 'category_inference_request_failed' } };
    } finally {
      runtime.clearTimeout?.(timeout);
    }

    if (!response.ok) {
      const code = response.status === 401 ? 'UNAUTHORIZED'
        : response.status === 403 ? 'FORBIDDEN'
          : response.status === 429 ? 'RATE_LIMIT'
            : response.status === 503 ? 'NOT_CONFIGURED'
              : response.status === 504 ? 'TIMEOUT' : 'PROVIDER_ERROR';
      return { inference: null, error: { code, message: 'category_inference_request_rejected' } };
    }

    let data;
    try {
      data = await response.json();
    } catch {
      return { inference: null, error: { code: 'PARSE_ERROR', message: 'category_inference_bad_response' } };
    }

    const validation = validateCategoryInferenceResponse(data?.inference, {
      allowedCategoryIds: payload.categories.map((category) => category.id),
    });
    if (!validation.valid) {
      return { inference: null, error: { code: 'INVALID_RESPONSE', message: validation.reason } };
    }

    return { inference: validation.inference, error: null };
  }

  return { isSupported, infer };
}
