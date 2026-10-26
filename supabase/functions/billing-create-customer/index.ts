// Edge Function: billing-create-customer
//
// BILLING2 (Bloco Asaas 2): cria (ou reaproveita) o cliente Asaas para o
// workspace. O backend e a UNICA fonte dos dados enviados a Asaas -- o
// frontend nunca controla asaas_customer_id, status ou preco (nao ha preco
// aqui, so no proximo passo). Fonte oficial:
// https://docs.asaas.com/reference/create-new-customer (name/cpfCnpj
// obrigatorios; demais campos opcionais) e
// https://docs.asaas.com/reference/list-customers (filtro por
// externalReference, usado como camada extra de idempotencia do lado da
// Asaas).
//
// PENDENCIA CONHECIDA (documentada, nao corrigida nesta fase): nenhuma
// tabela do projeto tem uma coluna cpf_cnpj para PESSOA (profiles nao tem
// -- so billing_customers.cpf_cnpj, adicionada pela migration 024, guarda o
// documento DEPOIS que o cliente ja existe). Como a Asaas exige cpfCnpj
// para criar um cliente e nada no banco fornece esse dado hoje, esta funcao
// EXIGE cpf_cnpj no corpo da requisicao -- nunca inventa um valor. Uma
// fase futura de UI (checkout) e quem vai coletar isso do usuario.

import {
  AsaasApiError,
  AsaasConfigurationError,
  AsaasNetworkError,
  AsaasTimeoutError,
  AsaasValidationError,
  createAsaasClient,
} from '../_shared/asaasClient.ts';
import { normalizeCpfCnpj } from '../../../src/utils/cpfCnpj.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// BILLING2: o frontend nunca pode controlar diretamente estes campos --
// mesmo que sejam enviados no corpo, sao ignorados/rejeitados. Fonte da
// verdade sobre vinculo/ativacao e sempre o backend + a confirmacao da
// Asaas via webhook (fase futura).
const FORBIDDEN_CLIENT_FIELDS = ['asaas_customer_id', 'status', 'plan_id', 'value'];

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
  return typeof user?.id === 'string' ? { id: user.id, email: typeof user?.email === 'string' ? user.email : null } : null;
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

async function getExistingBillingCustomer({
  authorization, supabaseUrl, anonKey, workspaceId,
}: { authorization: string; supabaseUrl: string; anonKey: string; workspaceId: string }) {
  const params = new URLSearchParams({ select: '*', workspace_id: `eq.${workspaceId}`, limit: '1' });
  const response = await fetch(`${supabaseUrl}/rest/v1/billing_customers?${params}`, {
    headers: { Authorization: authorization, apikey: anonKey },
  });
  if (!response.ok) return null;
  const rows = await response.json();
  return Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
}

async function getProfile({
  authorization, supabaseUrl, anonKey, userId,
}: { authorization: string; supabaseUrl: string; anonKey: string; userId: string }) {
  const params = new URLSearchParams({ select: 'full_name,phone', id: `eq.${userId}`, limit: '1' });
  const response = await fetch(`${supabaseUrl}/rest/v1/profiles?${params}`, {
    headers: { Authorization: authorization, apikey: anonKey },
  });
  if (!response.ok) return null;
  const rows = await response.json();
  return Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
}

async function persistBillingCustomer({
  supabaseUrl, serviceRoleKey, workspaceId, asaasCustomerId, cpfCnpj, email,
}: {
  supabaseUrl: string; serviceRoleKey: string; workspaceId: string; asaasCustomerId: string;
  cpfCnpj: string; email: string | null;
}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/billing_customers`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ workspace_id: workspaceId, asaas_customer_id: asaasCustomerId, cpf_cnpj: cpfCnpj, email }),
  });
  if (!response.ok) return null;
  const rows = await response.json();
  return Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
}

async function findOperationAttempt({
  supabaseUrl, serviceRoleKey, operation, workspaceId, planId = null,
}: {
  supabaseUrl: string; serviceRoleKey: string; operation: string; workspaceId: string; planId?: string | null;
}) {
  const params = new URLSearchParams({
    select: '*', operation: `eq.${operation}`, workspace_id: `eq.${workspaceId}`, limit: '1',
    plan_id: planId ? `eq.${planId}` : 'is.null',
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/billing_operation_attempts?${params}`, {
    headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey },
  });
  if (!response.ok) return null;
  const rows = await response.json();
  return Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
}

async function claimOperationAttempt({
  supabaseUrl, serviceRoleKey, operation, workspaceId, planId = null,
}: {
  supabaseUrl: string; serviceRoleKey: string; operation: string; workspaceId: string; planId?: string | null;
}) {
  const body = { operation, workspace_id: workspaceId, plan_id: planId, status: 'processing' };
  const inserted = await fetch(`${supabaseUrl}/rest/v1/billing_operation_attempts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey,
      'Content-Type': 'application/json', Prefer: 'return=representation',
    },
    body: JSON.stringify(body),
  });
  if (inserted.ok) {
    const rows = await inserted.json();
    return { claimed: true, attempt: Array.isArray(rows) ? rows[0] : null };
  }
  if (inserted.status !== 409) return { claimed: false, attempt: null, unavailable: true };

  const existing = await findOperationAttempt({ supabaseUrl, serviceRoleKey, operation, workspaceId, planId });
  if (existing?.status !== 'failed') return { claimed: false, attempt: existing };
  const params = new URLSearchParams({
    operation: `eq.${operation}`, workspace_id: `eq.${workspaceId}`, status: 'eq.failed',
    plan_id: planId ? `eq.${planId}` : 'is.null',
  });
  const retried = await fetch(`${supabaseUrl}/rest/v1/billing_operation_attempts?${params}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey,
      'Content-Type': 'application/json', Prefer: 'return=representation',
    },
    body: JSON.stringify({ status: 'processing', provider_resource_id: null }),
  });
  const rows = retried.ok ? await retried.json() : [];
  if (Array.isArray(rows) && rows.length === 1) return { claimed: true, attempt: rows[0] };
  return { claimed: false, attempt: await findOperationAttempt({ supabaseUrl, serviceRoleKey, operation, workspaceId, planId }) };
}

async function updateOperationAttempt({
  supabaseUrl, serviceRoleKey, attemptId, status, providerResourceId,
}: {
  supabaseUrl: string; serviceRoleKey: string; attemptId: string; status: string; providerResourceId?: string | null;
}) {
  const params = new URLSearchParams({ id: `eq.${attemptId}` });
  const response = await fetch(`${supabaseUrl}/rest/v1/billing_operation_attempts?${params}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey,
      'Content-Type': 'application/json', Prefer: 'return=minimal',
    },
    body: JSON.stringify({ status, provider_resource_id: providerResourceId ?? null }),
  });
  return response.ok;
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

  const user = await getAuthenticatedUserId(authorization, supabaseUrl, anonKey);
  if (!user) return jsonResponse(401, errorBody('INVALID_SESSION', 'Sessao invalida.'), origin);

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

  const isMember = await hasWorkspaceMembership({ authorization, supabaseUrl, anonKey, userId: user.id, workspaceId });
  if (!isMember) {
    return jsonResponse(403, errorBody('WORKSPACE_NOT_AUTHORIZED', 'Workspace nao autorizado.'), origin);
  }

  // Idempotencia (camada 1): ja existe vinculo no NOSSO banco para este
  // workspace -- nunca cria um segundo cliente na Asaas.
  const existing = await getExistingBillingCustomer({ authorization, supabaseUrl, anonKey, workspaceId });
  if (existing) {
    return jsonResponse(200, {
      workspace_id: workspaceId,
      asaas_customer_id: existing.asaas_customer_id,
      reused: true,
    }, origin);
  }

  const cpfCnpj = normalizeCpfCnpj(payload?.cpf_cnpj);
  if (!cpfCnpj) {
    return jsonResponse(422, errorBody('INVALID_CPF_CNPJ', 'Informe um CPF ou CNPJ válido, com dígitos verificadores corretos.'), origin);
  }

  const profile = await getProfile({ authorization, supabaseUrl, anonKey, userId: user.id });
  const name = typeof profile?.full_name === 'string' ? profile.full_name.trim() : '';
  if (!name) {
    return jsonResponse(422, errorBody('MISSING_REQUIRED_FIELD', 'Nome do perfil ausente -- necessario para criar o cliente na Asaas.'), origin);
  }

  const email = typeof payload?.email === 'string' && payload.email.trim() ? payload.email.trim() : user.email;
  const mobilePhone = typeof payload?.mobile_phone === 'string' && payload.mobile_phone.trim()
    ? payload.mobile_phone.trim()
    : (typeof profile?.phone === 'string' ? profile.phone : undefined);

  const asaasApiKey = Deno.env.get('ASAAS_API_KEY') ?? '';
  const asaasBaseUrl = Deno.env.get('ASAAS_BASE_URL') ?? '';

  try {
    const client = createAsaasClient({ apiKey: asaasApiKey, baseUrl: asaasBaseUrl });

    const claim = await claimOperationAttempt({ supabaseUrl, serviceRoleKey, operation: 'customer', workspaceId });
    if (claim.unavailable) {
      return jsonResponse(503, errorBody('OPERATION_GUARD_UNAVAILABLE', 'Não foi possível reservar a criação do cliente. Tente novamente.'), origin);
    }
    const attempt = claim.attempt as { id?: string; status?: string; provider_resource_id?: string } | null;
    if (!claim.claimed && attempt?.status === 'completed' && attempt.provider_resource_id) {
      const persisted = await persistBillingCustomer({
        supabaseUrl, serviceRoleKey, workspaceId, asaasCustomerId: attempt.provider_resource_id, cpfCnpj, email: email ?? null,
      });
      if (persisted) return jsonResponse(200, { workspace_id: workspaceId, asaas_customer_id: attempt.provider_resource_id, reused: true }, origin);
      return jsonResponse(502, errorBody('PERSISTENCE_FAILED', 'Cliente existente na Asaas, mas não foi possível concluir o vínculo local.'), origin);
    }
    if (!claim.claimed) {
      return jsonResponse(409, errorBody('OPERATION_IN_PROGRESS', 'Já existe uma tentativa de criação do cliente. Aguarde a reconciliação antes de tentar novamente.'), origin);
    }

    // Idempotencia (camada 2): busca por externalReference do lado da
    // Asaas, cobrindo o caso em que uma tentativa anterior criou o cliente
    // na Asaas mas falhou antes de persistir no nosso banco.
    const found = await client.findCustomersByExternalReference(workspaceId);
    const foundList = Array.isArray((found as { data?: unknown[] })?.data) ? (found as { data: Array<{ id: string }> }).data : [];
    let asaasCustomerId = foundList.length === 1 ? foundList[0].id : null;
    if (foundList.length > 1) {
      await updateOperationAttempt({ supabaseUrl, serviceRoleKey, attemptId: attempt?.id ?? '', status: 'uncertain' });
      return jsonResponse(409, errorBody('CUSTOMER_RECONCILIATION_REQUIRED', 'Foram encontrados vários clientes vinculados. A criação foi bloqueada para reconciliação.'), origin);
    }

    if (!asaasCustomerId) {
      const created = await client.createCustomer({
        name,
        cpfCnpj,
        email,
        mobilePhone,
        externalReference: workspaceId,
        // CORRECAO NOTIFICACOES: todo customer NOVO criado pela UniFlow deve
        // nascer com as notificacoes automaticas de cobranca da Asaas
        // (e-mail/SMS de vencimento, lembrete, etc.) desligadas -- boolean
        // `true`, nunca string. Fonte oficial:
        // https://docs.asaas.com/reference/create-new-customer. Nao afeta
        // nome/CPF/e-mail/telefone -- so este campo e adicionado. Customers
        // reaproveitados (camadas de idempotencia acima) preservam o
        // comportamento existente por decisao explicita de escopo -- nao ha
        // chamada de atualizacao aqui.
        notificationDisabled: true,
      }) as { id?: string };
      asaasCustomerId = typeof created?.id === 'string' ? created.id : null;
    }

    if (!asaasCustomerId) {
      await updateOperationAttempt({ supabaseUrl, serviceRoleKey, attemptId: attempt?.id ?? '', status: 'uncertain' });
      return jsonResponse(502, errorBody('ASAAS_API_ERROR', 'A Asaas nao retornou um identificador de cliente valido.'), origin);
    }

    const completed = await updateOperationAttempt({ supabaseUrl, serviceRoleKey, attemptId: attempt?.id ?? '', status: 'completed', providerResourceId: asaasCustomerId });
    if (!completed) return jsonResponse(502, errorBody('PERSISTENCE_FAILED', 'Cliente criado na Asaas, mas a tentativa não foi registrada. Aguarde reconciliação antes de tentar novamente.'), origin);

    const persisted = await persistBillingCustomer({
      supabaseUrl, serviceRoleKey, workspaceId, asaasCustomerId, cpfCnpj, email: email ?? null,
    });
    if (!persisted) {
      // BILLING2: cliente criado na Asaas mas a persistencia local falhou --
      // nunca escondido. A proxima chamada encontra o cliente via
      // externalReference (camada 2 acima) e conclui a persistencia.
      return jsonResponse(502, errorBody('PERSISTENCE_FAILED', 'Cliente criado na Asaas, mas nao foi possivel salvar localmente. Tente novamente.'), origin);
    }

    return jsonResponse(201, {
      workspace_id: workspaceId,
      asaas_customer_id: asaasCustomerId,
      reused: false,
    }, origin);
  } catch (error) {
    if (
      error instanceof AsaasConfigurationError
      || error instanceof AsaasValidationError
      || (error instanceof AsaasApiError && error.providerStatus === 400)
    ) {
      const attempt = await findOperationAttempt({ supabaseUrl, serviceRoleKey, operation: 'customer', workspaceId });
      if (attempt?.id) await updateOperationAttempt({ supabaseUrl, serviceRoleKey, attemptId: attempt.id, status: 'failed' });
    }
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
      console.log(JSON.stringify({ at: 'billing-create-customer', status: 'error', operationId: error.operationId, providerStatus: error.providerStatus }));
      return jsonResponse(error.httpStatus, errorBody('ASAAS_API_ERROR', error.message), origin);
    }
    throw error;
  }
});
