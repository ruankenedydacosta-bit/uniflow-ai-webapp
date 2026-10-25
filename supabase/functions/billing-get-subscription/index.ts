// Edge Function: billing-get-subscription
//
// BILLING2 (Bloco Asaas 2): devolve uma visao NORMALIZADA da assinatura do
// workspace -- nunca o payload bruto da Asaas, nunca ativa/suspende/cancela
// nada (uma consulta e so leitura, mesmo quando refaz a chamada a Asaas
// para atualizar o status externo em tela). Fonte oficial:
// https://docs.asaas.com/reference/retrieve-a-single-subscription
// (status ACTIVE/INACTIVE/EXPIRED, nextDueDate, cycle, value, deleted).

import {
  AsaasApiError,
  AsaasConfigurationError,
  AsaasNetworkError,
  AsaasTimeoutError,
  createAsaasClient,
} from '../_shared/asaasClient.ts';
import { getPlanLabel } from '../_shared/planCatalog.js';

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
  const params = new URLSearchParams({ select: '*', workspace_id: `eq.${workspaceId}`, limit: '1' });
  const response = await fetch(`${supabaseUrl}/rest/v1/subscriptions?${params}`, {
    headers: { Authorization: authorization, apikey: anonKey },
  });
  if (!response.ok) return null;
  const rows = await response.json();
  return Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
}

// CORRECAO FINAL PIX: mesma logica de billing-create-subscription (primeira
// cobranca = menor dueDate) -- duplicada aqui de proposito (cada Edge
// Function deste projeto e autocontida, mesmo padrao ja usado para
// hasWorkspaceMembership/etc. em todo o resto do billing).
function pickEarliestPayment(payments: Array<Record<string, unknown>>): Record<string, unknown> | null {
  if (!Array.isArray(payments) || payments.length === 0) return null;
  const sorted = [...payments].sort((a, b) => {
    const dateA = typeof a.dueDate === 'string' ? a.dueDate : '';
    const dateB = typeof b.dueDate === 'string' ? b.dueDate : '';
    return dateA.localeCompare(dateB);
  });
  return sorted[0];
}

// CORRECAO FINAL PIX: so chamado quando a assinatura local ja e Pix +
// pending (ver guarda no handler) -- nunca para cartao/outros status,
// evitando chamadas desnecessarias a Asaas. Best-effort: falha aqui nunca
// quebra a consulta de status (mesmo padrao do bloco de providerStatus
// logo abaixo).
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

  const local = await getLocalSubscription({ authorization, supabaseUrl, anonKey, workspaceId });
  if (!local) {
    // Assinatura ausente: estado real e valido, nunca um erro.
    return jsonResponse(200, { workspace_id: workspaceId, exists: false, internal_status: 'free' }, origin);
  }

  let providerStatus: string | null = null;
  let providerDeleted: boolean | null = null;
  let pix: Record<string, unknown> | null = null;
  if (local.asaas_subscription_id) {
    const asaasApiKey = Deno.env.get('ASAAS_API_KEY') ?? '';
    const asaasBaseUrl = Deno.env.get('ASAAS_BASE_URL') ?? '';
    try {
      const client = createAsaasClient({
  apiKey: asaasApiKey,
  baseUrl: asaasBaseUrl,
  allowProduction: true,
});
      const remote = await client.getSubscription(local.asaas_subscription_id) as { status?: string; deleted?: boolean };
      providerStatus = typeof remote?.status === 'string' ? remote.status : null;
      providerDeleted = typeof remote?.deleted === 'boolean' ? remote.deleted : null;

      // CORRECAO FINAL PIX: so busca o QR quando a tela realmente precisa
      // dele -- Pix ainda pendente (aguardando pagamento). Reload da pagina
      // enquanto pending precisa continuar mostrando o QR, sem precisar
      // criar outra assinatura.
      if (local.payment_method === 'pix' && local.status === 'pending') {
        pix = await fetchPixQrCode(client, local.asaas_subscription_id);
      }
    } catch (error) {
      // BILLING2: consultar a Asaas e best-effort aqui -- se falhar, ainda
      // devolvemos o estado local (nunca quebramos a tela por causa de uma
      // falha de rede/timeout numa mera consulta de status).
      if (error instanceof AsaasApiError) {
        console.log(JSON.stringify({ at: 'billing-get-subscription', status: 'provider_error', operationId: error.operationId, providerStatus: error.providerStatus }));
      } else if (error instanceof AsaasTimeoutError || error instanceof AsaasNetworkError || error instanceof AsaasConfigurationError) {
        console.log(JSON.stringify({ at: 'billing-get-subscription', status: 'provider_unavailable', code: error.code }));
      } else {
        throw error;
      }
    }
  }

  return jsonResponse(200, {
    workspace_id: workspaceId,
    exists: true,
    plan_id: local.plan_id,
    plan_name: getPlanLabel(local.plan_id),
    value: 29.9,
    cycle: 'MONTHLY',
    internal_status: local.status,
    provider_status: providerStatus,
    provider_deleted: providerDeleted,
    payment_method: local.payment_method,
    pix,
    current_period_ends_at: local.current_period_ends_at,
    trial_ends_at: local.trial_ends_at,
    cancel_at_period_end: local.cancel_at_period_end,
    cancel_effective_at: local.cancel_effective_at,
    // BILLING2: "situacao de regularizacao" -- true quando o status interno
    // indica inadimplencia (mapeamento oficial, ver billingTypes.js no
    // frontend: OVERDUE='past_due', SUSPENDED='suspended').
    needs_regularization: local.status === 'past_due' || local.status === 'suspended',
  }, origin);
});
