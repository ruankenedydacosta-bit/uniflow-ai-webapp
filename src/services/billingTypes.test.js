import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BILLING_PLAN_ID,
  OVERDUE_TOLERANCE_DAYS,
  PAYMENT_METHOD,
  PAYMENT_METHOD_VALUES,
  SUBSCRIPTION_STATUS,
  SUBSCRIPTION_STATUS_VALUES,
  isValidPaymentMethod,
  isValidSubscriptionStatus,
} from './billingTypes.js';

// ============================================================================
// BILLING1 (Bloco Asaas 1): estas constantes sao o congelamento em codigo das
// decisoes comerciais do Bloco Asaas 0 (docs/00-master/PLANO_INTEGRACAO_ASAAS.md).
// Nenhuma chamada externa, nenhum valor deve mudar sem uma nova decisao
// comercial equivalente.
// ============================================================================

test('SUBSCRIPTION_STATUS expõe os 6 nomes oficiais pedidos', () => {
  assert.deepEqual(Object.keys(SUBSCRIPTION_STATUS), [
    'ACTIVE', 'PENDING', 'OVERDUE', 'SUSPENDED', 'CANCELED', 'EXPIRED',
  ]);
});

test('OVERDUE aponta para o valor legado "past_due" -- nunca cria um valor redundante só para bater o nome', () => {
  assert.equal(SUBSCRIPTION_STATUS.OVERDUE, 'past_due');
});

test('PENDING e SUSPENDED são os dois valores realmente novos (não existiam no schema antes da migration 024)', () => {
  assert.equal(SUBSCRIPTION_STATUS.PENDING, 'pending');
  assert.equal(SUBSCRIPTION_STATUS.SUSPENDED, 'suspended');
});

test('SUBSCRIPTION_STATUS e SUBSCRIPTION_STATUS_VALUES são imutáveis (Object.freeze)', () => {
  assert.throws(() => { SUBSCRIPTION_STATUS.ACTIVE = 'outro'; }, TypeError);
  assert.throws(() => { SUBSCRIPTION_STATUS_VALUES.push('outro'); }, TypeError);
});

test('isValidSubscriptionStatus aceita só os 6 valores oficiais, rejeita qualquer outro', () => {
  for (const value of SUBSCRIPTION_STATUS_VALUES) {
    assert.equal(isValidSubscriptionStatus(value), true, `${value} deveria ser válido`);
  }
  assert.equal(isValidSubscriptionStatus('trialing'), false, 'valor legado não usado pelo app novo continua inválido para o app, mesmo existindo no banco');
  assert.equal(isValidSubscriptionStatus('refunded'), false, 'refunded ainda não é um status de assinatura -- é de billing_payments');
  assert.equal(isValidSubscriptionStatus(''), false);
  assert.equal(isValidSubscriptionStatus(null), false);
  assert.equal(isValidSubscriptionStatus(undefined), false);
});

test('PAYMENT_METHOD expõe exatamente Pix, Pix Automático e Cartão -- nunca boleto', () => {
  assert.deepEqual(Object.keys(PAYMENT_METHOD), ['PIX', 'PIX_AUTOMATICO', 'CREDIT_CARD']);
  assert.equal(PAYMENT_METHOD.PIX, 'pix');
  assert.equal(PAYMENT_METHOD.PIX_AUTOMATICO, 'pix_automatico');
  assert.equal(PAYMENT_METHOD.CREDIT_CARD, 'credit_card');
  assert.ok(!PAYMENT_METHOD_VALUES.includes('boleto'), 'boleto está fora do MVP por decisão comercial (Bloco Asaas 0)');
  assert.ok(!('BOLETO' in PAYMENT_METHOD));
});

test('isValidPaymentMethod aceita só pix/pix_automatico/credit_card, rejeita boleto e qualquer outro valor', () => {
  for (const value of PAYMENT_METHOD_VALUES) {
    assert.equal(isValidPaymentMethod(value), true, `${value} deveria ser válido`);
  }
  assert.equal(isValidPaymentMethod('boleto'), false);
  assert.equal(isValidPaymentMethod('bitcoin'), false);
  assert.equal(isValidPaymentMethod(''), false);
  assert.equal(isValidPaymentMethod(null), false);
});

test('OVERDUE_TOLERANCE_DAYS é 3, conforme decisão comercial oficial', () => {
  assert.equal(OVERDUE_TOLERANCE_DAYS, 3);
});

test('BILLING_PLAN_ID é "pro" -- reaproveita a linha já existente em plans, nunca cria uma 5ª linha', () => {
  assert.equal(BILLING_PLAN_ID, 'pro');
});
