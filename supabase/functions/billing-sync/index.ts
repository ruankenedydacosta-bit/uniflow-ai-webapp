// Edge Function: billing-sync
//
// BILLING2 (Bloco Asaas 2): reconcilia o estado local com a Asaas --
// cobre o caso de webhook perdido/atrasado (fallback de consulta ativa,
// nunca o unico caminho de ativacao numa fase futura). Fontes oficiais:
// https://docs.asaas.com/reference/retrieve-a-single-subscription e a
// listagem de cobrancas de uma assinatura (mesmo padrao REST documentado
// para outros recursos de listagem da Asaas).
//
// REGRA CRITICA (respeitada aqui): NUNCA ativa uma assinatura so pelo
// status externo da assinatura -- só um pagamento com status
// CONFIRMED/RECEIVED em `billing_payments` conta como evidencia real de
// pagamento. `provider_status` sozinho (ex.: ACTIVE na Asaas) nunca e
// suficiente.
//
// PENDENCIA DE BANCO DOCUMENTADA (nao aplicada nesta execucao): a tabela
// `subscriptions` (migration 024) NAO tem colunas `provider_status`,
// `last_synced_at` nem `sync_error` -- por isso esta funcao NUNCA escreve
// nelas (isso quebraria em runtime) e devolve esses 3 campos so na
// RESPOSTA (computados a cada chamada, nunca persistidos). Uma migration
// futura complementar precisaria adicionar essas 3 colunas para que o
// historico de sincronizacao sobreviva entre chamadas -- proposta:
//   alter table public.subscriptions
//     add column provider_status text,
//     add column last_synced_at timestamptz,
//     add column last_sync_error text;
// (aditiva, nullable, sem quebrar nada existente) -- NAO criada aqui.

import {
  AsaasApiError,
  AsaasConfigurationError,
  AsaasNetworkError,
  AsaasTimeoutError,
  createAsaasClient,
} from '../_shared/asaasClient.ts';
import { buildBillingPaymentRow } from '../_shared/billingSubscriptionRules.ts';
import { resolveBillingLifecycle, validateProviderPayments } from '../_shared/billingLifecycle.ts';
import { BILLING_PLAN_ID } from '../_shared/planCatalog.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

async function getLocalSubscription({
  authorization, supabaseUrl, anonKey, workspaceId,
}: { authorization: string; supabaseUrl: string; anonKey: string; workspaceId: string }) {
  const params = new URLSearchParams({ select: '*', workspace_id: `eq.${workspaceId}`, plan_id: `eq.${BILLING_PLAN_ID}`, order: 'created_at.desc,id.desc', limit: '1' });
  const response = await fetch(`${supabaseUrl}/rest/v1/subscriptions?${params}`, {
    headers: { Authorization: authorization, apikey: anonKey },
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

  // BILLING2: usuario autenticado do workspace OU service role (chamada
  // interna/automatizada) -- nunca confia em status enviado pelo chamador.
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

  const subscription = await getLocalSubscription({ authorization, supabaseUrl, anonKey, workspaceId });
  if (!subscription) {
    return jsonResponse(200, { workspace_id: workspaceId, exists: false, synced: false }, origin);
  }
  if (!subscription.asaas_subscription_id) {
    return jsonResponse(409, errorBody('SUBSCRIPTION_NOT_LINKED', 'Assinatura sem vinculo com a Asaas -- nada para sincronizar.'), origin);
  }

  const asaasApiKey = Deno.env.get('ASAAS_API_KEY') ?? '';
  const asaasBaseUrl = Deno.env.get('ASAAS_BASE_URL') ?? '';

  try {
    const client = createAsaasClient({ apiKey: asaasApiKey, baseUrl: asaasBaseUrl, allowProduction: true });
    const remoteSubscription = await client.getSubscription(subscription.asaas_subscription_id) as { status?: string };
    const remotePaymentsResponse = await client.listSubscriptionPayments(subscription.asaas_subscription_id) as { data?: Array<Record<string, unknown>> };
    const remotePayments = Array.isArray(remotePaymentsResponse?.data) ? remotePaymentsResponse.data : [];

    const providerStatus = typeof remoteSubscription?.status === 'string' ? remoteSubscription.status : null;
    if (!validateProviderPayments(remotePayments, subscription.asaas_subscription_id)) {
      return jsonResponse(502, errorBody('PROVIDER_PAYMENT_MISMATCH', 'Não foi possível confirmar os dados das cobranças.'), origin);
    }
    const now = new Date().toISOString();
    const { patch, notices } = resolveBillingLifecycle({ subscription, payments: remotePayments, now });
    const payments = remotePayments.map((payment) => buildBillingPaymentRow({
      workspaceId, asaasPaymentId: String(payment.id),
      asaasSubscriptionId: subscription.asaas_subscription_id, eventType: 'PAYMENT_UPDATED', payment,
    }));
    const applied = await fetch(`${supabaseUrl}/rest/v1/rpc/apply_billing_lifecycle`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_subscription_id: subscription.id, p_expected_updated_at: subscription.updated_at,
        p_patch: patch, p_notices: notices, p_payments: payments, p_now: now }),
    });
    if (!applied.ok || await applied.json() !== true) {
      return jsonResponse(409, errorBody('RECONCILIATION_REQUIRED', 'A assinatura mudou durante a verificação. Tente novamente.'), origin);
    }
    const updatedStatus = patch.status ?? subscription.status;
    return jsonResponse(200, {
      workspace_id: workspaceId,
      exists: true,
      synced: true,
      internal_status: updatedStatus,
      provider_status: providerStatus,
      payments_reconciled: remotePayments.length,
      payments_upsert_ok: true,
      last_synced_at: new Date().toISOString(),
      sync_error: null,
    }, origin);
  } catch (error) {
    if (error instanceof AsaasConfigurationError) {
      return jsonResponse(503, errorBody('SERVICE_UNAVAILABLE', 'Integracao com a Asaas nao esta configurada.'), origin);
    }
    if (error instanceof AsaasTimeoutError || error instanceof AsaasNetworkError) {
      // BILLING2: falha de sincronizacao NUNCA corrompe o estado local --
      // nao escrevemos nada, so devolvemos o erro sanitizado.
      return jsonResponse(200, {
        workspace_id: workspaceId, exists: true, synced: false,
        internal_status: subscription.status, provider_status: null,
        last_synced_at: new Date().toISOString(), sync_error: error.code,
      }, origin);
    }
    if (error instanceof AsaasApiError) {
      console.log(JSON.stringify({ at: 'billing-sync', status: 'error', operationId: error.operationId, providerStatus: error.providerStatus }));
      return jsonResponse(200, {
        workspace_id: workspaceId, exists: true, synced: false,
        internal_status: subscription.status, provider_status: null,
        last_synced_at: new Date().toISOString(), sync_error: error.code,
      }, origin);
    }
    throw error;
  }
});
