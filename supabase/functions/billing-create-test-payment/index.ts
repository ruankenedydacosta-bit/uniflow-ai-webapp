// Edge Function: billing-create-test-payment
//
// BLOCO ASAAS 3A: função EXCLUSIVA de homologação -- cria (action:'create')
// ou confirma (action:'confirm') uma cobrança AVULSA (nunca recorrente) no
// Sandbox da Asaas, para validar o fluxo real de webhook
// (PAYMENT_CREATED/PAYMENT_CONFIRMED/PAYMENT_RECEIVED) de ponta a ponta.
//
// NUNCA usada pelo fluxo comercial (que so cria assinatura recorrente via
// billing-create-subscription) e NUNCA grava em `subscriptions` ou
// `billing_payments` -- essa persistencia e responsabilidade do Bloco 3B,
// quando o processamento de webhook for implementado. Aqui so devolvemos o
// resultado bruto (sanitizado) da Asaas para quem chamou confirmar via
// consulta direta a `webhook_events`.
//
// Mesma auditoria de seguranca das demais funcoes de billing: JWT
// obrigatorio, workspace precisa ja ter um billing_customer real (criado
// via billing-create-customer), CORS com allowlist de origem.

import {
  AsaasApiError,
  AsaasConfigurationError,
  AsaasNetworkError,
  AsaasTimeoutError,
  createAsaasClient,
} from '../_shared/asaasClient.ts';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// BLOCO ASAAS 3A: valor/descrição fixos no backend, iguais aos usados por
// billing-create-subscription -- nunca aceitos do chamador, mesmo padrão de
// segurança das demais funções de billing (o cliente nunca controla preço).
const TEST_PAYMENT_VALUE = 29.9;
const TEST_PAYMENT_DESCRIPTION = 'UniFlow Plano Pessoal — Teste Sandbox';

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

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
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
  if (!supabaseUrl || !anonKey) {
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

  const workspaceId = payload?.workspace_id;
  if (typeof workspaceId !== 'string' || !UUID_PATTERN.test(workspaceId)) {
    return jsonResponse(400, errorBody('INVALID_WORKSPACE', 'workspace_id invalido.'), origin);
  }

  const isMember = await hasWorkspaceMembership({ authorization, supabaseUrl, anonKey, userId, workspaceId });
  if (!isMember) {
    return jsonResponse(403, errorBody('WORKSPACE_NOT_AUTHORIZED', 'Workspace nao autorizado.'), origin);
  }

  const asaasApiKey = Deno.env.get('ASAAS_API_KEY') ?? '';
  const asaasBaseUrl = Deno.env.get('ASAAS_BASE_URL') ?? '';

  const action = payload?.action === 'confirm' ? 'confirm' : 'create';

  try {
    const client = createAsaasClient({ apiKey: asaasApiKey, baseUrl: asaasBaseUrl });

    if (action === 'confirm') {
      const asaasPaymentId = payload?.asaas_payment_id;
      if (typeof asaasPaymentId !== 'string' || !asaasPaymentId.trim()) {
        return jsonResponse(400, errorBody('MISSING_REQUIRED_FIELD', 'asaas_payment_id ausente.'), origin);
      }
      const confirmed = await client.confirmSandboxPayment(asaasPaymentId) as { status?: string };
      return jsonResponse(200, {
        workspace_id: workspaceId,
        asaas_payment_id: asaasPaymentId,
        status: confirmed?.status ?? null,
      }, origin);
    }

    const billingCustomer = await getBillingCustomer({ authorization, supabaseUrl, anonKey, workspaceId });
    if (!billingCustomer?.asaas_customer_id) {
      return jsonResponse(422, errorBody('CUSTOMER_REQUIRED', 'Crie o cliente Asaas (billing-create-customer) antes de gerar a cobranca de teste.'), origin);
    }

    const externalReference = typeof payload?.external_reference === 'string' && payload.external_reference.trim()
      ? payload.external_reference.trim()
      : `uniflow-sandbox-payment-${crypto.randomUUID()}`;
    const billingType = payload?.billing_type === 'BOLETO' ? 'BOLETO' : 'PIX';

    const created = await client.createPayment({
      customer: billingCustomer.asaas_customer_id,
      billingType,
      value: TEST_PAYMENT_VALUE,
      dueDate: todayIsoDate(),
      description: TEST_PAYMENT_DESCRIPTION,
      externalReference,
    }) as { id?: string; status?: string };

    if (typeof created?.id !== 'string') {
      return jsonResponse(502, errorBody('ASAAS_API_ERROR', 'A Asaas nao retornou um identificador de cobranca valido.'), origin);
    }

    return jsonResponse(201, {
      workspace_id: workspaceId,
      asaas_payment_id: created.id,
      status: created.status ?? null,
      external_reference: externalReference,
    }, origin);
  } catch (error) {
    if (error instanceof AsaasConfigurationError) {
      return jsonResponse(503, errorBody('SERVICE_UNAVAILABLE', 'Integracao com a Asaas nao esta configurada.'), origin);
    }
    if (error instanceof AsaasTimeoutError) {
      return jsonResponse(504, errorBody('ASAAS_TIMEOUT', 'Tempo limite excedido ao comunicar com a Asaas.'), origin);
    }
    if (error instanceof AsaasNetworkError) {
      return jsonResponse(502, errorBody('ASAAS_NETWORK_ERROR', 'Falha de rede ao comunicar com a Asaas.'), origin);
    }
    if (error instanceof AsaasApiError) {
      console.log(JSON.stringify({ at: 'billing-create-test-payment', status: 'error', operationId: error.operationId, providerStatus: error.providerStatus }));
      return jsonResponse(error.httpStatus, errorBody('ASAAS_API_ERROR', error.message), origin);
    }
    throw error;
  }
});
