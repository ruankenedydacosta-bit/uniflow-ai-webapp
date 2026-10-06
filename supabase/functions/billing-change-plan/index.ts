// Edge Function: billing-change-plan
//
// Épico #116 / #114: troca entre Essencial, Uni Voz e Uni Voz Plus.
// - Mesmo plano com troca agendada: desfaz o agendamento.
// - Descer: agenda para a próxima cobrança (pending_tier_id) e muda o valor
//   das próximas cobranças na Asaas. O ciclo atual não encolhe.
// - Subir: agenda igual e cria uma cobrança avulsa por Pix com a diferença.
//   Quando ela é paga, o billing-webhook aplica o nível novo já no ciclo atual
//   (voice_apply_upgrade). Se não for paga, o nível novo vale na próxima
//   cobrança, como uma descida.
// O preço vem de subscription_tiers; o corpo só escolhe o nível.

import {
  AsaasApiError,
  AsaasConfigurationError,
  AsaasNetworkError,
  AsaasTimeoutError,
  createAsaasClient,
} from '../_shared/asaasClient.ts';
import { buildUpgradeChargePayload, resolvePlanChange } from '../_shared/planChangeRules.ts';
import {
  buildSubscriptionDescription,
  fetchActiveSubscriptionTier,
  resolveRequestedTierId,
} from '../_shared/subscriptionTiers.ts';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FORBIDDEN_CLIENT_FIELDS = ['value', 'price', 'discount', 'status', 'asaas_subscription_id', 'customer_id'];

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

async function getActiveSubscription({
  authorization, supabaseUrl, anonKey, workspaceId,
}: { authorization: string; supabaseUrl: string; anonKey: string; workspaceId: string }) {
  const params = new URLSearchParams({
    select: '*', workspace_id: `eq.${workspaceId}`, status: 'eq.active', order: 'created_at.desc', limit: '1',
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/subscriptions?${params}`, {
    headers: { Authorization: authorization, apikey: anonKey },
  });
  if (!response.ok) return null;
  const rows = await response.json();
  return Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
}

async function patchPendingTier({
  supabaseUrl, serviceRoleKey, subscriptionId, pendingTierId,
}: { supabaseUrl: string; serviceRoleKey: string; subscriptionId: string; pendingTierId: string | null }) {
  const response = await fetch(`${supabaseUrl}/rest/v1/subscriptions?id=eq.${subscriptionId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ pending_tier_id: pendingTierId }),
  });
  if (!response.ok) throw new Error('BILLING_WRITE_FAILED:pending_tier');
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
  // Aqui o nível é obrigatório: ausente não vira o padrão.
  const targetTierId = payload?.tier_id === undefined ? null : resolveRequestedTierId(payload.tier_id);
  if (!targetTierId) {
    return jsonResponse(400, errorBody('INVALID_TIER', 'tier_id invalido -- use essencial, uni_voz ou uni_voz_plus.'), origin);
  }

  const isMember = await hasWorkspaceMembership({ authorization, supabaseUrl, anonKey, userId, workspaceId });
  if (!isMember) {
    return jsonResponse(403, errorBody('WORKSPACE_NOT_AUTHORIZED', 'Workspace nao autorizado.'), origin);
  }

  const subscription = await getActiveSubscription({ authorization, supabaseUrl, anonKey, workspaceId });
  if (!subscription) {
    return jsonResponse(404, errorBody('SUBSCRIPTION_NOT_FOUND', 'Nenhuma assinatura ativa para trocar de plano.'), origin);
  }
  if (subscription.cancel_at_period_end) {
    return jsonResponse(409, errorBody('SUBSCRIPTION_CANCEL_SCHEDULED', 'A assinatura tem cancelamento agendado.'), origin);
  }
  if (!subscription.asaas_subscription_id || !subscription.asaas_customer_id) {
    return jsonResponse(409, errorBody('SUBSCRIPTION_NOT_LINKED', 'Assinatura sem cobranca na Asaas.'), origin);
  }

  const [currentTier, targetTier] = await Promise.all([
    fetchActiveSubscriptionTier({ supabaseUrl, apiKey: anonKey, authorization, tierId: subscription.tier_id }),
    fetchActiveSubscriptionTier({ supabaseUrl, apiKey: anonKey, authorization, tierId: targetTierId }),
  ]);
  if (!currentTier || !targetTier) {
    return jsonResponse(400, errorBody('INVALID_TIER', 'Este plano nao esta disponivel.'), origin);
  }

  const change = resolvePlanChange(currentTier, targetTier);
  const asaasApiKey = Deno.env.get('ASAAS_API_KEY') ?? '';
  const asaasBaseUrl = Deno.env.get('ASAAS_BASE_URL') ?? '';

  try {
    const client = createAsaasClient({ apiKey: asaasApiKey, baseUrl: asaasBaseUrl, allowProduction: true });

    // As próximas cobranças passam a ter o preço do plano que vai valer.
    await client.updateSubscription(subscription.asaas_subscription_id, {
      value: targetTier.priceBrl,
      description: buildSubscriptionDescription(targetTier),
      updatePendingPayments: true,
    });

    if (change.kind === 'same') {
      await patchPendingTier({ supabaseUrl, serviceRoleKey, subscriptionId: subscription.id, pendingTierId: null });
      return jsonResponse(200, { kind: 'unscheduled', tier_id: currentTier.id }, origin);
    }

    await patchPendingTier({ supabaseUrl, serviceRoleKey, subscriptionId: subscription.id, pendingTierId: targetTier.id });

    if (change.kind === 'downgrade') {
      return jsonResponse(200, {
        kind: 'scheduled',
        tier_id: currentTier.id,
        pending_tier_id: targetTier.id,
        effective_at: subscription.current_period_ends_at,
      }, origin);
    }

    const charge = await client.createPayment(buildUpgradeChargePayload({
      asaasCustomerId: subscription.asaas_customer_id,
      subscriptionId: subscription.id,
      tier: targetTier,
      differenceBrl: change.differenceBrl,
      today: new Date().toISOString().slice(0, 10),
    })) as { id?: string; invoiceUrl?: string };
    const chargeId = typeof charge?.id === 'string' ? charge.id : null;
    if (!chargeId) {
      return jsonResponse(502, errorBody('ASAAS_API_ERROR', 'A Asaas nao retornou a cobranca da diferenca.'), origin);
    }

    let pix: Record<string, unknown> | null = null;
    try {
      const qr = await client.getPixQrCode(chargeId) as { encodedImage?: string; payload?: string; expirationDate?: string };
      if (qr?.encodedImage && qr?.payload) {
        pix = {
          encoded_image: qr.encodedImage,
          payload: qr.payload,
          expiration_date: typeof qr.expirationDate === 'string' ? qr.expirationDate : null,
          value: change.differenceBrl,
        };
      }
    } catch {
      pix = null;
    }

    return jsonResponse(201, {
      kind: 'upgrade',
      tier_id: currentTier.id,
      pending_tier_id: targetTier.id,
      difference_brl: change.differenceBrl,
      invoice_url: typeof charge?.invoiceUrl === 'string' ? charge.invoiceUrl : null,
      pix,
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
      console.log(JSON.stringify({ at: 'billing-change-plan', status: 'error', operationId: error.operationId, providerStatus: error.providerStatus }));
      return jsonResponse(error.httpStatus, errorBody('ASAAS_API_ERROR', error.message), origin);
    }
    throw error;
  }
});
