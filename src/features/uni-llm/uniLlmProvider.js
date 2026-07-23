// Provider de LLM da Uni (contrato desacoplado).
//
// Contrato: generateResponse({ system, messages }) -> { text, usage, error }
// NUNCA lanca; sempre resolve com um objeto. Em qualquer falha retorna
// { text: null, error: { code, message } } para o orquestrador cair no fallback.
//
// A chamada real ao provedor (ex.: OpenAI) acontece dentro da Edge Function
// `uni-chat-llm`. Este provider apenas orquestra auth, timeout/cancelamento e
// mapeamento de erros. A troca de provedor no futuro e feita na Edge Function,
// sem reescrever o chat.

export const UNI_LLM_FUNCTION_NAME = 'uni-chat-llm';
export const DEFAULT_LLM_TIMEOUT_MS = 20000;

export function createUniLlmProvider({
  supabase,
  supabaseUrl,
  supabaseAnonKey,
  enabled = false,
  fetchImpl = globalThis.fetch,
  runtime = globalThis,
  timeoutMs = DEFAULT_LLM_TIMEOUT_MS,
} = {}) {
  function isSupported() {
    return Boolean(enabled && supabase && supabaseUrl && supabaseAnonKey && fetchImpl);
  }

  async function generateResponse({ system, messages } = {}) {
    if (!isSupported()) {
      return { text: null, usage: null, error: { code: 'UNSUPPORTED', message: 'llm_unavailable' } };
    }

    let accessToken;
    try {
      const sessionResult = await supabase.auth.getSession();
      accessToken = sessionResult?.data?.session?.access_token ?? null;
    } catch {
      accessToken = null;
    }
    if (!accessToken) {
      return { text: null, usage: null, error: { code: 'UNAUTHORIZED', message: 'llm_auth_required' } };
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
        body: JSON.stringify({ system, messages }),
        signal: controller.signal,
      });
    } catch (error) {
      const timedOut = controller.signal.reason === 'timeout' || error?.name === 'AbortError';
      return {
        text: null,
        usage: null,
        error: { code: timedOut ? 'TIMEOUT' : 'NETWORK', message: 'llm_request_failed' },
      };
    } finally {
      runtime.clearTimeout?.(timeout);
    }

    if (!response.ok) {
      const code = response.status === 401 ? 'UNAUTHORIZED'
        : response.status === 403 ? 'FORBIDDEN'
          : response.status === 429 ? 'RATE_LIMIT'
            : response.status === 503 ? 'NOT_CONFIGURED'
              : response.status === 504 ? 'TIMEOUT' : 'PROVIDER_ERROR';
      return { text: null, usage: null, error: { code, message: 'llm_request_rejected' } };
    }

    let data;
    try {
      data = await response.json();
    } catch {
      return { text: null, usage: null, error: { code: 'PARSE_ERROR', message: 'llm_bad_response' } };
    }

    const text = typeof data?.text === 'string' ? data.text : null;
    if (!text) {
      return { text: null, usage: null, error: { code: 'EMPTY', message: 'llm_empty_response' } };
    }

    return { text, usage: data?.usage ?? null, error: null };
  }

  return { providerName: 'uni-chat-llm', isSupported, generateResponse };
}
