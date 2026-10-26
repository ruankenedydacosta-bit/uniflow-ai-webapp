import assert from 'node:assert/strict';
import test from 'node:test';
import { billingDueTimestamp, effectiveBillingStatus, resolveBillingLifecycle, validateProviderPayments } from '../../supabase/functions/_shared/billingLifecycle.ts';
const unpaid = { customer: 'cus_fixture', id: 'pay_new', status: 'OVERDUE', dueDate: '2026-10-01', subscription: 'sub_fixture', value: 29.9 };
const subscription = { status: 'active', current_period_ends_at: '2026-10-01T00:00:00Z' };
const resolve = (now, payments = [unpaid], sub = subscription) => resolveBillingLifecycle({ subscription: sub, payments, now });

test('estado público aplica o prazo pago e a carência mesmo antes da execução do worker', () => {
  assert.equal(effectiveBillingStatus({ status: 'active', cancel_at_period_end: true, cancel_effective_at: '2026-10-01Z' }, Date.parse('2026-10-02Z')), 'canceled');
  assert.equal(effectiveBillingStatus({ status: 'past_due', billing_grace_ends_at: '2026-10-04T03:00Z' }, Date.parse('2026-10-04T03:00Z')), 'suspended');
});

test('carência vence à meia-noite brasileira após três dias corridos do vencimento', () => {
  assert.equal(billingDueTimestamp('2026-10-01'), Date.parse('2026-10-01T03:00:00Z'));
  assert.equal(resolve('2026-10-04T02:59:59.999Z').patch.status, 'past_due');
  assert.equal(resolve('2026-10-04T03:00:00Z').patch.status, 'suspended');
  assert.equal(resolve('2026-10-04T03:00:00Z').patch.billing_grace_ends_at, '2026-10-04T03:00:00.000Z');
});
test('datas civis inválidas não iniciam uma carência fictícia', () => {
  assert.ok(Number.isNaN(billingDueTimestamp('2026-02-30')));
  assert.deepEqual(resolve('2026-10-05Z', [{ ...unpaid, dueDate: 'invalid' }]).patch, {});
});
test('avisos antes, no dia e após o vencimento têm chaves estáveis por cobrança', () => {
  for (const [now, stage] of [['2026-09-30T03:00Z','before'],['2026-10-01T03:00Z','due'],['2026-10-02T03:00Z','overdue'],['2026-10-04T03:00Z','suspended']]) {
    assert.deepEqual(resolve(now).notices[0], { key: `pay_new:${stage}`, stage, paymentId: 'pay_new' });
  }
});
test('pagamento histórico não reativa assinatura com renovação em atraso', () => {
  const old = { id: 'pay_old', status: 'CONFIRMED', dueDate: '2026-09-01', paymentDate: '2026-09-01' };
  assert.equal(resolve('2026-10-05Z', [old, unpaid], { ...subscription, status: 'suspended' }).patch.status, 'suspended');
});
test('pagamento da renovação reativa automaticamente sem repetir suspensão de invoice antiga', () => {
  const paid = { id: 'pay_new', status: 'RECEIVED', dueDate: '2026-10-01', paymentDate: '2026-10-05' };
  const result = resolve('2026-10-05T12:00Z', [paid], { ...subscription, status: 'suspended' });
  assert.equal(result.patch.status, 'active');
  assert.equal(result.patch.current_period_ends_at, '2026-11-05T00:00:00.000Z');
  assert.equal(result.notices[0].stage, 'reactivated');
});
test('invoice antiga vencida não retira acesso já pago para um ciclo posterior', () => {
  assert.deepEqual(resolve('2026-10-05Z', [unpaid], { ...subscription, current_period_ends_at: '2026-11-01Z' }).patch, {});
});
test('cancelamento cumpre a data final e não apaga nenhum registro financeiro', () => {
  assert.deepEqual(resolve('2026-10-05Z', [], { ...subscription, cancel_at_period_end: true, cancel_effective_at: '2026-10-04Z' }).patch, { status: 'canceled' });
});
test('pagamento inicial confirmado ainda ativa pending, mas pending não vira inadimplência', () => {
  assert.equal(resolve('2026-10-05Z', [unpaid], { status: 'pending' }).patch.status, undefined);
  assert.equal(resolve('2026-10-05Z', [{ id: 'paid', status: 'CONFIRMED', paymentDate: '2026-10-05' }], { status: 'pending' }).patch.status, 'active');
});
test('histórico antigo de assinatura totalmente cancelada nunca reabre acesso', () => {
  assert.deepEqual(resolve('2026-10-05Z', [{ status: 'RECEIVED', dueDate: '2026-10-05' }], { status: 'canceled' }).patch, {});
});
test('pagamentos divergentes de assinatura ou valor não servem como evidência de liberação', () => {
  assert.equal(validateProviderPayments([unpaid], 'sub_fixture', 'cus_fixture'), true);
  assert.equal(validateProviderPayments([{ ...unpaid, subscription: 'other' }], 'sub_fixture', 'cus_fixture'), false);
  assert.equal(validateProviderPayments([{ ...unpaid, status: 'CONFIRMED', value: 1 }], 'sub_fixture', 'cus_fixture'), false);
});

test('customer mismatch cannot activate through lifecycle reconciliation', () => {
  assert.equal(validateProviderPayments([{ ...unpaid, status: 'CONFIRMED', customer: 'cus_other' }], 'sub_fixture', 'cus_fixture'), false);
});

test('provider INACTIVE keeps the full paid period and schedules an exact cutoff', () => {
  const result = resolveBillingLifecycle({ subscription: { status: 'active', current_period_ends_at: '2026-11-01T03:00:00Z' }, payments: [], now: '2026-10-26T00:00:00Z', providerStatus: 'INACTIVE' });
  assert.equal(result.patch.cancel_at_period_end, true);
  assert.equal(result.patch.cancel_effective_at, '2026-11-01T03:00:00.000Z');
  assert.equal(result.patch.status, undefined);
});
test('provider termination with elapsed paid period cancels even without new invoices', () => {
  assert.equal(resolveBillingLifecycle({ subscription: { status: 'active', current_period_ends_at: '2026-10-01T03:00:00Z' }, payments: [], now: '2026-10-26T00:00:00Z', providerStatus: 'INACTIVE' }).patch.status, 'canceled');
});
test('provider termination without trustworthy period requires reconciliation instead of inventing an end', () => {
  assert.throws(() => resolveBillingLifecycle({ subscription: { status: 'active' }, payments: [], now: '2026-10-26T00:00:00Z', providerStatus: 'EXPIRED' }), /PERIOD_UNAVAILABLE/);
});
