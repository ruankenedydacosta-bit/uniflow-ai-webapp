import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildBillingPaymentRow,
  buildCheckoutPayload,
  CHECKOUT_MINUTES_TO_EXPIRE,
  computeNextPeriodEnd,
  computePaidPeriodEnd,
  GRACE_PERIOD_DAYS,
  isGracePeriodExpired,
  isProviderPaymentStatusConsistent,
  mapAsaasPaymentStatus,
  PLAN_CYCLE,
  PLAN_PRICE_BRL,
  PROCESSABLE_CHECKOUT_EVENT_TYPES,
  PROCESSABLE_PAYMENT_EVENT_TYPES,
  resolveCancellationPatch,
  resolveCheckoutHygienePatch,
  resolveSubscriptionPatchForEvent,
} from '../../supabase/functions/_shared/billingSubscriptionRules.ts';

// ============================================================================
// BLOCO ASAAS FINAL -- regras PURAS do ciclo de vida da assinatura
// (_shared/billingSubscriptionRules.ts). EXECUÇÃO REAL (não estrutural):
// Node 22+/26 executa .ts sem transpilação -- diferente das demais Edge
// Functions (que usam Deno.serve/Deno.env e por isso só têm cobertura por
// texto-fonte), este módulo é puro e roda de verdade sob `node --test`.
// ============================================================================

test('GRACE_PERIOD_DAYS é exatamente 3 (regra comercial congelada)', () => {
  assert.equal(GRACE_PERIOD_DAYS, 3);
});

test('webhook só aplica transições quando o status reconsultado na Asaas confirma o evento', () => {
  assert.equal(isProviderPaymentStatusConsistent('PAYMENT_CONFIRMED', 'CONFIRMED'), true);
  assert.equal(isProviderPaymentStatusConsistent('PAYMENT_RECEIVED', 'RECEIVED_IN_CASH'), true);
  assert.equal(isProviderPaymentStatusConsistent('PAYMENT_CONFIRMED', 'PENDING'), false);
  assert.equal(isProviderPaymentStatusConsistent('PAYMENT_OVERDUE', 'OVERDUE'), true);
  assert.equal(isProviderPaymentStatusConsistent('PAYMENT_OVERDUE', 'RECEIVED'), false);
  assert.equal(isProviderPaymentStatusConsistent('PAYMENT_REFUNDED', 'REFUNDED'), true);
});

test('mapAsaasPaymentStatus: mapeamento completo de status bruto da Asaas -> nosso enum', () => {
  const cases = [
    ['PENDING', 'pending'],
    ['AWAITING_RISK_ANALYSIS', 'pending'],
    ['APPROVED_BY_RISK_ANALYSIS', 'pending'],
    ['REPROVED_BY_RISK_ANALYSIS', 'canceled'],
    ['CONFIRMED', 'confirmed'],
    ['RECEIVED', 'received'],
    ['RECEIVED_IN_CASH', 'received'],
    ['OVERDUE', 'overdue'],
    ['REFUNDED', 'refunded'],
    ['REFUND_IN_PROGRESS', 'refunded'],
    ['DELETED', 'canceled'],
    ['CANCELED', 'canceled'],
  ];
  for (const [raw, expected] of cases) {
    assert.equal(mapAsaasPaymentStatus('PAYMENT_UPDATED', raw), expected, `${raw} deveria mapear para ${expected}`);
  }
});

test('mapAsaasPaymentStatus: status desconhecido/ausente cai em "pending" com segurança, nunca lança', () => {
  assert.equal(mapAsaasPaymentStatus('PAYMENT_UPDATED', 'ALGO_NAO_DOCUMENTADO'), 'pending');
  assert.equal(mapAsaasPaymentStatus('PAYMENT_UPDATED', undefined), 'pending');
  assert.equal(mapAsaasPaymentStatus('PAYMENT_UPDATED', 123), 'pending');
});

test('mapAsaasPaymentStatus: eventos de chargeback SEMPRE retornam "chargeback", mesmo que payment.status pareça outra coisa', () => {
  for (const eventType of ['PAYMENT_CHARGEBACK_REQUESTED', 'PAYMENT_CHARGEBACK_DISPUTE', 'PAYMENT_AWAITING_CHARGEBACK_REVERSAL']) {
    assert.equal(mapAsaasPaymentStatus(eventType, 'RECEIVED'), 'chargeback');
    assert.equal(mapAsaasPaymentStatus(eventType, undefined), 'chargeback');
  }
});

test('PROCESSABLE_PAYMENT_EVENT_TYPES contém todos os 14 eventos do MVP (11 de pagamento + 3 de análise de risco)', () => {
  const expected = [
    'PAYMENT_CREATED', 'PAYMENT_UPDATED', 'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED',
    'PAYMENT_OVERDUE', 'PAYMENT_DELETED', 'PAYMENT_REFUNDED', 'PAYMENT_PARTIALLY_REFUNDED',
    'PAYMENT_CHARGEBACK_REQUESTED', 'PAYMENT_CHARGEBACK_DISPUTE', 'PAYMENT_AWAITING_CHARGEBACK_REVERSAL',
    'PAYMENT_AWAITING_RISK_ANALYSIS', 'PAYMENT_APPROVED_BY_RISK_ANALYSIS', 'PAYMENT_REPROVED_BY_RISK_ANALYSIS',
  ];
  assert.equal(PROCESSABLE_PAYMENT_EVENT_TYPES.size, expected.length);
  for (const eventType of expected) {
    assert.ok(PROCESSABLE_PAYMENT_EVENT_TYPES.has(eventType), `${eventType} deveria ser processável`);
  }
});

test('computeNextPeriodEnd avança exatamente 1 mês em UTC, inclusive em viradas de ano/mês curto', () => {
  assert.equal(computeNextPeriodEnd('2026-01-15T10:00:00.000Z'), '2026-02-15T10:00:00.000Z');
  assert.equal(computeNextPeriodEnd('2026-12-20T00:00:00.000Z'), '2027-01-20T00:00:00.000Z');
  assert.equal(computeNextPeriodEnd('2026-01-31T00:00:00.000Z'), '2026-03-03T00:00:00.000Z', 'JS soma mês corretamente mesmo sem dia 31 em fevereiro (overflow natural do Date)');
});

test('computePaidPeriodEnd usa a data da cobrança, preserva períodos adiantados e limita o fim ao último dia do mês', () => {
  assert.equal(computePaidPeriodEnd({
    paymentDate: '2026-03-01T09:00:00.000Z', dueDate: '2026-03-01',
    currentPeriodEndsAt: null, now: '2026-05-20T00:00:00.000Z',
  }), '2026-04-01T09:00:00.000Z', 'atraso do webhook não move o início do período para maio');
  assert.equal(computePaidPeriodEnd({
    paymentDate: '2026-02-20T09:00:00.000Z', dueDate: '2026-03-01',
    currentPeriodEndsAt: '2026-03-01T09:00:00.000Z', now: '2026-02-20T09:00:00.000Z',
  }), '2026-04-01T00:00:00.000Z', 'vencimento mantém a renovação alinhada mesmo com pagamento antecipado');
  assert.equal(computePaidPeriodEnd({
    paymentDate: '2026-01-31T00:00:00.000Z', dueDate: null,
    currentPeriodEndsAt: null, now: '2026-01-31T00:00:00.000Z',
  }), '2026-02-28T00:00:00.000Z', 'fim de mês é limitado ao último dia do mês seguinte');
  assert.equal(computePaidPeriodEnd({
    paymentDate: '2026-03-01T00:00:00.000Z', dueDate: null,
    currentPeriodEndsAt: '2026-05-01T00:00:00.000Z', now: '2026-03-01T00:00:00.000Z',
  }), '2026-05-01T00:00:00.000Z', 'reconciliação repetida não encurta o período já persistido');
});

test('resolveSubscriptionPatchForEvent: subscription nula -> null (cobrança avulsa, sem assinatura para atualizar)', () => {
  assert.equal(resolveSubscriptionPatchForEvent({ eventType: 'PAYMENT_RECEIVED', subscription: null, now: '2026-01-01T00:00:00Z' }), null);
});

for (const status of ['pending', 'past_due', 'suspended']) {
  test(`resolveSubscriptionPatchForEvent: PAYMENT_CONFIRMED ativa a partir de "${status}" -- status=active + período recalculado`, () => {
    const patch = resolveSubscriptionPatchForEvent({
      eventType: 'PAYMENT_CONFIRMED',
      subscription: { status },
      now: '2026-03-01T00:00:00.000Z',
    });
    assert.deepEqual(patch, { status: 'active', current_period_ends_at: '2026-04-01T00:00:00.000Z' });
  });

  test(`resolveSubscriptionPatchForEvent: PAYMENT_RECEIVED ativa a partir de "${status}" -- mesmo comportamento de PAYMENT_CONFIRMED`, () => {
    const patch = resolveSubscriptionPatchForEvent({
      eventType: 'PAYMENT_RECEIVED',
      subscription: { status },
      now: '2026-03-01T00:00:00.000Z',
    });
    assert.deepEqual(patch, { status: 'active', current_period_ends_at: '2026-04-01T00:00:00.000Z' });
  });
}

test('resolveSubscriptionPatchForEvent: PAYMENT_RECEIVED após PAYMENT_CONFIRMED não reaplica ativação nem estende o período', () => {
  const firstPatch = resolveSubscriptionPatchForEvent({
    eventType: 'PAYMENT_CONFIRMED',
    subscription: { status: 'pending' },
    now: '2026-03-01T00:00:00.000Z',
    paymentDate: '2026-03-01T00:00:00.000Z',
    dueDate: '2026-03-01',
  });
  assert.deepEqual(firstPatch, { status: 'active', current_period_ends_at: '2026-04-01T00:00:00.000Z' });

  const duplicateSemanticPatch = resolveSubscriptionPatchForEvent({
    eventType: 'PAYMENT_RECEIVED',
    subscription: { status: 'active', current_period_ends_at: '2026-04-01T00:00:00.000Z' },
    now: '2026-03-02T00:00:00.000Z',
    paymentDate: '2026-03-01T00:00:00.000Z',
    dueDate: '2026-03-01',
  });
  assert.equal(duplicateSemanticPatch, null);
});

test('resolveSubscriptionPatchForEvent: cobrança duplicada não estende o período ativo', () => {
  const patch = resolveSubscriptionPatchForEvent({
    eventType: 'PAYMENT_CONFIRMED',
    subscription: { status: 'active', current_period_ends_at: '2026-04-01T00:00:00.000Z' },
    now: '2026-03-02T00:00:00.000Z',
    paymentDate: '2026-03-01T00:00:00.000Z',
    dueDate: '2026-03-01',
  });
  assert.equal(patch, null);
});

test('resolveSubscriptionPatchForEvent: nova cobrança confirmada estende uma assinatura ativa a partir do vencimento', () => {
  const patch = resolveSubscriptionPatchForEvent({
    eventType: 'PAYMENT_RECEIVED',
    subscription: { status: 'active', current_period_ends_at: '2026-04-01T00:00:00.000Z' },
    now: '2026-05-20T00:00:00.000Z',
    paymentDate: '2026-03-30T12:00:00.000Z',
    dueDate: '2026-04-01',
  });
  assert.deepEqual(patch, { status: 'active', current_period_ends_at: '2026-05-01T00:00:00.000Z' });
});

test('resolveSubscriptionPatchForEvent: PAYMENT_RECEIVED antes de PAYMENT_CONFIRMED termina active sem segunda transição', () => {
  const receivedFirst = resolveSubscriptionPatchForEvent({
    eventType: 'PAYMENT_RECEIVED',
    subscription: { status: 'pending' },
    now: '2026-03-01T00:00:00.000Z',
    paymentDate: '2026-03-01T00:00:00.000Z',
    dueDate: '2026-03-01',
  });
  assert.deepEqual(receivedFirst, { status: 'active', current_period_ends_at: '2026-04-01T00:00:00.000Z' });

  const confirmedLate = resolveSubscriptionPatchForEvent({
    eventType: 'PAYMENT_CONFIRMED',
    subscription: { status: 'active', current_period_ends_at: '2026-04-01T00:00:00.000Z' },
    now: '2026-03-03T00:00:00.000Z',
    paymentDate: '2026-03-01T00:00:00.000Z',
    dueDate: '2026-03-01',
  });
  assert.equal(confirmedLate, null);
});

for (const status of ['canceled', 'expired']) {
  test(`resolveSubscriptionPatchForEvent: nunca reativa uma assinatura "${status}" (estado terminal, mesmo com PAYMENT_RECEIVED)`, () => {
    const patch = resolveSubscriptionPatchForEvent({
      eventType: 'PAYMENT_RECEIVED',
      subscription: { status },
      now: '2026-03-01T00:00:00.000Z',
    });
    assert.equal(patch, null);
  });
}

test('resolveSubscriptionPatchForEvent: PAYMENT_OVERDUE só marca past_due quando a assinatura estava "active"', () => {
  const patch = resolveSubscriptionPatchForEvent({
    eventType: 'PAYMENT_OVERDUE',
    subscription: { status: 'active' },
    now: '2026-03-01T00:00:00.000Z',
  });
  assert.deepEqual(patch, { status: 'past_due' });
});

for (const status of ['pending', 'past_due', 'suspended']) {
  test(`resolveSubscriptionPatchForEvent: PAYMENT_OVERDUE não faz nada quando a assinatura já está "${status}" (nunca piora um estado que não era "active")`, () => {
    const patch = resolveSubscriptionPatchForEvent({
      eventType: 'PAYMENT_OVERDUE',
      subscription: { status },
      now: '2026-03-01T00:00:00.000Z',
    });
    assert.equal(patch, null);
  });
}

for (const eventType of [
  'PAYMENT_CREATED', 'PAYMENT_UPDATED', 'PAYMENT_DELETED',
  'PAYMENT_REFUNDED', 'PAYMENT_PARTIALLY_REFUNDED',
  'PAYMENT_CHARGEBACK_REQUESTED', 'PAYMENT_CHARGEBACK_DISPUTE', 'PAYMENT_AWAITING_CHARGEBACK_REVERSAL',
  'PAYMENT_AWAITING_RISK_ANALYSIS', 'PAYMENT_APPROVED_BY_RISK_ANALYSIS', 'PAYMENT_REPROVED_BY_RISK_ANALYSIS',
]) {
  test(`resolveSubscriptionPatchForEvent: ${eventType} nunca altera o status da assinatura (mesmo já ativa)`, () => {
    const patch = resolveSubscriptionPatchForEvent({
      eventType,
      subscription: { status: 'active' },
      now: '2026-03-01T00:00:00.000Z',
    });
    assert.equal(patch, null, `${eventType} não deveria alterar a assinatura`);
  });
}

test('isGracePeriodExpired: false antes de 3 dias, true exatamente em 3 dias, true depois', () => {
  const since = '2026-01-01T00:00:00.000Z';
  assert.equal(isGracePeriodExpired({ pastDueSince: since, now: '2026-01-03T23:59:59.999Z' }), false, 'quase 3 dias ainda não expirou');
  assert.equal(isGracePeriodExpired({ pastDueSince: since, now: '2026-01-04T00:00:00.000Z' }), true, 'exatamente 3 dias já expirou (comparação >=)');
  assert.equal(isGracePeriodExpired({ pastDueSince: since, now: '2026-01-10T00:00:00.000Z' }), true, 'bem depois de 3 dias continua expirado');
});

test('isGracePeriodExpired: datas inválidas nunca lançam -- retornam false com segurança', () => {
  assert.equal(isGracePeriodExpired({ pastDueSince: 'not-a-date', now: '2026-01-01T00:00:00Z' }), false);
  assert.equal(isGracePeriodExpired({ pastDueSince: '2026-01-01T00:00:00Z', now: 'not-a-date' }), false);
});

test('isGracePeriodExpired: graceDays customizável (não usado em produção, mas suportado para teste)', () => {
  assert.equal(isGracePeriodExpired({ pastDueSince: '2026-01-01T00:00:00Z', now: '2026-01-02T00:00:00Z', graceDays: 1 }), true);
});

test('resolveCancellationPatch: agenda o cancelamento para o fim do período pago -- nunca corta acesso imediato', () => {
  const patch = resolveCancellationPatch({
    subscription: { current_period_ends_at: '2026-04-01T00:00:00.000Z' },
    now: '2026-03-15T00:00:00.000Z',
  });
  assert.deepEqual(patch, { cancel_at_period_end: true, cancel_effective_at: '2026-04-01T00:00:00.000Z' });
});

test('resolveCancellationPatch: sem período vigente conhecido, usa "now" como fallback seguro (nunca null)', () => {
  const patch = resolveCancellationPatch({
    subscription: { current_period_ends_at: null },
    now: '2026-03-15T00:00:00.000Z',
  });
  assert.deepEqual(patch, { cancel_at_period_end: true, cancel_effective_at: '2026-03-15T00:00:00.000Z' });
});

test('buildBillingPaymentRow: monta a linha completa a partir do payload bruto da Asaas', () => {
  const row = buildBillingPaymentRow({
    workspaceId: 'ws-1',
    asaasPaymentId: 'pay_123',
    asaasSubscriptionId: 'sub_456',
    eventType: 'PAYMENT_RECEIVED',
    payment: {
      status: 'RECEIVED', billingType: 'PIX', value: 29.9, dueDate: '2026-03-01',
      paymentDate: '2026-03-01', invoiceUrl: 'https://sandbox.asaas.com/i/abc',
    },
  });
  assert.deepEqual(row, {
    workspace_id: 'ws-1',
    asaas_payment_id: 'pay_123',
    asaas_subscription_id: 'sub_456',
    status: 'received',
    billing_type: 'pix',
    value: 29.9,
    due_date: '2026-03-01',
    paid_at: '2026-03-01',
    invoice_url: 'https://sandbox.asaas.com/i/abc',
  });
});

test('buildBillingPaymentRow: cobrança avulsa (asaasSubscriptionId null) preserva null -- nunca inventa um id', () => {
  const row = buildBillingPaymentRow({
    workspaceId: 'ws-1', asaasPaymentId: 'pay_999', asaasSubscriptionId: null,
    eventType: 'PAYMENT_CREATED', payment: { status: 'PENDING', value: 29.9 },
  });
  assert.equal(row.asaas_subscription_id, null);
  assert.equal(row.status, 'pending');
});

test('buildBillingPaymentRow: campos ausentes no payment nunca lançam -- caem em valores seguros (0/null)', () => {
  const row = buildBillingPaymentRow({
    workspaceId: 'ws-1', asaasPaymentId: 'pay_1', asaasSubscriptionId: null,
    eventType: 'PAYMENT_UPDATED', payment: {},
  });
  assert.equal(row.value, 0);
  assert.equal(row.billing_type, null);
  assert.equal(row.due_date, null);
  assert.equal(row.paid_at, null);
  assert.equal(row.invoice_url, null);
});

// ============================================================================
// BLOCO ASAAS CHECKOUT -- payload puro do Checkout hospedado (cartão) +
// higiene de checkouts abandonados. Mesmo padrão: puro, sem I/O, execução
// real sob node --test.
// ============================================================================

test('PLAN_PRICE_BRL/PLAN_CYCLE são a mesma decisão comercial congelada (29,90 / MONTHLY)', () => {
  assert.equal(PLAN_PRICE_BRL, 29.9);
  assert.equal(PLAN_CYCLE, 'MONTHLY');
});

test('buildCheckoutPayload: billingTypes é sempre ["CREDIT_CARD"] e chargeTypes sempre ["RECURRENT"]', () => {
  const payload = buildCheckoutPayload({
    workspaceId: 'ws-checkout-1',
    successUrl: 'https://app.example.com/plano-pessoal/retorno?status=success',
    cancelUrl: 'https://app.example.com/plano-pessoal/retorno?status=cancel',
    now: '2026-07-30T12:00:00.000Z',
  });
  assert.deepEqual(payload.billingTypes, ['CREDIT_CARD']);
  assert.deepEqual(payload.chargeTypes, ['RECURRENT']);
});

test('buildCheckoutPayload: nunca inclui número/validade/CVV de cartão -- só billingTypes/chargeTypes/items/subscription/callback/externalReference', () => {
  const payload = buildCheckoutPayload({
    workspaceId: 'ws-checkout-1',
    successUrl: 'https://app.example.com/retorno?status=success',
    cancelUrl: 'https://app.example.com/retorno?status=cancel',
    now: '2026-07-30T12:00:00.000Z',
  });
  const serialized = JSON.stringify(payload).toLowerCase();
  assert.doesNotMatch(serialized, /cvv|cardnumber|card_number|expirymonth|expiryyear/);
});

// DESCOBERTA REAL NO SANDBOX: enviar customerData PARCIAL (sem endereço) é
// REJEITADO pela Asaas ("O campo address/addressNumber/postalCode/province
// deve ser informado") -- a UniFlow nunca coletou endereço (fora de
// escopo). Testado no Sandbox: omitir customerData por completo funciona
// (201, checkout criado) -- o próprio Checkout hospedado pede os dados do
// pagador na página dele. Por isso buildCheckoutPayload nunca envia
// customerData -- nunca invente um endereço falso para contornar isso.
test('buildCheckoutPayload: nunca envia customerData -- Asaas rejeita customerData parcial (sem endereço), que a UniFlow nunca coletou', () => {
  const payload = buildCheckoutPayload({
    workspaceId: 'ws-checkout-1',
    successUrl: 'https://app.example.com/retorno?status=success',
    cancelUrl: 'https://app.example.com/retorno?status=cancel',
    now: '2026-07-30T12:00:00.000Z',
  });
  assert.equal('customerData' in payload, false);
});

// ============================================================================
// CORRECAO NOTIFICACOES (cartao): confirmado nas docs oficiais
// (docs.asaas.com/docs/how-to-provide-customer-data,
// docs.asaas.com/reference/create-new-checkout) que o Checkout aceita
// `customer` (ID de um cliente Asaas ja existente) como alternativa a
// `customerData` -- mutuamente exclusivos. Quando o chamador ja sabe o
// asaas_customer_id do workspace (billing_customers, criado com
// notificationDisabled:true por billing-create-customer), ele passa a ser
// enviado como `customer`, reutilizando esse cliente em vez de deixar a
// Asaas criar um novo so para o Checkout.
// ============================================================================

test('buildCheckoutPayload: com asaasCustomerId, envia customer=<id> e continua sem customerData', () => {
  const payload = buildCheckoutPayload({
    workspaceId: 'ws-checkout-1',
    successUrl: 'https://app.example.com/retorno?status=success',
    cancelUrl: 'https://app.example.com/retorno?status=cancel',
    now: '2026-07-30T12:00:00.000Z',
    asaasCustomerId: 'cus_000005821234',
  });
  assert.equal(payload.customer, 'cus_000005821234');
  assert.equal('customerData' in payload, false);
});

test('buildCheckoutPayload: sem asaasCustomerId (ausente, null ou vazio), nunca envia customer nem customerData -- comportamento antigo intacto', () => {
  for (const asaasCustomerId of [undefined, null, '']) {
    const payload = buildCheckoutPayload({
      workspaceId: 'ws-checkout-1',
      successUrl: 'https://app.example.com/retorno?status=success',
      cancelUrl: 'https://app.example.com/retorno?status=cancel',
      now: '2026-07-30T12:00:00.000Z',
      asaasCustomerId,
    });
    assert.equal('customer' in payload, false);
    assert.equal('customerData' in payload, false);
  }
});

test('buildCheckoutPayload: customer e customerData nunca coexistem (mutuamente exclusivos, exigência oficial da Asaas)', () => {
  const withCustomer = buildCheckoutPayload({
    workspaceId: 'ws-checkout-1',
    successUrl: 'https://app.example.com/retorno?status=success',
    cancelUrl: 'https://app.example.com/retorno?status=cancel',
    now: '2026-07-30T12:00:00.000Z',
    asaasCustomerId: 'cus_000005821234',
  });
  assert.ok('customer' in withCustomer && !('customerData' in withCustomer));
});

test('buildCheckoutPayload: restante do payload (billingTypes/chargeTypes/items/callback/subscription/externalReference) é idêntico com ou sem asaasCustomerId -- só o vínculo de customer é acrescentado', () => {
  const base = {
    workspaceId: 'ws-checkout-1',
    successUrl: 'https://app.example.com/retorno?status=success',
    cancelUrl: 'https://app.example.com/retorno?status=cancel',
    now: '2026-07-30T12:00:00.000Z',
  };
  const without = buildCheckoutPayload(base);
  const withCustomer = buildCheckoutPayload({ ...base, asaasCustomerId: 'cus_000005821234' });
  const withCustomerRest = { ...withCustomer };
  delete withCustomerRest.customer;
  assert.deepEqual(withCustomerRest, without);
});

test('buildCheckoutPayload: externalReference é o workspace_id -- nunca outro identificador', () => {
  const payload = buildCheckoutPayload({
    workspaceId: 'ws-checkout-42',
    successUrl: 'https://app.example.com/retorno?status=success',
    cancelUrl: 'https://app.example.com/retorno?status=cancel',
    now: '2026-07-30T12:00:00.000Z',
  });
  assert.equal(payload.externalReference, 'ws-checkout-42');
});

test('buildCheckoutPayload: callback tem successUrl/cancelUrl sempre, expiredUrl só quando informado', () => {
  const withoutExpired = buildCheckoutPayload({
    workspaceId: 'ws-1',
    successUrl: 'https://app.example.com/retorno?status=success',
    cancelUrl: 'https://app.example.com/retorno?status=cancel',
    now: '2026-07-30T12:00:00.000Z',
  });
  assert.equal(withoutExpired.callback.successUrl, 'https://app.example.com/retorno?status=success');
  assert.equal(withoutExpired.callback.cancelUrl, 'https://app.example.com/retorno?status=cancel');
  assert.equal(withoutExpired.callback.expiredUrl, undefined);

  const withExpired = buildCheckoutPayload({
    workspaceId: 'ws-1',
    successUrl: 'https://app.example.com/retorno?status=success',
    cancelUrl: 'https://app.example.com/retorno?status=cancel',
    expiredUrl: 'https://app.example.com/retorno?status=expired',
    now: '2026-07-30T12:00:00.000Z',
  });
  assert.equal(withExpired.callback.expiredUrl, 'https://app.example.com/retorno?status=expired');
});

test('buildCheckoutPayload: items tem exatamente 1 item, Plano Pessoal, quantidade 1, valor 29.90', () => {
  const payload = buildCheckoutPayload({
    workspaceId: 'ws-1',
    successUrl: 'https://app.example.com/retorno?status=success',
    cancelUrl: 'https://app.example.com/retorno?status=cancel',
    now: '2026-07-30T12:00:00.000Z',
  });
  assert.equal(payload.items.length, 1);
  assert.equal(payload.items[0].name, 'Plano Pessoal');
  assert.equal(payload.items[0].quantity, 1);
  assert.equal(payload.items[0].value, 29.9);
});

test('buildCheckoutPayload: subscription.cycle é MONTHLY, sem trial (endDate nunca definido)', () => {
  const payload = buildCheckoutPayload({
    workspaceId: 'ws-1',
    successUrl: 'https://app.example.com/retorno?status=success',
    cancelUrl: 'https://app.example.com/retorno?status=cancel',
    now: '2026-07-30T12:00:00.000Z',
  });
  assert.equal(payload.subscription.cycle, 'MONTHLY');
  assert.equal(payload.subscription.nextDueDate, '2026-07-30');
  assert.equal('endDate' in payload.subscription, false);
});

test('CHECKOUT_MINUTES_TO_EXPIRE está dentro do intervalo aceito pela Asaas (10-1440)', () => {
  assert.ok(CHECKOUT_MINUTES_TO_EXPIRE >= 10 && CHECKOUT_MINUTES_TO_EXPIRE <= 1440);
});

test('PROCESSABLE_CHECKOUT_EVENT_TYPES contém apenas CHECKOUT_EXPIRED e CHECKOUT_CANCELED -- nunca CHECKOUT_PAID/CHECKOUT_CREATED (ativação é só por evento de pagamento)', () => {
  assert.equal(PROCESSABLE_CHECKOUT_EVENT_TYPES.size, 2);
  assert.ok(PROCESSABLE_CHECKOUT_EVENT_TYPES.has('CHECKOUT_EXPIRED'));
  assert.ok(PROCESSABLE_CHECKOUT_EVENT_TYPES.has('CHECKOUT_CANCELED'));
  assert.equal(PROCESSABLE_CHECKOUT_EVENT_TYPES.has('CHECKOUT_PAID'), false);
  assert.equal(PROCESSABLE_CHECKOUT_EVENT_TYPES.has('CHECKOUT_CREATED'), false);
});

test('resolveCheckoutHygienePatch: subscription nula -> null', () => {
  assert.equal(resolveCheckoutHygienePatch({ eventType: 'CHECKOUT_EXPIRED', subscription: null }), null);
});

test('resolveCheckoutHygienePatch: evento não-checkout -> null', () => {
  const patch = resolveCheckoutHygienePatch({
    eventType: 'PAYMENT_CONFIRMED',
    subscription: { asaas_subscription_id: null },
  });
  assert.equal(patch, null);
});

test('resolveCheckoutHygienePatch: CHECKOUT_EXPIRED/CANCELED sem asaas_subscription_id -> cancela a linha pendente abandonada', () => {
  const expired = resolveCheckoutHygienePatch({
    eventType: 'CHECKOUT_EXPIRED',
    subscription: { asaas_subscription_id: null },
  });
  assert.deepEqual(expired, { status: 'canceled' });

  const canceled = resolveCheckoutHygienePatch({
    eventType: 'CHECKOUT_CANCELED',
    subscription: { asaas_subscription_id: null },
  });
  assert.deepEqual(canceled, { status: 'canceled' });
});

test('resolveCheckoutHygienePatch: JÁ vinculada a uma assinatura real (asaas_subscription_id presente) -> nunca cancela, mesmo em evento tardio/fora de ordem', () => {
  const patch = resolveCheckoutHygienePatch({
    eventType: 'CHECKOUT_EXPIRED',
    subscription: { asaas_subscription_id: 'sub_123' },
  });
  assert.equal(patch, null);
});
