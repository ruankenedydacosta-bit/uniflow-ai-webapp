// BLOCO ASAAS FINAL: regras comerciais PURAS (sem Deno.serve, sem fetch, sem
// I/O) do ciclo de vida da assinatura -- extraídas para cá exatamente para
// poderem ser auditadas e teoricamente testadas com relógio controlado, sem
// precisar esperar prazos reais (grace period) ou montar um servidor.
// Único plano vendido: internal id 'pro' ("Plano Pessoal"), R$ 29,90/mês,
// cycle MONTHLY, sem trial automático, ativação só após pagamento
// confirmado/recebido, cancelamento no fim do período pago, grace period de
// 3 dias antes de suspender por inadimplência. Nenhuma função aqui apaga
// dado -- toda transição é aditiva/atualização de status.

export const GRACE_PERIOD_DAYS = 3;

// BLOCO ASAAS CHECKOUT: mesma decisao comercial congelada (Bloco Asaas 0) --
// unico plano vendido, preco/ciclo definidos so pelo backend. Compartilhado
// aqui em vez de duplicado localmente em billing-create-checkout (que e
// codigo NOVO) -- billing-create-subscription mantem suas proprias
// constantes locais intocadas (Pix existente, fora do escopo deste bloco).
export const PLAN_PRICE_BRL = 29.9;
export const PLAN_CYCLE = 'MONTHLY';
export const CHECKOUT_MINUTES_TO_EXPIRE = 60;

// Estados terminais do pagamento no schema local (billing_payments.status,
// ver migration 024) -- mapeamento do `payment.status` bruto da Asaas
// (sempre maiúsculo) para o valor aceito pelo nosso check constraint.
const ASAAS_PAYMENT_STATUS_MAP: Record<string, string> = {
  PENDING: 'pending',
  AWAITING_RISK_ANALYSIS: 'pending',
  APPROVED_BY_RISK_ANALYSIS: 'pending',
  REPROVED_BY_RISK_ANALYSIS: 'canceled',
  CONFIRMED: 'confirmed',
  RECEIVED: 'received',
  RECEIVED_IN_CASH: 'received',
  OVERDUE: 'overdue',
  REFUNDED: 'refunded',
  REFUND_IN_PROGRESS: 'refunded',
  DELETED: 'canceled',
  CANCELED: 'canceled',
};

// BLOCO ASAAS FINAL: eventos de disputa nunca têm um `payment.status`
// correspondente limpo no nosso enum além de 'chargeback' -- o TIPO do
// evento decide aqui, não o status bruto do payment.
const CHARGEBACK_EVENT_TYPES = new Set([
  'PAYMENT_CHARGEBACK_REQUESTED',
  'PAYMENT_CHARGEBACK_DISPUTE',
  'PAYMENT_AWAITING_CHARGEBACK_REVERSAL',
]);

// Eventos que ativam a assinatura (evidência real de pagamento) -- nunca
// qualquer outro, mesmo que o `payment.status` bruto pareça favorável.
const ACTIVATING_EVENT_TYPES = new Set(['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED']);

const REFUND_EVENT_TYPES = new Set(['PAYMENT_REFUNDED', 'PAYMENT_PARTIALLY_REFUNDED']);

export const PROCESSABLE_PAYMENT_EVENT_TYPES = new Set([
  'PAYMENT_CREATED',
  'PAYMENT_UPDATED',
  'PAYMENT_CONFIRMED',
  'PAYMENT_RECEIVED',
  'PAYMENT_OVERDUE',
  'PAYMENT_DELETED',
  'PAYMENT_REFUNDED',
  'PAYMENT_PARTIALLY_REFUNDED',
  'PAYMENT_CHARGEBACK_REQUESTED',
  'PAYMENT_CHARGEBACK_DISPUTE',
  'PAYMENT_AWAITING_CHARGEBACK_REVERSAL',
  'PAYMENT_AWAITING_RISK_ANALYSIS',
  'PAYMENT_APPROVED_BY_RISK_ANALYSIS',
  'PAYMENT_REPROVED_BY_RISK_ANALYSIS',
]);

const TERMINAL_SUBSCRIPTION_STATUSES = new Set(['canceled', 'expired']);

// O corpo do webhook é gatilho, não fonte de verdade: um evento que muda a
// assinatura só vale se a cobrança, reconsultada na API, estiver no status
// que o evento diz. Um PAYMENT_CONFIRMED forjado com o id de uma cobrança
// pendente não ativa nada.
const REMOTE_STATUSES_BY_EVENT_TYPE: Record<string, Set<string>> = {
  PAYMENT_CONFIRMED: new Set(['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH']),
  PAYMENT_RECEIVED: new Set(['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH']),
  PAYMENT_OVERDUE: new Set(['OVERDUE']),
};

export function isEventConfirmedByRemotePayment(eventType: string, remoteStatus: unknown): boolean {
  const expected = REMOTE_STATUSES_BY_EVENT_TYPE[eventType];
  // Eventos que não mudam a assinatura não precisam de confirmação.
  if (!expected) return true;
  return typeof remoteStatus === 'string' && expected.has(remoteStatus.toUpperCase());
}

export function mapAsaasPaymentStatus(eventType: string, rawPaymentStatus: unknown): string {
  if (CHARGEBACK_EVENT_TYPES.has(eventType)) return 'chargeback';
  const key = typeof rawPaymentStatus === 'string' ? rawPaymentStatus.toUpperCase() : '';
  return ASAAS_PAYMENT_STATUS_MAP[key] ?? 'pending';
}

export function buildBillingPaymentRow({
  workspaceId, asaasPaymentId, asaasSubscriptionId, eventType, payment,
}: {
  workspaceId: string;
  asaasPaymentId: string;
  asaasSubscriptionId: string | null;
  eventType: string;
  payment: Record<string, unknown>;
}) {
  return {
    workspace_id: workspaceId,
    asaas_payment_id: asaasPaymentId,
    asaas_subscription_id: asaasSubscriptionId,
    status: mapAsaasPaymentStatus(eventType, payment?.status),
    billing_type: typeof payment?.billingType === 'string' ? payment.billingType.toLowerCase() : null,
    value: typeof payment?.value === 'number' ? payment.value : 0,
    due_date: typeof payment?.dueDate === 'string' ? payment.dueDate : null,
    paid_at: typeof payment?.paymentDate === 'string'
      ? payment.paymentDate
      : (typeof payment?.clientPaymentDate === 'string' ? payment.clientPaymentDate : null),
    invoice_url: typeof payment?.invoiceUrl === 'string' ? payment.invoiceUrl : null,
  };
}

// now: ISO string (injetável -- nunca `new Date()` direto aqui, para que os
// testes controlem o relógio sem esperar prazos reais).
export function computeNextPeriodEnd(now: string): string {
  const date = new Date(now);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString();
}

// Decide o patch a aplicar em `subscriptions` para um evento de pagamento --
// retorna null quando o evento não deve alterar o status da assinatura
// (ex.: PAYMENT_CREATED/UPDATED/DELETED, análise de risco, chargeback --
// "aplicar status comercial seguro" aqui significa NUNCA suspender
// automaticamente por chargeback nesta fase, já que a disputa ainda pode
// ser revertida; apenas o pagamento em billing_payments registra o estado).
export function resolveSubscriptionPatchForEvent({
  eventType, subscription, now,
}: {
  eventType: string;
  subscription: { status: string; cancel_at_period_end?: boolean } | null;
  now: string;
}): Record<string, unknown> | null {
  if (!subscription) return null;
  if (TERMINAL_SUBSCRIPTION_STATUSES.has(subscription.status)) return null;

  if (ACTIVATING_EVENT_TYPES.has(eventType)) {
    // PAYMENT_CONFIRMED e PAYMENT_RECEIVED podem representar a mesma
    // cobrança. Depois da primeira transição para active, o segundo evento
    // é um no-op comercial: não estende novamente o período vigente.
    if (subscription.status === 'active') return null;

    // BLOCO ASAAS FINAL: reativa automaticamente de pending/past_due/suspended
    // -- nunca de canceled/expired (guarda acima). current_period_ends_at
    // sempre avança a partir de AGORA (não do período anterior) -- evidência
    // de pagamento é o único gatilho de ativação, nunca o status externo
    // sozinho (mesma regra já aplicada em billing-sync).
    return {
      status: 'active',
      current_period_ends_at: computeNextPeriodEnd(now),
    };
  }

  if (eventType === 'PAYMENT_OVERDUE') {
    // Só marca past_due se a assinatura estava ativa -- nunca sobrescreve
    // um estado já mais grave (suspended) nem uma assinatura ainda pending
    // (que nunca chegou a ser paga -- isso não é "atraso", é "nunca pagou").
    if (subscription.status !== 'active') return null;
    return { status: 'past_due' };
  }

  // PAYMENT_DELETED, PAYMENT_UPDATED, PAYMENT_CREATED, refund/chargeback e
  // eventos de análise de risco: nunca alteram o status da assinatura aqui
  // -- PAYMENT_DELETED em especial NUNCA é tratado como pagamento recebido.
  return null;
}

// BLOCO ASAAS CHECKOUT: payload PURO do Asaas Checkout hospedado (cartao) --
// nunca inclui campos de cartao (numero/validade/CVV, nunca coletados pela
// UniFlow) -- so billingTypes/chargeTypes/items/subscription no formato
// exato confirmado em https://docs.asaas.com/reference/create-new-checkout.
//
// DESCOBERTA REAL NO SANDBOX (nao documentada de forma completa nas paginas
// de referencia consultadas): enviar `customerData` PARCIAL (so
// name/cpfCnpj/email/phone, sem endereco) e REJEITADO pela Asaas --
// "O campo phoneNumber/address/addressNumber/postalCode/province deve ser
// informado" -- porque o endpoint so aceita customerData completo (endereco
// incluso, ver exemplo oficial em
// docs.asaas.com/docs/checkout-with-subscription-recurring) OU nenhum
// customerData. A UniFlow nunca coletou endereco do usuario (fora de
// escopo) -- em vez de inventar um endereco falso ou expandir o formulario
// de assinatura para pedir rua/numero/CEP (fora do escopo autorizado deste
// bloco), `customerData` continua nunca sendo enviado.
//
// CORRECAO NOTIFICACOES (cartao): confirmado nas docs oficiais
// (docs.asaas.com/docs/how-to-provide-customer-data e
// docs.asaas.com/reference/create-new-checkout) que o Checkout aceita `customer`
// (ID de um cliente Asaas ja existente) como alternativa a `customerData` --
// os dois campos sao MUTUAMENTE EXCLUSIVOS, nunca enviados juntos. Quando o
// chamador (billing-create-checkout) ja sabe o asaas_customer_id do
// workspace (billing_customers, criado com notificationDisabled:true por
// billing-create-customer), este passa a ser enviado como `customer` --
// assim o Checkout REUTILIZA esse cliente em vez de deixar a Asaas criar um
// novo (sem notificationDisabled) so para o cartao. Quando nao ha
// asaasCustomerId disponivel (usuario ainda sem nenhum billing_customers --
// ver LIMITACAO no comentario de billing-create-checkout/index.ts), o
// comportamento permanece EXATAMENTE como antes: nem `customer` nem
// `customerData`, o proprio Checkout hospedado pede os dados do pagador.
//
// `now` e injetavel (nunca `new Date()` direto) para testes com relogio
// controlado, mesmo padrao das demais funcoes puras deste modulo.
// tier: nível escolhido (épico #116). Sem ele, o item é o Plano Pessoal de
// sempre, a R$ 29,90.
export function buildCheckoutPayload({
  workspaceId, successUrl, cancelUrl, expiredUrl, now, asaasCustomerId, tier,
}: {
  workspaceId: string;
  successUrl: string;
  cancelUrl: string;
  expiredUrl?: string;
  now: string;
  asaasCustomerId?: string | null;
  tier?: { name: string; priceBrl: number } | null;
}): Record<string, unknown> {
  const nextDueDate = new Date(now).toISOString().slice(0, 10);
  const callback: Record<string, unknown> = { successUrl, cancelUrl };
  if (expiredUrl) callback.expiredUrl = expiredUrl;

  const payload: Record<string, unknown> = {
    billingTypes: ['CREDIT_CARD'],
    chargeTypes: ['RECURRENT'],
    minutesToExpire: CHECKOUT_MINUTES_TO_EXPIRE,
    externalReference: workspaceId,
    callback,
    items: [
      {
        name: tier ? tier.name : 'Plano Pessoal',
        description: `Assinatura mensal ${tier ? tier.name : 'Plano Pessoal'} - UniFlow AI`,
        quantity: 1,
        value: tier ? tier.priceBrl : PLAN_PRICE_BRL,
      },
    ],
    subscription: {
      cycle: PLAN_CYCLE,
      nextDueDate,
    },
  };

  if (asaasCustomerId) {
    payload.customer = asaasCustomerId;
  }

  return payload;
}

// BLOCO ASAAS CHECKOUT: higiene de checkouts abandonados -- NUNCA ativa nada
// (ativacao continua sendo so por PAYMENT_CONFIRMED/PAYMENT_RECEIVED, ver
// ACTIVATING_EVENT_TYPES acima). Só cancela a linha local pendente quando
// ela AINDA NAO tem asaas_subscription_id vinculado -- se ja tem, o
// checkout foi pago e um evento de expiracao/cancelamento tardio (ou fora
// de ordem) NUNCA pode desfazer uma assinatura real ja criada.
export const PROCESSABLE_CHECKOUT_EVENT_TYPES = new Set(['CHECKOUT_EXPIRED', 'CHECKOUT_CANCELED']);

export function resolveCheckoutHygienePatch({
  eventType, subscription,
}: {
  eventType: string;
  subscription: { asaas_subscription_id: string | null } | null;
}): Record<string, unknown> | null {
  if (!subscription) return null;
  if (subscription.asaas_subscription_id) return null;
  if (!PROCESSABLE_CHECKOUT_EVENT_TYPES.has(eventType)) return null;
  return { status: 'canceled' };
}

// Grace period: `updated_at` da própria assinatura É o timestamp de quando
// o status virou 'past_due' (o UPDATE que aplica esse patch atualiza
// updated_at via trigger já existente -- nenhuma coluna nova necessária).
// `now`/`pastDueSince` são strings ISO injetáveis -- nunca `new Date()`
// direto, para permitir teste com relógio controlado (ver Bloco Asaas
// Final, Parte 4: Sandbox não permite avançar 3 dias reais).
export function isGracePeriodExpired({
  pastDueSince, now, graceDays = GRACE_PERIOD_DAYS,
}: { pastDueSince: string; now: string; graceDays?: number }): boolean {
  const since = new Date(pastDueSince).getTime();
  const current = new Date(now).getTime();
  if (!Number.isFinite(since) || !Number.isFinite(current)) return false;
  const graceMs = graceDays * 24 * 60 * 60 * 1000;
  return current - since >= graceMs;
}

// Cancelamento: nunca corta acesso imediatamente -- só agenda; o acesso
// permanece até `current_period_ends_at` (decisão comercial congelada desde
// a migration 024/Bloco Asaas 0).
export function resolveCancellationPatch({
  subscription, now,
}: { subscription: { current_period_ends_at: string | null }; now: string }) {
  return {
    cancel_at_period_end: true,
    cancel_effective_at: subscription.current_period_ends_at ?? now,
  };
}
