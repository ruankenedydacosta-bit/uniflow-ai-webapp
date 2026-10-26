// Edge Function: billing-create-subscription
//
// BILLING2 (Bloco Asaas 2): cria a assinatura mensal do Plano Pessoal
// (plan_id 'pro', R$ 29,90/mes, decisao comercial congelada -- Bloco Asaas
// 0) no Sandbox da Asaas. O backend define TODO parametro comercial
// (valor, ciclo, descricao) -- o frontend so escolhe workspace_id e
// payment_method.
//
// Fonte oficial: https://docs.asaas.com/reference/create-new-subscription
// (customer/billingType/value/nextDueDate/cycle obrigatorios; billingType
// aceita UNDEFINED/BOLETO/CREDIT_CARD/PIX -- boleto nunca usado aqui,
// decisao comercial).
//
// Pix Automatico e uma ARQUITETURA SEPARADA da assinatura tradicional
// (https://docs.asaas.com/docs/diferenca-entre-pix-automatico-e-assinaturas-1,
// endpoint proprio POST /v3/pix/automatic/authorizations com
// customerId/frequency/contractId/startDate/immediateQrCode) -- por isso
// NUNCA e tratado como um valor de billingType aqui. Nesta fase, escolher
// pix_automatico apenas devolve PIX_AUTOMATIC_AUTHORIZATION_REQUIRED,
// documentando o proximo passo (ver PRoximos passos no comentario abaixo).
//
// Estado local inicial e SEMPRE 'pending' -- a assinatura so vira 'active'
// apos confirmacao via billing-webhook (Bloco Asaas 3), nunca so por ter
// sido criada.

import {
  AsaasApiError,
  AsaasConfigurationError,
  AsaasNetworkError,
  AsaasTimeoutError,
  AsaasValidationError,
  createAsaasClient,
} from '../_shared/asaasClient.ts';
import { BILLING_PLAN_ID } from '../_shared/planCatalog.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// BILLING2: unico plano vendido no MVP e "Plano Pessoal" = plan_id 'pro'
// (decisao comercial congelada, Bloco Asaas 0) -- nunca aceitar outro valor.
const ALLOWED_PLAN_IDS = new Set<string>([BILLING_PLAN_ID]);
const ALLOWED_PAYMENT_METHODS = new Set(['pix', 'pix_automatico', 'credit_card']);
// BILLING2: parametros comerciais definidos SOMENTE pelo backend -- nunca
// aceitos do frontend, mesmo que enviados.
const PLAN_PRICE = 29.9;
const PLAN_CYCLE = 'MONTHLY';
const PLAN_DESCRIPTION = 'Assinatura Plano Pessoal - UniFlow AI';
const FORBIDDEN_CLIENT_FIELDS = [
  'value', 'price', 'discount', 'cycle', 'next_due_date', 'status',
  'asaas_subscription_id', 'external_reference', 'customer_id',
  'credit_card_number', 'card_number', 'cvv', 'credit_card',
];

function getAllowedOrigins() {
  return new Set(
    (Deno.env.get('APP_ALLOWED_ORIGINS') ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

function isAllowedOrigin(origin: string) {
  if (!origin) return false;
  if (getAllowedOrigins().has(origin)) return true;
  return /^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/.test(origin);
}

function corsHeaders(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin,
    Vary: 'Origin',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function jsonResponse(status: number, body: Record<string, unknown>, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

function errorBody(code: string, message: string) {
  return { error: { code, message } };
}

async function getAuthenticatedUserId(authorization: string, supabaseUrl: string, anonKey: string) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: anonKey },
  });
  if (!response.ok) return null;
  const user = await response.json();
  return typeof user?.id === 'string' ? user.id : null;
}

async function hasWorkspaceMembership({
  authorization, supabaseUrl, anonKey, userId, workspaceId,
}: { authorization: string; supabaseUrl: string; anonKey: string; userId: string; workspaceId: string }) {
  const params = new URLSearchParams({
    select: 'workspace_id', workspace_id: `eq.${workspaceId}`, user_id: `eq.${userId}`, status: 'eq.active', limit: '1',
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/workspace_members?${params}`, {
    headers: { Authorization: authorization, apikey: anonKey },
  });
  if (!response.ok) return false;
  const rows = await response.json();
  return Array.isArray(rows) && rows.length === 1;
}

async function getBillingCustomer({
  authorization, supabaseUrl, anonKey, workspaceId,
}: { authorization: string; supabaseUrl: string; anonKey: string; workspaceId: string }) {
  const params = new URLSearchParams({ select: 'asaas_customer_id', workspace_id: `eq.${workspaceId}`, limit: '1' });
  const response = await fetch(`${supabaseUrl}/rest/v1/billing_customers?${params}`, {
    headers: { Authorization: authorization, apikey: anonKey },
  });
  if (!response.ok) return null;
  const rows = await response.json();
  return Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
}

// Idempotencia: qualquer assinatura NAO terminal (nunca canceled/expired)
// ja existente para o workspace impede criar outra -- "impedir duas
// assinaturas ativas para o mesmo workspace/plano" (regra da tarefa).
async function getNonTerminalSubscription({
  authorization, supabaseUrl, anonKey, workspaceId,
}: { authorization: string; supabaseUrl: string; anonKey: string; workspaceId: string }) {
  const params = new URLSearchParams({
    select: '*', workspace_id: `eq.${workspaceId}`,
    status: 'not.in.(canceled,expired)', limit: '1',
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/subscriptions?${params}`, {
    headers: { Authorization: authorization, apikey: anonKey },
  });
  if (!response.ok) return null;
  const rows = await response.json();
  return Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
}

async function persistSubscription({
  supabaseUrl, serviceRoleKey, workspaceId, asaasCustomerId, asaasSubscriptionId, paymentMethod,
}: {
  supabaseUrl: string; serviceRoleKey: string; workspaceId: string; asaasCustomerId: string;
  asaasSubscriptionId: string; paymentMethod: string;
}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/subscriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      workspace_id: workspaceId,
      plan_id: BILLING_PLAN_ID,
      // BILLING2: NUNCA 'active' aqui -- so o webhook (Bloco Asaas 3) ativa,
      // apos evidencia real de pagamento confirmado (regra oficial:
      // ativacao so apos confirmacao segura do pagamento).
      status: 'pending',
      asaas_customer_id: asaasCustomerId,
      asaas_subscription_id: asaasSubscriptionId,
      payment_method: paymentMethod,
      cancel_at_period_end: false,
    }),
  });
  if (!response.ok) return null;
  const rows = await response.json();
  return Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

// CORRECAO FINAL PIX: primeira cobranca da assinatura -- a Asaas nao
// garante a ordem do array de /subscriptions/{id}/payments, entao
// ordenamos por nextDueDate/dueDate (a mais antiga e sempre a primeira
// cobranca gerada para uma assinatura recem-criada).
function pickEarliestPayment(payments: Array<Record<string, unknown>>): Record<string, unknown> | null {
  if (!Array.isArray(payments) || payments.length === 0) return null;
  const sorted = [...payments].sort((a, b) => {
    const dateA = typeof a.dueDate === 'string' ? a.dueDate : '';
    const dateB = typeof b.dueDate === 'string' ? b.dueDate : '';
    return dateA.localeCompare(dateB);
  });
  return sorted[0];
}

// CORRECAO FINAL PIX: busca o QR Code oficial (encodedImage + payload
// copia-e-cola) da primeira cobranca da assinatura --
// https://docs.asaas.com/reference/get-qr-code-for-pix-payments. Best
// effort -- nunca quebra a resposta de criacao da assinatura (ja
// persistida) se a busca do QR falhar; o frontend pode tentar de novo via
// billing-get-subscription.
async function fetchPixQrCode(
  client: ReturnType<typeof createAsaasClient>,
  asaasSubscriptionId: string,
) {
  try {
    const paymentsResponse = await client.listSubscriptionPayments(asaasSubscriptionId) as { data?: Array<Record<string, unknown>> };
    const payments = Array.isArray(paymentsResponse?.data) ? paymentsResponse.data : [];
    const firstPayment = pickEarliestPayment(payments);
    const paymentId = typeof firstPayment?.id === 'string' ? firstPayment.id : null;
    if (!paymentId) return null;

    const qr = await client.getPixQrCode(paymentId) as { encodedImage?: string; payload?: string; expirationDate?: string };
    if (!qr?.encodedImage || !qr?.payload) return null;

    return {
      encoded_image: qr.encodedImage,
      payload: qr.payload,
      expiration_date: typeof qr.expirationDate === 'string' ? qr.expirationDate : null,
      value: typeof firstPayment?.value === 'number' ? firstPayment.value : null,
      due_date: typeof firstPayment?.dueDate === 'string' ? firstPayment.dueDate : null,
    };
  } catch {
    return null;
  }
}

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin') ?? '';
  if (!isAllowedOrigin(origin)) {
    return jsonResponse(403, errorBody('ORIGIN_NOT_ALLOWED', 'Origem nao autorizada.'), origin);
  }
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (request.method !== 'POST') {
    return jsonResponse(405, errorBody('METHOD_NOT_ALLOWED', 'Metodo nao permitido.'), origin);
  }

  const authorization = request.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) {
    return jsonResponse(401, errorBody('AUTH_REQUIRED', 'Sessao obrigatoria.'), origin);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse(503, errorBody('SERVICE_UNAVAILABLE', 'Servico indisponivel.'), origin);
  }

  const userId = await getAuthenticatedUserId(authorization, supabaseUrl, anonKey);
  if (!userId) return jsonResponse(401, errorBody('INVALID_SESSION', 'Sessao invalida.'), origin);

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, errorBody('INVALID_BODY', 'Corpo da requisicao invalido.'), origin);
  }

  for (const field of FORBIDDEN_CLIENT_FIELDS) {
    if (payload?.[field] !== undefined) {
      return jsonResponse(400, errorBody('FIELD_NOT_ALLOWED', `O campo "${field}" nao pode ser definido pelo cliente.`), origin);
    }
  }

  const workspaceId = payload?.workspace_id;
  if (typeof workspaceId !== 'string' || !UUID_PATTERN.test(workspaceId)) {
    return jsonResponse(400, errorBody('INVALID_WORKSPACE', 'workspace_id invalido.'), origin);
  }

  const planId = payload?.plan_id;
  if (typeof planId !== 'string' || !ALLOWED_PLAN_IDS.has(planId)) {
    return jsonResponse(400, errorBody('INVALID_PLAN', `plan_id invalido -- so "${BILLING_PLAN_ID}" (Plano Pessoal) e vendido no MVP.`), origin);
  }

  const paymentMethod = payload?.payment_method;
  if (typeof paymentMethod !== 'string' || !ALLOWED_PAYMENT_METHODS.has(paymentMethod)) {
    return jsonResponse(
      400,
      errorBody('INVALID_PAYMENT_METHOD', 'payment_method invalido -- use pix, pix_automatico ou credit_card (boleto nao suportado).'),
      origin,
    );
  }

  const isMember = await hasWorkspaceMembership({ authorization, supabaseUrl, anonKey, userId, workspaceId });
  if (!isMember) {
    return jsonResponse(403, errorBody('WORKSPACE_NOT_AUTHORIZED', 'Workspace nao autorizado.'), origin);
  }

  const existingSubscription = await getNonTerminalSubscription({ authorization, supabaseUrl, anonKey, workspaceId });
  const asaasApiKey = Deno.env.get('ASAAS_API_KEY') ?? '';
const asaasBaseUrl = Deno.env.get('ASAAS_BASE_URL') ?? '';
  if (existingSubscription) {
    // CORRECAO FINAL PIX: assinatura Pix pendente reaproveitada (ex.:
    // reabriu a tela sem nunca ter pago) -- devolve o QR de novo, para o
    // modal continuar funcionando sem precisar criar outra assinatura.
    let pix: Record<string, unknown> | null = null;
    if (
      existingSubscription.payment_method === 'pix'
      && existingSubscription.status === 'pending'
      && existingSubscription.asaas_subscription_id
    ) {
           try {
        const client = createAsaasClient({
          apiKey: asaasApiKey,
          baseUrl: asaasBaseUrl,
          allowProduction: true,
        });

        pix = await fetchPixQrCode(
          client,
          existingSubscription.asaas_subscription_id as string,
        );
      } catch {
        pix = null;
      }
    }

    return jsonResponse(200, {
      workspace_id: workspaceId,
      status: existingSubscription.status,
      asaas_subscription_id: existingSubscription.asaas_subscription_id,
      reused: true,
      pix,
    }, origin);
  }

  // BILLING2: Pix Automatico exige uma jornada de autorizacao propria (ver
  // comentario no topo do arquivo) -- nunca forcado dentro do endpoint
  // tradicional de assinatura. PROXIMO PASSO (nao implementado aqui):
  // Bloco Asaas 3 precisaria chamar POST /v3/pix/automatic/authorizations
  // com customerId/frequency/contractId/startDate/immediateQrCode, tratar
  // o evento proprio de autorizacao (nao um PAYMENT_*), e so entao criar as
  // cobrancas recorrentes referenciando pixAutomaticAuthorizationId.
  if (paymentMethod === 'pix_automatico') {
    return jsonResponse(422, {
      error: {
        code: 'PIX_AUTOMATIC_AUTHORIZATION_REQUIRED',
        message: 'Pix Automatico exige uma autorizacao previa do pagador antes de criar cobrancas recorrentes -- fluxo ainda nao implementado (Bloco Asaas 3).',
      },
    }, origin);
  }

  const billingCustomer = await getBillingCustomer({ authorization, supabaseUrl, anonKey, workspaceId });
  if (!billingCustomer?.asaas_customer_id) {
    return jsonResponse(422, errorBody('CUSTOMER_REQUIRED', 'Crie o cliente Asaas (billing-create-customer) antes de assinar.'), origin);
  }

  let creditCardToken: string | undefined;
  if (paymentMethod === 'credit_card') {
    const rawToken = payload?.credit_card_token;
    if (typeof rawToken !== 'string' || !rawToken.trim()) {
      return jsonResponse(422, errorBody('MISSING_REQUIRED_FIELD', 'credit_card_token ausente -- tokenizacao deve acontecer antes desta chamada (nunca enviar dados de cartao brutos).'), origin);
    }
    creditCardToken = rawToken.trim();
  }


  try {
    const client = createAsaasClient({
  apiKey: asaasApiKey,
  baseUrl: asaasBaseUrl,
  allowProduction: true,
});

    const asaasPayload: Record<string, unknown> = {
      customer: billingCustomer.asaas_customer_id,
      // BILLING2: mapeamento payment_method (nosso) -> billingType (Asaas).
      // pix -> 'PIX'; credit_card -> 'CREDIT_CARD'. Nunca 'BOLETO'.
      billingType: paymentMethod === 'pix' ? 'PIX' : 'CREDIT_CARD',
      value: PLAN_PRICE,
      cycle: PLAN_CYCLE,
      nextDueDate: todayIsoDate(),
      description: PLAN_DESCRIPTION,
      externalReference: workspaceId,
    };
    if (creditCardToken) {
      asaasPayload.creditCardToken = creditCardToken;
    }

    const created = await client.createSubscription(asaasPayload) as { id?: string };
    const asaasSubscriptionId = typeof created?.id === 'string' ? created.id : null;
    if (!asaasSubscriptionId) {
      return jsonResponse(502, errorBody('ASAAS_API_ERROR', 'A Asaas nao retornou um identificador de assinatura valido.'), origin);
    }

    const persisted = await persistSubscription({
      supabaseUrl, serviceRoleKey, workspaceId,
      asaasCustomerId: billingCustomer.asaas_customer_id,
      asaasSubscriptionId, paymentMethod,
    });
    if (!persisted) {
      return jsonResponse(502, errorBody('PERSISTENCE_FAILED', 'Assinatura criada na Asaas, mas nao foi possivel salvar localmente. Use billing-sync para reconciliar.'), origin);
    }

    // CORRECAO FINAL PIX: so busca QR Code para Pix (nunca para cartao,
    // que segue exatamente como estava -- redirecionamento para o Asaas
    // Checkout, sem QR nenhum aqui).
    const pix = paymentMethod === 'pix' ? await fetchPixQrCode(client, asaasSubscriptionId) : null;

    return jsonResponse(201, {
      workspace_id: workspaceId,
      status: 'pending',
      asaas_subscription_id: asaasSubscriptionId,
      reused: false,
      pix,
    }, origin);
  } catch (error) {
    if (error instanceof AsaasConfigurationError) {
      return jsonResponse(503, errorBody('SERVICE_UNAVAILABLE', 'Integracao com a Asaas nao esta configurada.'), origin);
    }
    if (error instanceof AsaasValidationError) {
      return jsonResponse(400, errorBody('INVALID_BODY', error.message), origin);
    }
    if (error instanceof AsaasTimeoutError) {
      return jsonResponse(504, errorBody('ASAAS_TIMEOUT', 'Tempo limite excedido ao comunicar com a Asaas.'), origin);
    }
    if (error instanceof AsaasNetworkError) {
      return jsonResponse(502, errorBody('ASAAS_NETWORK_ERROR', 'Falha de rede ao comunicar com a Asaas.'), origin);
    }
    if (error instanceof AsaasApiError) {
      console.log(JSON.stringify({ at: 'billing-create-subscription', status: 'error', operationId: error.operationId, providerStatus: error.providerStatus }));
      return jsonResponse(error.httpStatus, errorBody('ASAAS_API_ERROR', error.message), origin);
    }
    throw error;
  }
});
