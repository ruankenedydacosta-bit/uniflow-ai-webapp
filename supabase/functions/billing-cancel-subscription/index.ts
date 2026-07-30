// Edge Function: billing-cancel-subscription
//
// BILLING2 (Bloco Asaas 2): cancela a RENOVACAO da assinatura -- nunca o
// acesso ja pago (decisao comercial congelada, Bloco Asaas 0). Separa
// explicitamente duas coisas:
// - cancelamento NO PROVEDOR: DELETE /v3/subscriptions/{id} na Asaas, que
//   para a geracao de NOVAS cobrancas (efeito documentado da propria API);
// - direito INTERNO de acesso ate o fim do ciclo ja pago: nunca delegado a
//   Asaas -- controlado só por `cancel_at_period_end`/`cancel_effective_at`
//   no nosso banco (colunas aditivas da migration 024).
//
// Nunca apaga cliente, pagamentos ou historico. Nunca gera reembolso
// automatico (isso e responsabilidade separada, ainda nao decidida
// comercialmente -- ver DECISOES_COMERCIAIS_PENDENTES).

import {
  AsaasApiError,
  AsaasConfigurationError,
  AsaasNetworkError,
  AsaasTimeoutError,
  createAsaasClient,
} from '../_shared/asaasClient.ts';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TERMINAL_STATUSES = new Set(['canceled', 'expired']);

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

async function patchSubscription({
  supabaseUrl, serviceRoleKey, subscriptionId, patch,
}: { supabaseUrl: string; serviceRoleKey: string; subscriptionId: string; patch: Record<string, unknown> }) {
  const params = new URLSearchParams({ id: `eq.${subscriptionId}` });
  const response = await fetch(`${supabaseUrl}/rest/v1/subscriptions?${params}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(patch),
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
    return jsonResponse(404, errorBody('SUBSCRIPTION_NOT_FOUND', 'Nenhuma assinatura encontrada para este workspace.'), origin);
  }

  if (TERMINAL_STATUSES.has(subscription.status)) {
    return jsonResponse(409, errorBody('SUBSCRIPTION_ALREADY_CANCELED', 'Esta assinatura ja esta cancelada ou expirada.'), origin);
  }

  // Repeticao idempotente: cancelamento ja agendado -- responde sucesso sem
  // repetir a chamada a Asaas nem alterar nada de novo.
  if (subscription.cancel_at_period_end) {
    return jsonResponse(200, {
      workspace_id: workspaceId,
      status: subscription.status,
      cancel_at_period_end: true,
      cancel_effective_at: subscription.cancel_effective_at,
      already_scheduled: true,
    }, origin);
  }

  if (!subscription.asaas_subscription_id) {
    return jsonResponse(409, errorBody('SUBSCRIPTION_NOT_LINKED', 'Assinatura sem vinculo com a Asaas -- reconciliar antes de cancelar.'), origin);
  }

  const asaasApiKey = Deno.env.get('ASAAS_API_KEY') ?? '';
  const asaasBaseUrl = Deno.env.get('ASAAS_BASE_URL') ?? '';

  try {
    const client = createAsaasClient({ apiKey: asaasApiKey, baseUrl: asaasBaseUrl, allowProduction: true });
    // Cancela no PROVEDOR primeiro -- so atualizamos o estado local depois
    // de confirmar que a Asaas parou de gerar novas cobrancas. Se isto
    // falhar, nada muda localmente (nunca uma inconsistencia escondida).
    await client.cancelSubscription(subscription.asaas_subscription_id);

    // BILLING2: assinatura NUNCA ativada (ainda 'pending', sem evidencia de
    // pagamento) -- cancelar e definitivo, nao ha periodo pago a preservar.
    // Assinatura JA ativa/em regularizacao -- cancela so a renovacao,
    // mantem acesso ate o fim do periodo ja pago.
    const isPending = subscription.status === 'pending';
    const patch = isPending
      ? { status: 'canceled' }
      : {
          cancel_at_period_end: true,
          cancel_effective_at: subscription.current_period_ends_at ?? new Date().toISOString(),
        };

    const updated = await patchSubscription({ supabaseUrl, serviceRoleKey, subscriptionId: subscription.id, patch });
    if (!updated) {
      // Falha LOCAL apos sucesso EXTERNO -- estado precisa de reconciliacao
      // (billing-sync), nunca escondido do chamador.
      return jsonResponse(502, errorBody(
        'RECONCILIATION_REQUIRED',
        'Cancelamento confirmado na Asaas, mas nao foi possivel atualizar o estado local. Execute billing-sync para reconciliar.',
      ), origin);
    }

    return jsonResponse(200, {
      workspace_id: workspaceId,
      status: updated.status,
      cancel_at_period_end: updated.cancel_at_period_end,
      cancel_effective_at: updated.cancel_effective_at,
      already_scheduled: false,
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
      console.log(JSON.stringify({ at: 'billing-cancel-subscription', status: 'error', operationId: error.operationId, providerStatus: error.providerStatus }));
      return jsonResponse(error.httpStatus, errorBody('ASAAS_API_ERROR', error.message), origin);
    }
    throw error;
  }
});
