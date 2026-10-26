import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPixAutomaticPayload, pixAutomaticView, resolvePixAutomaticPaymentPatch, validatePixAuthorization } from '../../supabase/functions/_shared/pixAutomaticRules.ts';
import { canShowPixAutomaticQr, pixAutomaticMessage } from '../features/personal-plan/pixAutomaticPresentation.js';
const contract = 'a'.repeat(32);
const local = { contract_id: contract, asaas_customer_id: 'cus_fixture' };
const remote = { id: 'authorization_fixture', contractId: contract, customerId: 'cus_fixture', value: 29.9, frequency: 'MONTHLY', paymentCreationMode: 'SUBSCRIPTION', status: 'CREATED' };

test('Pix Automático usa autorização SUBSCRIPTION e valor do backend, sem assinatura Pix convencional', () => {
  const payload = buildPixAutomaticPayload({ contractId: contract, customerId: 'cus_fixture', now: '2026-10-26T01:00:00Z' });
  assert.equal(payload.paymentCreationMode, 'SUBSCRIPTION');
  assert.equal(payload.value, 29.9);
  assert.equal(payload.frequency, 'MONTHLY');
  assert.equal(payload.startDate, '2026-10-25');
  assert.equal(payload.immediateQrCode.originalValue, 29.9);
  assert.equal(payload.immediateQrCode.description, `UF:${contract}`);
  assert.equal(payload.billingType, undefined);
});
test('autorização divergente de cliente, contrato, valor ou modo não é aceita', () => {
  assert.equal(validatePixAuthorization(remote, local), true);
  for (const patch of [{ customerId: 'other' }, { contractId: 'other' }, { value: 1 }, { paymentCreationMode: 'MANUAL' }, { status: 'UNKNOWN' }]) assert.equal(validatePixAuthorization({ ...remote, ...patch }, local), false);
});
test('autorização ACTIVE ou instrução concluída não substituem a confirmação financeira', () => {
  assert.deepEqual(resolvePixAutomaticPaymentPatch({ payment: { status: 'PENDING', value: 29.9 }, subscription: { status: 'pending' }, authorizationStatus: 'ACTIVE', now: '2026-10-26Z' }), {});
});
test('pagamento inicial recebido e autorização recusada preservam um período pago sem fingir recorrência ativa', () => {
  const patch = resolvePixAutomaticPaymentPatch({ payment: { status: 'RECEIVED', value: 29.9, paymentDate: '2026-10-26' }, subscription: { status: 'pending' }, authorizationStatus: 'REFUSED', now: '2026-10-26T12:00Z' });
  assert.equal(patch.status, 'active');
  assert.equal(patch.current_period_ends_at, '2026-11-26T00:00:00.000Z');
  assert.equal(patch.cancel_effective_at, patch.current_period_ends_at);
  assert.equal(pixAutomaticView({ status: 'REFUSED', initial_payment_confirmed: true }).recurring_active, false);
  assert.match(pixAutomaticMessage({ status: 'REFUSED', initial_payment_confirmed: true }), /pagamento deste período continua válido/);
});
test('consentimento ainda pendente mantém apenas o período já pago', () => {
  const patch = resolvePixAutomaticPaymentPatch({ payment: { status: 'CONFIRMED', value: 29.9, dueDate: '2026-10-26' }, subscription: { status: 'pending' }, authorizationStatus: 'CREATED', now: '2026-10-26Z' });
  assert.equal(patch.cancel_at_period_end, true);
});
test('evidência vencida, sem data ou valor correto nunca reativa', () => {
  for (const payment of [{ status: 'RECEIVED', value: 29.9, dueDate: '2020-01-01' }, { status: 'RECEIVED', value: 29.9 }, { status: 'RECEIVED', value: 1, dueDate: '2026-10-26' }]) {
    assert.deepEqual(resolvePixAutomaticPaymentPatch({ payment, subscription: { status: 'suspended' }, authorizationStatus: 'ACTIVE', now: '2026-10-26Z' }), {});
  }
});
test('QR expirado, já pago ou com cancelamento solicitado fica oculto', () => {
  const row = { status: 'CREATED', payload: 'provider-payload', expiration_date: '2026-10-26 12:00:00' };
  assert.equal(canShowPixAutomaticQr(row, Date.parse('2026-10-26T14:59:59Z')), true);
  assert.equal(canShowPixAutomaticQr(row, Date.parse('2026-10-26T15:00:00Z')), false);
  assert.equal(canShowPixAutomaticQr({ ...row, initial_payment_confirmed: true }, Date.parse('2026-10-26Z')), false);
  assert.equal(canShowPixAutomaticQr({ ...row, cancellation_requested: true }, Date.parse('2026-10-26Z')), false);
});
