// Edge Function: billing-create-checkout
//
// BLOCO ASAAS CHECKOUT: cria um Asaas Checkout hospedado (RECURRENT,
// CREDIT_CARD) para o Plano Pessoal -- nunca um checkout proprio, nunca
// coleta numero/validade/CVV de cartao dentro da UniFlow. O frontend so
// recebe checkoutId/checkoutUrl/status/externalReference; o pagamento
// acontece inteiramente na pagina hospedada da Asaas.
//
// Fonte oficial: https://docs.asaas.com/reference/create-new-checkout
// (billingTypes/chargeTypes/callback/items obrigatorios; subscription
// obrigatorio quando chargeTypes inclui RECURRENT).
//
// DESCOBERTA REAL NO SANDBOX (Bloco Asaas Checkout, teste real executado):
// customerData PARCIAL (so name/cpfCnpj/email/phone, sem endereco) e
// REJEITADO pela Asaas -- ela exige o endereco completo do pagador dentro
// de customerData, que a UniFlow nunca coletou (fora de escopo). Em vez de
// inventar um endereco falso ou expandir o formulario de assinatura,
// customerData continua OMITIDO por completo.
//
// CORRECAO NOTIFICACOES (cartao): billing-create-customer (em Production
// com notificationDisabled:true desde a correcao anterior) e o UNICO ponto
// que cria clientes Asaas na UniFlow. Esta funcao NUNCA chama
// billing-create-customer nem cria um cliente novo -- ela apenas
// REUTILIZA, quando ja existe, o billing_customers do workspace (lido de
// forma read-only, com o MESMO padrao ja usado por
// billing-create-subscription.getBillingCustomer: RLS via Authorization do
// proprio usuario, nunca service role, nunca um id vindo do corpo da
// requisicao -- customer_id ja e um FORBIDDEN_CLIENT_FIELD abaixo). Quando
// encontrado, o asaas_customer_id e enviado como `customer` no Checkout
// (docs.asaas.com/docs/how-to-provide-customer-data confirma que `customer`
// e `customerData` sao alternativas mutuamente exclusivas -- nunca ambos).
//
// LIMITACAO REAL (documentada, nao contornavel sem violar o escopo desta
// correcao): a Asaas exige cpfCnpj para CRIAR um cliente
// (docs.asaas.com/reference/create-new-customer) e o formulario de cartao
// da UniFlow nunca coleta CPF (o Checkout hospedado pede isso na pagina
// dele) -- por isso um usuario que nunca passou pelo Pix (unico fluxo que
// hoje chama billing-create-customer) e escolhe cartao PELA PRIMEIRA VEZ
// ainda cai no caminho antigo (nem `customer` nem `customerData`, Asaas
// cria seu proprio cliente sem notificationDisabled). Resolver isso
// exigiria coletar CPF no fluxo de cartao ou criar o cliente sem CPF -- as
// duas coisas fora do escopo autorizado. Ver relatorio final.
//
// Pix (billing-create-subscription) e o cartao (aqui) sao dois arquivos
// completamente separados -- nenhuma alteracao neste bloco toca o fluxo
// Pix existente.
//
// Estado local inicial e SEMPRE 'pending', igual ao Pix -- so o webhook
// ativa, apos evidencia real de pagamento (PAYMENT_CONFIRMED/RECEIVED).

import {
  AsaasApiError,
  AsaasConfigurationError,
  AsaasNetworkError,
  AsaasTimeoutError,
  AsaasValidationError,
  createAsaasClient,
} from '../_shared/asaasClient.ts';
import { buildCheckoutPayload } from '../_shared/billingSubscriptionRules.ts';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// BLOCO ASAAS CHECKOUT: nunca o frontend controla valor/plano/cliente/status
// -- mesmos campos proibidos das demais Edge Functions de billing, mais os
// especificos do Checkout (checkoutId/checkoutUrl/externalReference), que
// so o backend pode gerar.
const FORBIDDEN_CLIENT_FIELDS = [
  'value', 'price', 'discount', 'cycle', 'next_due_date', 'status',
  'asaas_subscription_id', 'asaas_checkout_id', 'external_reference', 'customer_id',
  'checkout_id', 'checkout_url', 'credit_card_number', 'card_number', 'cvv', 'credit_card',
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

// CORRECAO NOTIFICACOES (cartao): mesmo padrao EXATO de
// billing-create-subscription.getBillingCustomer -- read-only, autorizado
// pelo Authorization do PROPRIO usuario (nunca service role), protegido
// pela mesma RLS (`billing_customers_select_active_member`, migration 024)
// que ja restringe a leitura ao workspace do usuario autenticado. Nunca le
// um id vindo do corpo da requisicao -- elimina qualquer possibilidade de
// IDOR (um customer de outro workspace jamais pode ser referenciado aqui).
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

// Idempotencia: mesmo criterio do Pix (billing-create-subscription) -- so
// UMA assinatura nao-terminal por workspace.
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

async function insertPendingCheckoutSubscription({
  supabaseUrl, serviceRoleKey, workspaceId, asaasCheckoutId,
}: { supabaseUrl: string; serviceRoleKey: string; workspaceId: string; asaasCheckoutId: string }) {
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
      plan_id: 'pro',
      // BLOCO ASAAS CHECKOUT: nunca 'active' -- so o webhook ativa, apos
      // PAYMENT_CONFIRMED/PAYMENT_RECEIVED (mesma regra do Pix).
      status: 'pending',
      payment_method: 'credit_card',
      asaas_checkout_id: asaasCheckoutId,
      cancel_at_period_end: false,
    }),
  });
  if (!response.ok) return null;
  const rows = await response.json();
  return Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
}

// BLOCO ASAAS CHECKOUT: reaproveita a MESMA linha pendente (nunca insere
// uma segunda) quando o checkout anterior expirou/foi abandonado antes de
// vincular uma assinatura real (asaas_subscription_id ainda nulo) -- so
// atualiza o novo checkoutId gerado.
async function updatePendingCheckoutSubscription({
  supabaseUrl, serviceRoleKey, subscriptionId, asaasCheckoutId,
}: { supabaseUrl: string; serviceRoleKey: string; subscriptionId: string; asaasCheckoutId: string }) {
  const response = await fetch(`${supabaseUrl}/rest/v1/subscriptions?id=eq.${subscriptionId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ asaas_checkout_id: asaasCheckoutId }),
  });
  if (!response.ok) return null;
  const rows = await response.json();
  return Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
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

  const isMember = await hasWorkspaceMembership({ authorization, supabaseUrl, anonKey, userId, workspaceId });
  if (!isMember) {
    return jsonResponse(403, errorBody('WORKSPACE_NOT_AUTHORIZED', 'Workspace nao autorizado.'), origin);
  }

  const existingSubscription = await getNonTerminalSubscription({ authorization, supabaseUrl, anonKey, workspaceId });
  // BLOCO ASAAS CHECKOUT: ja existe uma assinatura real (vinculada na Asaas,
  // Pix ou cartao) -- nunca cria um segundo checkout/assinatura para o
  // mesmo workspace.
  if (existingSubscription?.asaas_subscription_id) {
    return jsonResponse(200, {
      workspace_id: workspaceId,
      status: existingSubscription.status,
      external_reference: workspaceId,
      reused: true,
    }, origin);
  }

  // CORRECAO NOTIFICACOES (cartao): reutiliza o billing_customers do
  // workspace SE ja existir (ex.: uma tentativa Pix anterior) -- read-only,
  // RLS-scoped, nunca cria nada aqui. Ausencia e um estado normal (usuario
  // ainda sem nenhum billing_customers), tratado como null -- ver LIMITACAO
  // no comentario do topo deste arquivo.
  const billingCustomer = await getBillingCustomer({ authorization, supabaseUrl, anonKey, workspaceId });
  const asaasCustomerId = typeof billingCustomer?.asaas_customer_id === 'string'
    ? billingCustomer.asaas_customer_id
    : null;

  const asaasApiKey = Deno.env.get('ASAAS_API_KEY') ?? '';
  const asaasBaseUrl = Deno.env.get('ASAAS_BASE_URL') ?? '';

  // BLOCO ASAAS CHECKOUT: retorno na MESMA aba, direto para a rota de
  // retorno do Plano Pessoal -- nunca considerado "plano ativo" so por
  // chegar aqui (a rota de retorno consulta billing-get-subscription).
  // CONFIRMADO no Sandbox real: a Asaas so aceita callback URLs com
  // dominio https:// real (rejeita http:// e tambem rejeita "localhost")
  // -- em producao isto nunca e um problema (Vercel e sempre https com
  // dominio real); em DEV local (http://localhost) o teste real desta
  // funcao especifica so pode ser feito contra um ambiente ja implantado.
  const successUrl = `${origin}/plano-pessoal/retorno?status=success`;
  const cancelUrl = `${origin}/plano-pessoal/retorno?status=cancel`;
  const expiredUrl = `${origin}/plano-pessoal/retorno?status=expired`;

  try {
    const client = createAsaasClient({ apiKey: asaasApiKey, baseUrl: asaasBaseUrl, allowProduction: true });

    const checkoutPayload = buildCheckoutPayload({
      workspaceId,
      successUrl,
      cancelUrl,
      expiredUrl,
      now: new Date().toISOString(),
      asaasCustomerId,
    });

    const created = await client.createCheckout(checkoutPayload) as { id?: string; link?: string; status?: string };
    const checkoutId = typeof created?.id === 'string' ? created.id : null;
    const checkoutUrl = typeof created?.link === 'string' ? created.link : null;
    if (!checkoutId || !checkoutUrl) {
      return jsonResponse(502, errorBody('ASAAS_API_ERROR', 'A Asaas nao retornou um checkout valido.'), origin);
    }

    const persisted = existingSubscription
      ? await updatePendingCheckoutSubscription({
          supabaseUrl, serviceRoleKey, subscriptionId: existingSubscription.id, asaasCheckoutId: checkoutId,
        })
      : await insertPendingCheckoutSubscription({
          supabaseUrl, serviceRoleKey, workspaceId, asaasCheckoutId: checkoutId,
        });
    if (!persisted) {
      return jsonResponse(502, errorBody('PERSISTENCE_FAILED', 'Checkout criado na Asaas, mas nao foi possivel salvar localmente.'), origin);
    }

    // BLOCO ASAAS CHECKOUT: resposta publica SANITIZADA -- so
    // checkoutId/checkoutUrl/status/externalReference (nunca o payload
    // bruto da Asaas).
    return jsonResponse(201, {
      checkout_id: checkoutId,
      checkout_url: checkoutUrl,
      status: typeof created?.status === 'string' ? created.status : 'ACTIVE',
      external_reference: workspaceId,
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
      console.log(JSON.stringify({ at: 'billing-create-checkout', status: 'error', operationId: error.operationId, providerStatus: error.providerStatus }));
      return jsonResponse(error.httpStatus, errorBody('ASAAS_API_ERROR', error.message), origin);
    }
    throw error;
  }
});
