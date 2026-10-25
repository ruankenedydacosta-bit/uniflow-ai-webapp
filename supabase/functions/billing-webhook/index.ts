// Edge Function: billing-webhook
//
// BILLING2 (Bloco Asaas 2): camada SEGURA de recebimento e armazenamento
// do evento de webhook da Asaas -- valida autenticidade, valida a forma
// minima do payload, grava em `webhook_events` com idempotencia por
// `asaas_event_id`, e responde 2xx rapidamente.
//
// BLOCO ASAAS FINAL: agora TAMBEM processa o evento de forma idempotente
// logo apos persistir (ver processPaymentEvent abaixo) -- nunca antes de
// persistir, e a falha de processamento NUNCA derruba a resposta 2xx (o
// evento ja esta salvo; um erro de processamento fica registrado em
// webhook_events.processing_error para investigacao, sem bloquear a
// Asaas). Regras de negocio (o QUE cada evento faz) vivem em
// _shared/billingSubscriptionRules.ts, puras e sem I/O, para serem
// auditadas/testadas isoladamente.
//
// Fonte oficial: https://docs.asaas.com/docs/about-webhooks
// - Header de autenticidade: `asaas-access-token`, valor = o `authToken`
//   configurado no webhook (CONFIRMADO na doc oficial -- nao e mais um
//   placeholder como no Bloco Asaas 1). Nunca a API key, nunca um Bearer de
//   sessao de usuario -- quem chama este endpoint e a propria Asaas,
//   servidor a servidor.
// - Payload: `{ id, event, dateCreated, payment: {...} }` -- o campo `id`
//   (nivel raiz) e o identificador UNICO do evento, usado para
//   deduplicacao ("Each event sent by Webhooks has its own ID, which
//   remains the same if it is the same event.").

import { createAsaasClient } from '../_shared/asaasClient.ts';
import {
  buildBillingPaymentRow,
  PROCESSABLE_CHECKOUT_EVENT_TYPES,
  PROCESSABLE_PAYMENT_EVENT_TYPES,
  isProviderPaymentStatusConsistent,
  resolveCheckoutHygienePatch,
  resolveSubscriptionPatchForEvent,
} from '../_shared/billingSubscriptionRules.ts';
import {
  assertBillingWebhookWriteSucceeded,
  buildWebhookProcessingFailurePatch,
  buildWebhookProcessingSuccessPatch,
  isWebhookEventEligibleForProcessing,
} from '../_shared/billingWebhookReliability.ts';

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const ASAAS_WEBHOOK_TOKEN_HEADER = 'asaas-access-token';

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorBody(code: string, message: string) {
  return { error: { code, message } };
}

function sanitizeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  // BLOCO ASAAS FINAL: nunca deixa o token/payload bruto vazar para dentro
  // da mensagem de erro persistida -- só o tipo/mensagem curta do erro.
  return message.slice(0, 300);
}

// BILLING2: persiste o evento com idempotencia -- Prefer:
// resolution=ignore-duplicates faz o Postgres/PostgREST ignorar
// silenciosamente um conflito no indice unico (asaas_event_id), sem
// lancar erro e sem duplicar a linha. `return=representation` devolve a
// linha SÓ quando ela foi de fato inserida agora -- um array vazio
// significa "já existia" (evento duplicado).
async function persistWebhookEvent({
  supabaseUrl, serviceRoleKey, asaasEventId, eventType, payload,
}: {
  supabaseUrl: string; serviceRoleKey: string; asaasEventId: string; eventType: string; payload: unknown;
}): Promise<{ ok: boolean; insertedRow: Record<string, unknown> | null }> {
  const response = await fetch(`${supabaseUrl}/rest/v1/webhook_events?on_conflict=asaas_event_id`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Content-Type': 'application/json',
      Prefer: 'resolution=ignore-duplicates,return=representation',
    },
    body: JSON.stringify({ asaas_event_id: asaasEventId, event_type: eventType, payload }),
  });
  if (!response.ok) return { ok: false, insertedRow: null };
  const rows = await response.json();
  return { ok: true, insertedRow: Array.isArray(rows) && rows.length === 1 ? rows[0] : null };
}

async function fetchWebhookEventByEventId({
  supabaseUrl, serviceRoleKey, asaasEventId,
}: { supabaseUrl: string; serviceRoleKey: string; asaasEventId: string }) {
  const params = new URLSearchParams({ select: 'id,processed_at,processing_error', asaas_event_id: `eq.${asaasEventId}`, limit: '1' });
  const response = await fetch(`${supabaseUrl}/rest/v1/webhook_events?${params}`, {
    headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey },
  });
  if (!response.ok) return null;
  const rows = await response.json();
  return Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
}

async function patchWebhookEventProcessingState({
  supabaseUrl, serviceRoleKey, eventRowId, patch,
}: {
  supabaseUrl: string;
  serviceRoleKey: string;
  eventRowId: string;
  patch: { processed_at: string | null; processing_error: string | null };
}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/webhook_events?id=eq.${eventRowId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(patch),
  });
  assertBillingWebhookWriteSucceeded(response, 'webhook_event_processing_state');
}

async function findBillingCustomerWorkspace({
  supabaseUrl, serviceRoleKey, asaasCustomerId,
}: { supabaseUrl: string; serviceRoleKey: string; asaasCustomerId: string }) {
  const params = new URLSearchParams({ select: 'workspace_id', asaas_customer_id: `eq.${asaasCustomerId}`, limit: '1' });
  const response = await fetch(`${supabaseUrl}/rest/v1/billing_customers?${params}`, {
    headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey },
  });
  if (!response.ok) return null;
  const rows = await response.json();
  return Array.isArray(rows) && rows.length === 1 ? rows[0].workspace_id as string : null;
}

async function findSubscriptionByAsaasId({
  supabaseUrl, serviceRoleKey, asaasSubscriptionId,
}: { supabaseUrl: string; serviceRoleKey: string; asaasSubscriptionId: string }) {
  const params = new URLSearchParams({ select: '*', asaas_subscription_id: `eq.${asaasSubscriptionId}`, limit: '1' });
  const response = await fetch(`${supabaseUrl}/rest/v1/subscriptions?${params}`, {
    headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey },
  });
  if (!response.ok) return null;
  const rows = await response.json();
  return Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
}

// BLOCO ASAAS CHECKOUT: localiza a assinatura local pendente criada por
// billing-create-checkout, pelo id do Checkout (nunca pelo id de
// pagamento/assinatura -- ver migration 026).
async function findSubscriptionByCheckoutId({
  supabaseUrl, serviceRoleKey, asaasCheckoutId,
}: { supabaseUrl: string; serviceRoleKey: string; asaasCheckoutId: string }) {
  const params = new URLSearchParams({ select: '*', asaas_checkout_id: `eq.${asaasCheckoutId}`, limit: '1' });
  const response = await fetch(`${supabaseUrl}/rest/v1/subscriptions?${params}`, {
    headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey },
  });
  if (!response.ok) return null;
  const rows = await response.json();
  return Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
}

async function findBillingCustomerByWorkspace({
  supabaseUrl, serviceRoleKey, workspaceId,
}: { supabaseUrl: string; serviceRoleKey: string; workspaceId: string }) {
  const params = new URLSearchParams({ select: 'id', workspace_id: `eq.${workspaceId}`, limit: '1' });
  const response = await fetch(`${supabaseUrl}/rest/v1/billing_customers?${params}`, {
    headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey },
  });
  if (!response.ok) return null;
  const rows = await response.json();
  return Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
}

// BLOCO ASAAS CHECKOUT: mantem billing_customers em sincronia com o
// asaas_customer_id REAL da assinatura (o Checkout so aceita customerData,
// nunca um customer id existente -- a Asaas pode ter criado um cliente
// diferente do que ja tinhamos). cpf_cnpj/email ficam null quando a linha e
// nova aqui -- o Checkout nao devolve esses dados de volta em nenhum
// webhook (nunca inventados).
async function upsertBillingCustomerAsaasId({
  supabaseUrl, serviceRoleKey, workspaceId, asaasCustomerId,
}: { supabaseUrl: string; serviceRoleKey: string; workspaceId: string; asaasCustomerId: string }) {
  const existing = await findBillingCustomerByWorkspace({ supabaseUrl, serviceRoleKey, workspaceId });
  if (existing) {
    const response = await fetch(`${supabaseUrl}/rest/v1/billing_customers?id=eq.${existing.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ asaas_customer_id: asaasCustomerId }),
    });
    assertBillingWebhookWriteSucceeded(response, 'billing_customer_patch');
    return;
  }
  const response = await fetch(`${supabaseUrl}/rest/v1/billing_customers`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ workspace_id: workspaceId, asaas_customer_id: asaasCustomerId, cpf_cnpj: null, email: null }),
  });
  assertBillingWebhookWriteSucceeded(response, 'billing_customer_insert');
}

// BLOCO ASAAS CHECKOUT: caminho de correlacao alternativo -- so acionado
// quando o `payment.customer` NAO bate com nenhum billing_customers
// conhecido (o Checkout pode ter criado um cliente novo na Asaas). Consulta
// a assinatura na Asaas para ler `checkoutSession` (confirmado em
// docs.asaas.com/reference/retrieve-a-single-subscription) e localiza a
// linha local pelo `asaas_checkout_id` que NOS geramos em
// billing-create-checkout -- nunca mistura checkout.id com payment.id.
async function linkCheckoutOriginatedSubscription({
  asaasSubscriptionId, asaasCustomerId, supabaseUrl, serviceRoleKey,
}: { asaasSubscriptionId: string; asaasCustomerId: string; supabaseUrl: string; serviceRoleKey: string }) {
  const asaasApiKey = Deno.env.get('ASAAS_API_KEY') ?? '';
  const asaasBaseUrl = Deno.env.get('ASAAS_BASE_URL') ?? '';
  let checkoutSessionId: string | null = null;
  try {
    const client = createAsaasClient({ apiKey: asaasApiKey, baseUrl: asaasBaseUrl, allowProduction: true });
    const remote = await client.getSubscription(asaasSubscriptionId) as { checkoutSession?: string };
    checkoutSessionId = typeof remote?.checkoutSession === 'string' ? remote.checkoutSession : null;
  } catch {
    // Best-effort: se a consulta falhar, nao ha como correlacionar agora --
    // o proximo evento de pagamento tenta de novo (idempotente).
    return null;
  }
  if (!checkoutSessionId) return null;

  const subscription = await findSubscriptionByCheckoutId({ supabaseUrl, serviceRoleKey, asaasCheckoutId: checkoutSessionId });
  if (!subscription) return null;

  await patchSubscription({
    supabaseUrl, serviceRoleKey, subscriptionId: subscription.id as string,
    patch: { asaas_customer_id: asaasCustomerId, asaas_subscription_id: asaasSubscriptionId },
  });
  await upsertBillingCustomerAsaasId({
    supabaseUrl, serviceRoleKey, workspaceId: subscription.workspace_id as string, asaasCustomerId,
  });

  return {
    ...(subscription as Record<string, unknown>),
    asaas_customer_id: asaasCustomerId,
    asaas_subscription_id: asaasSubscriptionId,
  };
}

async function upsertBillingPayment({
  supabaseUrl, serviceRoleKey, row,
}: { supabaseUrl: string; serviceRoleKey: string; row: Record<string, unknown> }) {
  const response = await fetch(`${supabaseUrl}/rest/v1/billing_payments?on_conflict=asaas_payment_id`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(row),
  });
  assertBillingWebhookWriteSucceeded(response, 'billing_payment_upsert');
}

async function patchSubscription({
  supabaseUrl, serviceRoleKey, subscriptionId, patch, expectedStatus,
}: {
  supabaseUrl: string;
  serviceRoleKey: string;
  subscriptionId: string;
  patch: Record<string, unknown>;
  expectedStatus?: string;
}): Promise<boolean> {
  const params = new URLSearchParams({ id: `eq.${subscriptionId}` });
  if (expectedStatus) params.set('status', `eq.${expectedStatus}`);

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
  assertBillingWebhookWriteSucceeded(response, 'subscription_patch');
  const rows = await response.json();
  if (Array.isArray(rows) && rows.length === 1) return true;

  // Com guarda otimista, zero linhas significa que outra invocação já
  // mudou o status. É um no-op concorrente seguro, não uma falha de banco.
  if (expectedStatus && Array.isArray(rows) && rows.length === 0) return false;

  throw new Error('BILLING_WEBHOOK_WRITE_NOT_APPLIED:subscription_patch');
}

// BLOCO ASAAS FINAL: processa UM evento de pagamento -- nunca chamado para
// um evento já concluído com sucesso (o chamador garante isso). Eventos com
// processing_error permanecem elegíveis mesmo se forem linhas legadas que
// receberam processed_at durante uma falha.
// Sempre idempotente: reprocessar o MESMO evento aplica o mesmo patch,
// nunca duplica efeito (upsert por asaas_payment_id; PATCH de subscriptions
// é atribuição de valor, não incremento).
async function processPaymentEvent({
  supabaseUrl, serviceRoleKey, eventType, payload,
}: { supabaseUrl: string; serviceRoleKey: string; eventType: string; payload: Record<string, unknown> }) {
  if (!PROCESSABLE_PAYMENT_EVENT_TYPES.has(eventType)) return;

  const eventPayment = (payload?.payment ?? {}) as Record<string, unknown>;
  const asaasPaymentId = typeof eventPayment?.id === 'string' ? eventPayment.id : null;
  const eventCustomerId = typeof eventPayment?.customer === 'string' ? eventPayment.customer : null;
  const eventSubscriptionId = typeof eventPayment?.subscription === 'string' ? eventPayment.subscription : null;
  if (!asaasPaymentId || !eventCustomerId) return;

  // O webhook é apenas um aviso. Consulta a cobrança atual na Asaas e usa
  // os dados retornados pelo provedor para persistência e transições.
  const asaasApiKey = Deno.env.get('ASAAS_API_KEY') ?? '';
  const asaasBaseUrl = Deno.env.get('ASAAS_BASE_URL') ?? '';
  const client = createAsaasClient({ apiKey: asaasApiKey, baseUrl: asaasBaseUrl, allowProduction: true });
  const providerPayment = await client.getPayment(asaasPaymentId) as Record<string, unknown> | null;
  if (
    !providerPayment
    || providerPayment.id !== asaasPaymentId
    || providerPayment.customer !== eventCustomerId
    || (eventSubscriptionId && providerPayment.subscription !== eventSubscriptionId)
  ) {
    console.log(JSON.stringify({ at: 'billing-webhook', status: 'payment_requery_mismatch', asaasPaymentId, eventType }));
    return;
  }

  const payment = providerPayment;
  const asaasCustomerId = typeof payment.customer === 'string' ? payment.customer : null;
  const asaasSubscriptionId = typeof payment.subscription === 'string' ? payment.subscription : null;
  if (!asaasCustomerId) return;

  let workspaceId = await findBillingCustomerWorkspace({ supabaseUrl, serviceRoleKey, asaasCustomerId });
  let linkedSubscription: Record<string, unknown> | null = null;

  // BLOCO ASAAS CHECKOUT: `payment.customer` desconhecido pode significar
  // que o pagamento veio de um Checkout hospedado (cartao) que criou um
  // cliente novo na Asaas -- tenta o caminho de correlacao alternativo
  // (via checkoutSession) antes de desistir. Nunca acionado para o Pix
  // direto (que sempre bate no `findBillingCustomerWorkspace` acima).
  if (!workspaceId && asaasSubscriptionId) {
    linkedSubscription = await linkCheckoutOriginatedSubscription({
      asaasSubscriptionId, asaasCustomerId, supabaseUrl, serviceRoleKey,
    });
    if (linkedSubscription) workspaceId = linkedSubscription.workspace_id as string;
  }

  // BLOCO ASAAS FINAL: cliente desconhecido do nosso banco (ex.: evento de
  // um cliente criado fora deste fluxo) -- nada a atribuir, encerra sem erro.
  if (!workspaceId) return;

  await upsertBillingPayment({
    supabaseUrl,
    serviceRoleKey,
    row: buildBillingPaymentRow({
      workspaceId, asaasPaymentId, asaasSubscriptionId, eventType, payment,
    }),
  });

  // BLOCO ASAAS FINAL: só toca em `subscriptions` quando o pagamento
  // realmente pertence a uma assinatura recorrente (payment.subscription
  // presente) -- uma cobrança avulsa (ex.: billing-create-test-payment)
  // nunca ativa/atualiza nenhuma assinatura.
  if (!asaasSubscriptionId) return;

  const subscription = linkedSubscription
    ?? await findSubscriptionByAsaasId({ supabaseUrl, serviceRoleKey, asaasSubscriptionId });
  const patch = isProviderPaymentStatusConsistent(eventType, payment.status)
    ? resolveSubscriptionPatchForEvent({
      eventType,
      subscription: subscription ? { status: subscription.status as string, cancel_at_period_end: subscription.cancel_at_period_end as boolean } : null,
      now: new Date().toISOString(),
    })
    : null;
  if (patch && subscription) {
    // A guarda de status torna a transição observável e atômica: somente a
    // invocação que ainda encontra o status lido aplica o patch. Uma segunda
    // entrega concorrente recebe false e não produz efeito comercial duplo.
    const transitionApplied = await patchSubscription({
      supabaseUrl,
      serviceRoleKey,
      subscriptionId: subscription.id as string,
      patch,
      expectedStatus: subscription.status as string,
    });
    return { subscription_transition_applied: transitionApplied };
  }
}

// BLOCO ASAAS CHECKOUT: eventos de Checkout usados SOMENTE para higiene de
// checkouts abandonados (expirado/cancelado sem nunca ter vinculado uma
// assinatura real) -- NUNCA ativa nada aqui (regra explicita da tarefa:
// ativacao so por PAYMENT_CONFIRMED/PAYMENT_RECEIVED, tratado acima em
// processPaymentEvent). CHECKOUT_CREATED/CHECKOUT_PAID nao precisam de
// tratamento aqui -- a linha pendente ja e criada por billing-create-checkout,
// e a ativacao real (quando paga) sempre chega pelo evento de pagamento.
async function processCheckoutEvent({
  supabaseUrl, serviceRoleKey, eventType, payload,
}: { supabaseUrl: string; serviceRoleKey: string; eventType: string; payload: Record<string, unknown> }) {
  if (!PROCESSABLE_CHECKOUT_EVENT_TYPES.has(eventType)) return;

  const checkout = (payload?.checkout ?? {}) as Record<string, unknown>;
  const asaasCheckoutId = typeof checkout?.id === 'string' ? checkout.id : null;
  if (!asaasCheckoutId) return;

  const subscription = await findSubscriptionByCheckoutId({ supabaseUrl, serviceRoleKey, asaasCheckoutId });
  const patch = resolveCheckoutHygienePatch({
    eventType,
    subscription: subscription ? { asaas_subscription_id: subscription.asaas_subscription_id as string | null } : null,
  });
  if (patch && subscription) {
    await patchSubscription({ supabaseUrl, serviceRoleKey, subscriptionId: subscription.id as string, patch });
  }
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return jsonResponse(405, errorBody('METHOD_NOT_ALLOWED', 'Metodo nao permitido.'));
  }

  // "Autenticacao" deste endpoint: token compartilhado com a Asaas (secret
  // separado da API Key), nunca um Bearer de usuario -- API Key NUNCA
  // funciona aqui, mesmo se enviada por engano.
  const expectedToken = Deno.env.get('ASAAS_WEBHOOK_TOKEN') ?? '';
  const receivedToken = request.headers.get(ASAAS_WEBHOOK_TOKEN_HEADER) ?? '';
  if (!expectedToken) {
    return jsonResponse(503, errorBody('SERVICE_UNAVAILABLE', 'Webhook nao configurado.'));
  }
  if (!receivedToken || receivedToken !== expectedToken) {
    return jsonResponse(401, errorBody('WEBHOOK_AUTH_REQUIRED', 'Token de webhook ausente ou invalido.'));
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(503, errorBody('SERVICE_UNAVAILABLE', 'Servico indisponivel.'));
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, errorBody('INVALID_BODY', 'Corpo da requisicao invalido.'));
  }

  // BILLING2: `id` (nivel raiz) e o identificador unico do evento -- ver
  // fonte oficial no topo do arquivo. `event` e o nome/tipo do evento
  // (ex.: PAYMENT_CONFIRMED). Campos adicionais desconhecidos sao tolerados
  // (nunca validados/rejeitados) -- so gravamos o payload bruto inteiro.
  const asaasEventId = payload?.id;
  const eventType = payload?.event;
  if (typeof asaasEventId !== 'string' || !asaasEventId.trim()) {
    return jsonResponse(400, errorBody('INVALID_EVENT', 'Campo "id" (identificador do evento) ausente ou invalido.'));
  }
  if (typeof eventType !== 'string' || !eventType.trim()) {
    return jsonResponse(400, errorBody('INVALID_EVENT', 'Campo "event" ausente ou invalido.'));
  }

  const persistResult = await persistWebhookEvent({ supabaseUrl, serviceRoleKey, asaasEventId, eventType, payload });
  if (!persistResult.ok) {
    // BILLING2: nunca mascarar falha de persistencia -- log sanitizado
    // (nunca o token/payload completo, so o identificador do evento, que
    // nao e sensivel).
    console.log(JSON.stringify({ at: 'billing-webhook', status: 'persist_failed', asaasEventId, eventType }));
    return jsonResponse(500, errorBody('PERSISTENCE_FAILED', 'Nao foi possivel registrar o evento.'));
  }

  // BLOCO ASAAS FINAL: se a linha nao veio da insercao (evento ja existia),
  // busca a linha real para checar o estado de processamento. Um sucesso
  // definitivo nao e reprocessado; uma falha continua elegivel para retry.
  const eventRow = persistResult.insertedRow
    ?? await fetchWebhookEventByEventId({ supabaseUrl, serviceRoleKey, asaasEventId });

  if (isWebhookEventEligibleForProcessing(eventRow)) {
    const processPersistedEvent = async () => {
      try {
        await processPaymentEvent({ supabaseUrl, serviceRoleKey, eventType, payload });
        // BLOCO ASAAS CHECKOUT: cada função verifica seu próprio conjunto de
        // eventType antes de fazer qualquer coisa -- nunca ambas processam o
        // mesmo evento (payment.* vs checkout.*, conjuntos disjuntos).
        await processCheckoutEvent({ supabaseUrl, serviceRoleKey, eventType, payload });
        await patchWebhookEventProcessingState({
          supabaseUrl,
          serviceRoleKey,
          eventRowId: eventRow.id as string,
          patch: buildWebhookProcessingSuccessPatch(new Date().toISOString()),
        });
      } catch (error) {
        // O evento já está durável. Registra erro sanitizado sem solicitar
        // retries HTTP da Asaas, que podem pausar sua fila após falhas seguidas.
        console.log(JSON.stringify({ at: 'billing-webhook', status: 'processing_failed', asaasEventId, eventType }));
        try {
          await patchWebhookEventProcessingState({
            supabaseUrl,
            serviceRoleKey,
            eventRowId: eventRow.id as string,
            patch: buildWebhookProcessingFailurePatch(sanitizeErrorMessage(error)),
          });
        } catch {
          // A linha permanece sem processed_at e poderá ser reconciliada.
          console.log(JSON.stringify({ at: 'billing-webhook', status: 'processing_error_persist_failed', asaasEventId, eventType }));
        }
      }
    };
    // Persiste antes de responder e continua o processamento em background.
    // billing-sync reconcilia se o worker for interrompido após a resposta.
    EdgeRuntime.waitUntil(processPersistedEvent());
  }

  // Só responde 200 depois de confirmar a persistência do evento; o trabalho
  // de negócio não prolonga a resposta HTTP.
  return jsonResponse(200, { received: true, asaas_event_id: asaasEventId });
});
