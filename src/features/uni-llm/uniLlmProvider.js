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

// OPENAI1: numero maximo de tentativas para uma falha puramente de rede (o
// fetch nem chegou a obter uma resposta HTTP -- ex.: DNS, conexao recusada,
// offline momentaneo). NUNCA reaplicado a TIMEOUT (dobraria a espera do
// usuario) nem a qualquer erro HTTP (401/403/429/5xx): esses ja tem
// significado proprio e re-tentar nao muda o resultado (ou piora, no caso
// de 429). "Retry apenas quando apropriado" == apenas aqui.
const MAX_NETWORK_RETRIES = 1;

export function createUniLlmProvider({
  supabase,
  supabaseUrl,
  supabaseAnonKey,
  enabled = false,
  fetchImpl = globalThis.fetch,
  runtime = globalThis,
  timeoutMs = DEFAULT_LLM_TIMEOUT_MS,
} = {}) {
  // OPENAI1: referencia ao AbortController da requisicao EM ANDAMENTO, para
  // que cancel() (chamado de fora, ex.: usuario envia outra mensagem ou sai
  // do chat) consiga abortar sem precisar de um segundo mecanismo paralelo
  // de cancelamento -- reaproveita o MESMO controller que ja existe para o
  // timeout interno.
  let currentController = null;

  function isSupported() {
    return Boolean(enabled && supabase && supabaseUrl && supabaseAnonKey && fetchImpl);
  }

  // OPENAI1: checagem de disponibilidade sem disparar uma chamada real ao
  // provedor (que exigiria consumir cota/tempo por nada). E uma checagem de
  // CAPACIDADE (flag + backend configurados no frontend) -- a existencia
  // real da credencial do provedor so e confirmada pela Edge Function no
  // momento de uma chamada de fato (resposta 503 == NOT_CONFIGURED).
  async function healthCheck() {
    if (!enabled) {
      return { available: false, reason: 'DISABLED' };
    }
    if (!supabase || !supabaseUrl || !supabaseAnonKey || !fetchImpl) {
      return { available: false, reason: 'BACKEND_NOT_CONFIGURED' };
    }
    return { available: true, reason: null };
  }

  // OPENAI1: cancela a requisicao em andamento, se houver. Idempotente e
  // seguro chamar sem uma requisicao ativa (currentController nulo).
  function cancel() {
    currentController?.abort('cancelled');
  }

  async function performRequest({ system, messages, accessToken, mode, productContext }) {
    const controller = new AbortController();
    currentController = controller;
    const timeout = runtime.setTimeout?.(() => controller.abort('timeout'), timeoutMs);

    try {
      // OPENAI3: `mode`/`productContext` so existem no corpo quando informados
      // (modo suporte). JSON.stringify omite chaves undefined -- para o
      // chat financeiro (chamada sem esses parametros) o corpo continua
      // byte-identico ao de OPENAI1/OPENAI2: { system, messages }.
      const response = await fetchImpl(`${supabaseUrl}/functions/v1/${UNI_LLM_FUNCTION_NAME}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: supabaseAnonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ system, messages, mode, productContext }),
        signal: controller.signal,
      });
      return { ok: true, response };
    } catch {
      const reason = controller.signal.reason;
      const code = reason === 'timeout' ? 'TIMEOUT' : reason === 'cancelled' ? 'CANCELLED' : 'NETWORK';
      return { ok: false, code };
    } finally {
      runtime.clearTimeout?.(timeout);
      if (currentController === controller) currentController = null;
    }
  }

  async function generateResponse({ system, messages, mode, productContext } = {}) {
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

    let attempt = await performRequest({ system, messages, accessToken, mode, productContext });
    let retries = 0;
    while (!attempt.ok && attempt.code === 'NETWORK' && retries < MAX_NETWORK_RETRIES) {
      retries += 1;
      attempt = await performRequest({ system, messages, accessToken, mode, productContext });
    }

    if (!attempt.ok) {
      return { text: null, usage: null, error: { code: attempt.code, message: 'llm_request_failed' } };
    }

    const { response } = attempt;
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

  return {
    providerName: 'uni-chat-llm', isSupported, generateResponse, healthCheck, cancel,
  };
}
