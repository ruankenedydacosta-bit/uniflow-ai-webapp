// BILLING2 (Bloco Asaas 2): cliente HTTP unico e compartilhado para a API
// Asaas, usado por todas as Edge Functions de billing. Nenhuma outra Edge
// Function neste projeto precisou de codigo compartilhado ate agora (cada
// uma e autocontida) -- este e o primeiro modulo em `_shared/`, seguindo o
// padrao oficial do Supabase para codigo reaproveitado entre Edge Functions
// (import relativo resolvido no bundle de cada função).
//
// Fontes oficiais consultadas nesta implementacao (nunca memoria, blog ou
// SDK nao oficial):
// - Autenticacao/headers/URLs: https://docs.asaas.com/docs/authentication-2
// - Criar cliente:              https://docs.asaas.com/reference/create-new-customer
// - Listar clientes (filtro):   https://docs.asaas.com/reference/list-customers
// - Criar assinatura:           https://docs.asaas.com/reference/create-new-subscription
// - Consultar assinatura:       https://docs.asaas.com/reference/retrieve-a-single-subscription
// - Cancelar assinatura:        (DELETE /v3/subscriptions/{id}, mesmo padrao REST documentado)
// - Tokenizar cartao:           https://docs.asaas.com/reference/credit-card-tokenization
// - Autorizacao Pix Automatico: https://docs.asaas.com/reference/criar-uma-autorizacao-pix-automatico
// - Webhooks:                   https://docs.asaas.com/docs/about-webhooks

export const ASAAS_SANDBOX_BASE_URL = 'https://api-sandbox.asaas.com/v3';
export const ASAAS_PRODUCTION_BASE_URL = 'https://api.asaas.com/v3';

const DEFAULT_TIMEOUT_MS = 15_000;

// Chaves cujo VALOR nunca pode aparecer em log/erro, em qualquer nivel de
// aninhamento -- API key, token de cartao completo, CVV, headers de auth.
// Comparacao sempre em minusculas (nomes de campo variam entre snake_case e
// camelCase conforme a origem: nosso codigo vs. a resposta da Asaas).
const SENSITIVE_LOG_KEYS = new Set([
  'access_token', 'accesstoken', 'apikey', 'api_key', 'authtoken', 'auth_token',
  'creditcard', 'creditcardnumber', 'creditcardcvv', 'cvv', 'ccv',
  'creditcardholderinfo', 'creditcardtoken', 'password', 'secret',
  'authorization',
]);

// BILLING2: sanitizacao recursiva para log/detalhes de erro -- nunca deixa
// vazar o valor de um campo sensivel, em nenhum nivel de aninhamento
// (a resposta de erro da Asaas pode ecoar de volta parte do payload
// enviado, incluindo dados de cartao se algum dia formos enviar raw).
export function sanitizeForLog(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[REDACTED_MAX_DEPTH]';
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeForLog(item, depth + 1));
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = SENSITIVE_LOG_KEYS.has(key.toLowerCase())
        ? '[REDACTED]'
        : sanitizeForLog(val, depth + 1);
    }
    return result;
  }
  return value;
}

interface AsaasErrorLogDetails {
  [key: string]: unknown;
}

// BILLING2: erros tipados pedidos na tarefa. Cada um carrega:
// - code: identificador interno estavel (para o chamador decidir o que fazer);
// - httpStatus: status HTTP SEGURO para responder ao cliente do nosso app
//   (nunca o status bruto da Asaas -- ex.: um 401 da Asaas significa que
//   NOSSA credencial esta errada, nunca que o usuario final nao esta
//   autenticado; expor 401 nesse caso confundiria o chamador);
// - providerStatus: o status HTTP realmente recebido da Asaas, quando houver
//   (para log/depuracao interna, nunca para decidir o que mostrar ao usuario);
// - operationId: qual operacao do cliente estava em andamento (createCustomer,
//   createSubscription, etc.) -- correlaciona com os logs da Edge Function;
// - logDetails: versao ja sanitizada (sanitizeForLog) do corpo de erro/causa,
//   segura para `console.log` -- nunca a API key, nunca dado de cartao.
export class AsaasConfigurationError extends Error {
  code = 'ASAAS_CONFIGURATION_ERROR';
  httpStatus = 503;
  operationId: string;
  logDetails: AsaasErrorLogDetails;

  constructor(message: string, operationId = 'configuration', logDetails: AsaasErrorLogDetails = {}) {
    super(message);
    this.name = 'AsaasConfigurationError';
    this.operationId = operationId;
    this.logDetails = sanitizeForLog(logDetails) as AsaasErrorLogDetails;
  }
}

export class AsaasValidationError extends Error {
  code = 'ASAAS_VALIDATION_ERROR';
  httpStatus = 400;
  operationId: string;
  logDetails: AsaasErrorLogDetails;

  constructor(message: string, operationId: string, logDetails: AsaasErrorLogDetails = {}) {
    super(message);
    this.name = 'AsaasValidationError';
    this.operationId = operationId;
    this.logDetails = sanitizeForLog(logDetails) as AsaasErrorLogDetails;
  }
}

export class AsaasTimeoutError extends Error {
  code = 'ASAAS_TIMEOUT';
  httpStatus = 504;
  providerStatus: null = null;
  operationId: string;
  logDetails: AsaasErrorLogDetails = {};

  constructor(operationId: string) {
    super('Tempo limite excedido ao comunicar com a Asaas.');
    this.name = 'AsaasTimeoutError';
    this.operationId = operationId;
  }
}

export class AsaasNetworkError extends Error {
  code = 'ASAAS_NETWORK_ERROR';
  httpStatus = 502;
  providerStatus: null = null;
  operationId: string;
  logDetails: AsaasErrorLogDetails;

  constructor(operationId: string, cause: unknown) {
    super('Falha de rede ao comunicar com a Asaas.');
    this.name = 'AsaasNetworkError';
    this.operationId = operationId;
    this.logDetails = { cause: sanitizeForLog(cause instanceof Error ? cause.message : String(cause)) };
  }
}

export class AsaasApiError extends Error {
  code = 'ASAAS_API_ERROR';
  httpStatus: number;
  providerStatus: number;
  operationId: string;
  logDetails: AsaasErrorLogDetails;

  constructor({
    message,
    operationId,
    providerStatus,
    httpStatus,
    logDetails = {},
  }: {
    message: string;
    operationId: string;
    providerStatus: number;
    httpStatus: number;
    logDetails?: AsaasErrorLogDetails;
  }) {
    super(message);
    this.name = 'AsaasApiError';
    this.operationId = operationId;
    this.providerStatus = providerStatus;
    this.httpStatus = httpStatus;
    this.logDetails = sanitizeForLog(logDetails) as AsaasErrorLogDetails;
  }
}

// BILLING2: mapeamento de status da Asaas -> status SEGURO para responder ao
// nosso proprio chamador. 401/403 da Asaas nunca vira 401/403 para o
// usuario final -- isso significaria "nossa API key esta errada", um
// problema de configuracao do backend, nunca do usuario.
function mapProviderStatusToSafeHttpStatus(providerStatus: number): number {
  if (providerStatus === 400 || providerStatus === 404) return providerStatus;
  if (providerStatus === 401 || providerStatus === 403) return 503;
  if (providerStatus === 429) return 429;
  if (providerStatus >= 500) return 502;
  return 502;
}

function mapProviderStatusToSafeMessage(providerStatus: number): string {
  if (providerStatus === 400) return 'A Asaas rejeitou os dados enviados.';
  if (providerStatus === 404) return 'Recurso nao encontrado na Asaas.';
  if (providerStatus === 401 || providerStatus === 403) return 'Falha de autenticacao com a Asaas (credencial do servidor).';
  if (providerStatus === 429) return 'Limite de requisicoes da Asaas atingido. Tente novamente em instantes.';
  if (providerStatus >= 500) return 'A Asaas esta indisponivel no momento.';
  return 'Erro ao comunicar com a Asaas.';
}

export interface AsaasClientConfig {
  apiKey: string;
  baseUrl: string;
  userAgent?: string;
  timeoutMs?: number;
  // BILLING2: nesta fase (Bloco Asaas 2), producao e recusada mesmo que
  // configurada -- "impedir silenciosamente o uso acidental de producao
  // nesta fase" (regra explicita da tarefa). Passar allowProduction=true e
  // a unica forma de destravar isso, e deve ser uma decisao explicita de
  // uma fase futura, nunca o padrao.
  allowProduction?: boolean;
}

// BILLING2: cria o cliente ja validado -- lanca AsaasConfigurationError
// sincronamente se a configuracao estiver incompleta ou apontar para
// producao sem autorizacao explicita, antes de qualquer tentativa de rede.
export function createAsaasClient(config: AsaasClientConfig) {
  const apiKey = config.apiKey;
  const baseUrl = config.baseUrl;

  if (!apiKey) {
    throw new AsaasConfigurationError('ASAAS_API_KEY ausente.', 'configuration');
  }
  if (!baseUrl) {
    throw new AsaasConfigurationError('ASAAS_BASE_URL ausente.', 'configuration');
  }
  if (!baseUrl.startsWith('https://')) {
    throw new AsaasConfigurationError('ASAAS_BASE_URL deve usar HTTPS.', 'configuration');
  }
  if (baseUrl === ASAAS_PRODUCTION_BASE_URL && !config.allowProduction) {
    throw new AsaasConfigurationError(
      'Producao da Asaas nao e permitida nesta fase (Bloco Asaas 2 -- somente Sandbox).',
      'configuration',
    );
  }
  if (baseUrl !== ASAAS_SANDBOX_BASE_URL && baseUrl !== ASAAS_PRODUCTION_BASE_URL) {
    throw new AsaasConfigurationError(
      'ASAAS_BASE_URL nao corresponde a nenhum ambiente conhecido da Asaas.',
      'configuration',
    );
  }

  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const userAgent = config.userAgent ?? 'UniFlowAI-Billing/1.0';

  async function request(operationId: string, path: string, init: RequestInit = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort('timeout'), timeoutMs);
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': userAgent,
          // BILLING2: header exigido pela Asaas para autenticacao --
          // confirmado em docs.asaas.com/docs/authentication-2 -- nunca
          // "Authorization: Bearer" (isso e o esquema do NOSSO Supabase Auth,
          // nao da Asaas).
          access_token: apiKey,
          ...(init.headers as Record<string, string> | undefined),
        },
        signal: controller.signal,
      });
    } catch (cause) {
      if (controller.signal.aborted && controller.signal.reason === 'timeout') {
        throw new AsaasTimeoutError(operationId);
      }
      throw new AsaasNetworkError(operationId, cause);
    } finally {
      clearTimeout(timeout);
    }

    const rawText = await response.text();
    let body: unknown = null;
    if (rawText) {
      try {
        body = JSON.parse(rawText);
      } catch {
        throw new AsaasApiError({
          message: 'Resposta da Asaas nao pode ser interpretada (nao e JSON valido).',
          operationId,
          providerStatus: response.status,
          httpStatus: 502,
          logDetails: { rawTextLength: rawText.length },
        });
      }
    }

    if (!response.ok) {
      throw new AsaasApiError({
        message: mapProviderStatusToSafeMessage(response.status),
        operationId,
        providerStatus: response.status,
        httpStatus: mapProviderStatusToSafeHttpStatus(response.status),
        logDetails: { body: sanitizeForLog(body) },
      });
    }

    return body;
  }

  return {
    // Clientes -- https://docs.asaas.com/reference/create-new-customer
    createCustomer(payload: Record<string, unknown>) {
      return request('createCustomer', '/customers', { method: 'POST', body: JSON.stringify(payload) });
    },
    // Busca por externalReference (nosso workspace_id) -- camada extra de
    // idempotencia do LADO da Asaas, alem da checagem no nosso banco --
    // https://docs.asaas.com/reference/list-customers
    findCustomersByExternalReference(externalReference: string) {
      const params = new URLSearchParams({ externalReference });
      return request('findCustomersByExternalReference', `/customers?${params.toString()}`, { method: 'GET' });
    },
    listCustomers(params: Record<string, string> = {}) {
      const query = new URLSearchParams(params);
      const suffix = query.toString() ? `?${query.toString()}` : '';
      return request('listCustomers', `/customers${suffix}`, { method: 'GET' });
    },
    // Assinaturas -- https://docs.asaas.com/reference/create-new-subscription
    createSubscription(payload: Record<string, unknown>) {
      return request('createSubscription', '/subscriptions', { method: 'POST', body: JSON.stringify(payload) });
    },
    // BLOCO ASAAS CHECKOUT: a resposta inclui `externalReference` e
    // `checkoutSession` (confirmado via
    // docs.asaas.com/reference/retrieve-a-single-subscription) -- usados
    // pelo webhook para correlacionar um pagamento originado por Checkout
    // quando o `customer` nao bate com nenhum billing_customers conhecido
    // (ver migration 026).
    getSubscription(asaasSubscriptionId: string) {
      return request('getSubscription', `/subscriptions/${encodeURIComponent(asaasSubscriptionId)}`, { method: 'GET' });
    },
    // Cancela -- interrompe a geracao de NOVAS cobrancas (efeito documentado
    // da Asaas); o direito de acesso interno ate o fim do periodo ja pago e
    // responsabilidade do NOSSO backend (cancel_at_period_end), nunca da
    // Asaas.
    cancelSubscription(asaasSubscriptionId: string) {
      return request('cancelSubscription', `/subscriptions/${encodeURIComponent(asaasSubscriptionId)}`, { method: 'DELETE' });
    },
    listSubscriptionPayments(asaasSubscriptionId: string) {
      return request('listSubscriptionPayments', `/subscriptions/${encodeURIComponent(asaasSubscriptionId)}/payments`, { method: 'GET' });
    },
    // CORRECAO FINAL PIX: QR Code oficial de uma cobranca Pix --
    // https://docs.asaas.com/reference/get-qr-code-for-pix-payments --
    // resposta { encodedImage, payload, expirationDate }.
    getPixQrCode(asaasPaymentId: string) {
      return request('getPixQrCode', `/payments/${encodeURIComponent(asaasPaymentId)}/pixQrCode`, { method: 'GET' });
    },
    // Tokenizacao de cartao -- https://docs.asaas.com/reference/credit-card-tokenization
    // Usada so quando uma fase futura conectar um formulario seguro
    // (hospedado pela Asaas ou equivalente); nosso backend nunca recebe
    // numero de cartao completo/CVV para chamar isto.
    tokenizeCreditCard(payload: Record<string, unknown>) {
      return request('tokenizeCreditCard', '/creditCard/tokenize', { method: 'POST', body: JSON.stringify(payload) });
    },
    // Pix Automatico -- ARQUITETURA SEPARADA da assinatura tradicional (ver
    // docs.asaas.com/docs/diferenca-entre-pix-automatico-e-assinaturas-1) --
    // https://docs.asaas.com/reference/criar-uma-autorizacao-pix-automatico
    createPixAutomaticAuthorization(payload: Record<string, unknown>) {
      return request('createPixAutomaticAuthorization', '/pix/automatic/authorizations', { method: 'POST', body: JSON.stringify(payload) });
    },
    // BLOCO ASAAS 3A: cobranca AVULSA (nao recorrente) -- usada hoje somente
    // pela funcao de homologacao billing-create-test-payment, nunca pelo
    // fluxo comercial (que so cria assinatura recorrente via
    // createSubscription). https://docs.asaas.com/reference/create-new-payment
    createPayment(payload: Record<string, unknown>) {
      return request('createPayment', '/payments', { method: 'POST', body: JSON.stringify(payload) });
    },
    // BLOCO ASAAS 3A: SANDBOX-ONLY -- confirma o pagamento de uma cobranca de
    // teste sem nenhum dado real de cartao/Pix. Nunca deve ser chamado com
    // ASAAS_BASE_URL de producao (a Asaas rejeita fora do Sandbox; mesmo
    // assim, o chamador -- billing-create-test-payment -- e ele mesmo restrito
    // a uso de homologacao). https://docs.asaas.com/reference/confirm-payment
    confirmSandboxPayment(asaasPaymentId: string) {
      return request(
        'confirmSandboxPayment',
        `/sandbox/payment/${encodeURIComponent(asaasPaymentId)}/confirm`,
        { method: 'POST' },
      );
    },
    // BLOCO ASAAS CHECKOUT: Checkout hospedado (usado hoje so para cartao de
    // credito -- Pix continua pelo fluxo direto createSubscription). Nunca
    // aceita um `customer` id existente -- so `customerData` bruto (unica
    // forma documentada). https://docs.asaas.com/reference/create-new-checkout
    createCheckout(payload: Record<string, unknown>) {
      return request('createCheckout', '/checkouts', { method: 'POST', body: JSON.stringify(payload) });
    },
  };
}

export type AsaasClient = ReturnType<typeof createAsaasClient>;
