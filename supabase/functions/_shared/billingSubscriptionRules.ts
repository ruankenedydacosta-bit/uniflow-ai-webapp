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

export function billingDueTimestamp(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return Number.NaN;
  const parsed = Date.parse(`${value}T00:00:00-03:00`);
  return Number.isFinite(parsed) && new Date(parsed - 3 * 3_600_000).toISOString().slice(0, 10) === value
    ? parsed : Number.NaN;
}

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

export function mapAsaasPaymentStatus(eventType: string, rawPaymentStatus: unknown): string {
  if (CHARGEBACK_EVENT_TYPES.has(eventType)) return 'chargeback';
  const key = typeof rawPaymentStatus === 'string' ? rawPaymentStatus.toUpperCase() : '';
  return ASAAS_PAYMENT_STATUS_MAP[key] ?? 'pending';
}

// O corpo do webhook inicia a consulta, mas não é autoridade para mudar
// acesso. Eventos com efeito comercial só são aceitos quando o status atual
// reconsultado na API da Asaas confirma o mesmo estado.
export function isProviderPaymentStatusConsistent(eventType: string, providerStatus: unknown): boolean {
  const status = typeof providerStatus === 'string' ? providerStatus.toUpperCase() : '';
  if (ACTIVATING_EVENT_TYPES.has(eventType)) {
    return status === 'CONFIRMED' || status === 'RECEIVED' || status === 'RECEIVED_IN_CASH';
  }
  if (eventType === 'PAYMENT_OVERDUE') return status === 'OVERDUE';
  if (REFUND_EVENT_TYPES.has(eventType)) return status === 'REFUNDED' || status === 'PARTIALLY_REFUNDED';
  if (eventType === 'PAYMENT_DELETED') return status === 'DELETED' || status === 'CANCELED';
  return true;
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

function addOneUtcMonthClamped(value: string): string {
  const date = new Date(value);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString();
}

function validTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

const CONFIRMED_PAYMENT_STATUSES = new Set(['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH']);

export function hasConfirmedProviderPayment(payments: unknown): boolean {
  return Array.isArray(payments) && payments.some((payment) => payment && typeof payment === 'object'
    && CONFIRMED_PAYMENT_STATUSES.has(String((payment as Record<string, unknown>).status ?? '').toUpperCase()));
}

// Reconstrói o fim do período somente a partir de pagamentos confirmados do
// provedor. Sem evidência de pagamento ou data válida, retorna null: nunca
// transforma o horário da solicitação em uma data fictícia de encerramento.
export function derivePaidPeriodEndFromPayments(payments: unknown): string | null {
  if (!Array.isArray(payments)) return null;
  const anchors = payments
    .filter((payment) => payment && typeof payment === 'object'
      && CONFIRMED_PAYMENT_STATUSES.has(String((payment as Record<string, unknown>).status ?? '').toUpperCase()))
    .flatMap((payment) => {
      const row = payment as Record<string, unknown>;
      const values = [row.paymentDate, row.clientPaymentDate, row.dueDate]
        .map(validTimestamp)
        .filter(Boolean) as string[];
      return values.length ? [new Date(Math.max(...values.map(Date.parse))).toISOString()] : [];
    });
  if (!anchors.length) return null;
  const latestAnchor = anchors.reduce((latest, value) => Date.parse(value) > Date.parse(latest) ? value : latest);
  return computePaidPeriodEnd({ paymentDate: latestAnchor, currentPeriodEndsAt: null, now: latestAnchor });
}

// Fixa um mês de acesso a partir da data do pagamento ou do vencimento da
// cobrança, nunca da chegada do webhook. O fim já persistido é preservado,
// então reconciliações repetidas são idempotentes e pagamentos adiantados não
// encurtam um período que já estava pago.
export function computePaidPeriodEnd({
  paymentDate, dueDate, currentPeriodEndsAt, now,
}: {
  paymentDate?: string | null;
  dueDate?: string | null;
  currentPeriodEndsAt?: string | null;
  now: string;
}): string {
  const anchorValues = [validTimestamp(paymentDate), validTimestamp(dueDate)].filter(Boolean) as string[];
  const anchor = anchorValues.length
    ? new Date(Math.max(...anchorValues.map((value) => Date.parse(value)))).toISOString()
    : validTimestamp(now) ?? new Date().toISOString();
  const candidate = addOneUtcMonthClamped(anchor);
  const current = validTimestamp(currentPeriodEndsAt);
  return current && Date.parse(current) > Date.parse(candidate) ? current : candidate;
}

// Decide o patch a aplicar em `subscriptions` para um evento de pagamento --
// retorna null quando o evento não deve alterar o status da assinatura
// (ex.: PAYMENT_CREATED/UPDATED/DELETED, análise de risco, chargeback --
// "aplicar status comercial seguro" aqui significa NUNCA suspender
// automaticamente por chargeback nesta fase, já que a disputa ainda pode
// ser revertida; apenas o pagamento em billing_payments registra o estado).
export function resolveSubscriptionPatchForEvent({
  eventType, subscription, now, paymentDate, dueDate,
}: {
  eventType: string;
  subscription: { status: string; cancel_at_period_end?: boolean; current_period_ends_at?: string | null } | null;
  now: string;
  paymentDate?: string | null;
  dueDate?: string | null;
}): Record<string, unknown> | null {
  if (!subscription) return null;
  if (TERMINAL_SUBSCRIPTION_STATUSES.has(subscription.status)) return null;

  if (ACTIVATING_EVENT_TYPES.has(eventType)) {
    const periodEnd = computePaidPeriodEnd({
      paymentDate, dueDate, currentPeriodEndsAt: subscription.current_period_ends_at, now,
    });
    if (Date.parse(periodEnd) <= Date.parse(now)) return null;
    if (
      subscription.status === 'active'
      && subscription.current_period_ends_at
      && Date.parse(periodEnd) <= Date.parse(subscription.current_period_ends_at)
    ) return null;

    // Reativa a partir de evidência de pagamento e também avança o período
    // de assinaturas já ativas quando chega uma nova cobrança confirmada.
    // As datas do provedor tornam a repetição do mesmo evento idempotente.
    return {
      status: 'active',
      current_period_ends_at: periodEnd,
      ...(subscription.cancel_at_period_end ? { cancel_effective_at: periodEnd } : {}),
    };
  }

  if (eventType === 'PAYMENT_OVERDUE') {
    // Só marca past_due se a assinatura estava ativa -- nunca sobrescreve
    // um estado já mais grave (suspended) nem uma assinatura ainda pending
    // (que nunca chegou a ser paga -- isso não é "atraso", é "nunca pagou").
    if (subscription.status !== 'active' || subscription.cancel_at_period_end) return null;
    const due = billingDueTimestamp(dueDate);
    if (!Number.isFinite(due) || Date.parse(subscription.current_period_ends_at ?? '') > due) return null;
    const graceEnd = new Date(due + GRACE_PERIOD_DAYS * 86_400_000).toISOString();
    return { status: Date.parse(now) >= Date.parse(graceEnd) ? 'suspended' : 'past_due', billing_grace_ends_at: graceEnd };
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
export function buildCheckoutPayload({
  workspaceId, successUrl, cancelUrl, expiredUrl, now, asaasCustomerId,
}: {
  workspaceId: string;
  successUrl: string;
  cancelUrl: string;
  expiredUrl?: string;
  now: string;
  asaasCustomerId?: string | null;
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
        name: 'Plano Pessoal',
        description: 'Assinatura mensal Plano Pessoal - UniFlow AI',
        quantity: 1,
        value: PLAN_PRICE_BRL,
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
  subscription, providerPayments = [],
}: {
  subscription: {
    status?: string;
    current_period_ends_at: string | null;
    trial_ends_at?: string | null;
  };
  providerPayments?: unknown;
}) {
  const localPeriodEnd = validTimestamp(subscription.current_period_ends_at);
  const providerPeriodEnd = derivePaidPeriodEndFromPayments(providerPayments);
  const paidPeriodEnd = [localPeriodEnd, providerPeriodEnd]
    .filter(Boolean)
    .reduce<string | null>((latest, value) => !latest || Date.parse(value as string) > Date.parse(latest) ? value as string : latest, null);
  const effectiveAt = subscription.status === 'trialing'
    ? validTimestamp(subscription.trial_ends_at)
    : paidPeriodEnd;
  if (!effectiveAt) return null;

  return {
    cancel_at_period_end: true,
    cancel_effective_at: effectiveAt,
    ...(subscription.status !== 'trialing' && localPeriodEnd !== effectiveAt ? { current_period_ends_at: effectiveAt } : {}),
  };
}
