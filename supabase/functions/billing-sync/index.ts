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
import { isGracePeriodExpired } from '../_shared/billingSubscriptionRules.ts';
import { grantVoiceCycle, selectVoiceCycleGrants } from '../_shared/voiceCycleRules.ts';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAYMENT_EVIDENCE_STATUSES = new Set(['CONFIRMED', 'RECEIVED']);
const ACTIVATABLE_LOCAL_STATUSES = new Set(['pending', 'past_due', 'suspended']);

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
  const params = new URLSearchParams({ select: '*', workspace_id: `eq.${workspaceId}`, limit: '1' });
  const response = await fetch(`${supabaseUrl}/rest/v1/subscriptions?${params}`, {
    headers: { Authorization: authorization, apikey: anonKey },
  });
  if (!response.ok) return null;
  const rows = await response.json();
  return Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
}

async function upsertBillingPayments({
  supabaseUrl, serviceRoleKey, workspaceId, asaasSubscriptionId, payments,
}: {
  supabaseUrl: string; serviceRoleKey: string; workspaceId: string; asaasSubscriptionId: string;
  payments: Array<Record<string, unknown>>;
}) {
  if (!payments.length) return true;
  const rows = payments.map((payment) => ({
    workspace_id: workspaceId,
    asaas_payment_id: payment.id,
    asaas_subscription_id: asaasSubscriptionId,
    status: String(payment.status ?? '').toLowerCase(),
    billing_type: payment.billingType ? String(payment.billingType).toLowerCase() : null,
    value: payment.value ?? 0,
    due_date: payment.dueDate ?? null,
    paid_at: payment.paymentDate ?? payment.clientPaymentDate ?? null,
    invoice_url: payment.invoiceUrl ?? null,
  }));
  const response = await fetch(`${supabaseUrl}/rest/v1/billing_payments?on_conflict=asaas_payment_id`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Content-Type': 'application/json',
      // BILLING2: upsert por asaas_payment_id (unique index da migration
      // 024) -- reconciliacao repetida nunca duplica cobrancas.
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify(rows),
  });
  return response.ok;
}

async function patchSubscriptionStatus({
  supabaseUrl, serviceRoleKey, subscriptionId, status,
}: { supabaseUrl: string; serviceRoleKey: string; subscriptionId: string; status: string }) {
  const params = new URLSearchParams({ id: `eq.${subscriptionId}` });
  const response = await fetch(`${supabaseUrl}/rest/v1/subscriptions?${params}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ status }),
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
    const hasConfirmedPayment = remotePayments.some((payment) => PAYMENT_EVIDENCE_STATUSES.has(String(payment.status ?? '').toUpperCase()));

    const paymentsUpserted = await upsertBillingPayments({
      supabaseUrl, serviceRoleKey, workspaceId,
      asaasSubscriptionId: subscription.asaas_subscription_id, payments: remotePayments,
    });

    let updatedStatus = subscription.status;
    if (hasConfirmedPayment && ACTIVATABLE_LOCAL_STATUSES.has(subscription.status)) {
      const updated = await patchSubscriptionStatus({
        supabaseUrl, serviceRoleKey, subscriptionId: subscription.id, status: 'active',
      });
      if (updated) updatedStatus = updated.status;
    } else if (subscription.status === 'past_due') {
      // BLOCO ASAAS FINAL: Asaas nao envia um evento "3 dias se passaram" --
      // e por isso que a carencia so pode ser avaliada de forma REATIVA,
      // aqui (billing-sync ja existe exatamente para reconciliacao) e no
      // processamento do webhook. `updated_at` da propria assinatura E o
      // timestamp de quando ela virou 'past_due' (o UPDATE que aplicou esse
      // status ja atualiza updated_at via trigger existente -- nenhuma
      // coluna nova necessaria). Nunca suspende uma assinatura que acabou
      // de ganhar evidencia de pagamento (branch acima tem prioridade).
      if (isGracePeriodExpired({ pastDueSince: subscription.updated_at, now: new Date().toISOString() })) {
        const updated = await patchSubscriptionStatus({
          supabaseUrl, serviceRoleKey, subscriptionId: subscription.id, status: 'suspended',
        });
        if (updated) updatedStatus = updated.status;
      }
    }

    // Webhook perdido não pode deixar o assinante sem minutos: toda cobrança
    // paga cujo ciclo ainda vale abre o ciclo de voz (idempotente).
    let voiceCyclesGranted = 0;
    if (updatedStatus === 'active') {
      const today = new Date().toISOString().slice(0, 10);
      for (const grant of selectVoiceCycleGrants(remotePayments, today)) {
        await grantVoiceCycle({ supabaseUrl, serviceRoleKey, subscriptionId: subscription.id, grant });
        voiceCyclesGranted += 1;
      }
    }

    return jsonResponse(200, {
      workspace_id: workspaceId,
      exists: true,
      synced: true,
      voice_cycles_granted: voiceCyclesGranted,
      internal_status: updatedStatus,
      provider_status: providerStatus,
      payments_reconciled: remotePayments.length,
      payments_upsert_ok: paymentsUpserted,
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
