// BLOCO FINAL DO MVP (Histórico de pagamentos): testes do mapeamento de
// status de billing_payments -- reaproveita exatamente o contrato já usado
// pelo backend (billing_payments_status_check +
// _shared/billingSubscriptionRules.ts mapAsaasPaymentStatus), nunca inventa
// um nome de status novo.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PAYMENT_DESCRIPTION,
  resolvePaymentStatusLabel,
  resolvePaymentStatusTone,
} from './paymentPresentation.js';

const REAL_STATUSES = ['pending', 'confirmed', 'received', 'overdue', 'refunded', 'chargeback', 'canceled'];

test('resolvePaymentStatusLabel cobre exatamente os 7 status reais de billing_payments (contrato do backend)', () => {
  assert.equal(resolvePaymentStatusLabel('pending'), 'Pendente');
  assert.equal(resolvePaymentStatusLabel('confirmed'), 'Confirmado');
  assert.equal(resolvePaymentStatusLabel('received'), 'Recebido');
  assert.equal(resolvePaymentStatusLabel('overdue'), 'Vencido');
  assert.equal(resolvePaymentStatusLabel('refunded'), 'Estornado');
  assert.equal(resolvePaymentStatusLabel('chargeback'), 'Contestado');
  assert.equal(resolvePaymentStatusLabel('canceled'), 'Cancelado');
});

test('resolvePaymentStatusLabel nunca inventa um status novo -- desconhecido cai num fallback honesto', () => {
  assert.equal(resolvePaymentStatusLabel('algo_novo'), 'Status desconhecido');
  assert.equal(resolvePaymentStatusLabel(undefined), 'Status desconhecido');
});

test('resolvePaymentStatusTone: recebido/confirmado são "ok", vencido é "warn", os demais terminais negativos são "danger"', () => {
  assert.equal(resolvePaymentStatusTone('received'), 'ok');
  assert.equal(resolvePaymentStatusTone('confirmed'), 'ok');
  assert.equal(resolvePaymentStatusTone('overdue'), 'warn');
  assert.equal(resolvePaymentStatusTone('refunded'), 'danger');
  assert.equal(resolvePaymentStatusTone('chargeback'), 'danger');
  assert.equal(resolvePaymentStatusTone('canceled'), 'danger');
  assert.equal(resolvePaymentStatusTone('pending'), 'neutral');
});

test('todo status real tem label e tone definidos -- nenhum cai no fallback genérico', () => {
  for (const status of REAL_STATUSES) {
    assert.notEqual(resolvePaymentStatusLabel(status), 'Status desconhecido');
    assert.ok(['ok', 'warn', 'danger', 'neutral'].includes(resolvePaymentStatusTone(status)));
  }
});

test('PAYMENT_DESCRIPTION é o único plano real do MVP -- nunca uma descrição por linha inventada (Asaas não devolve uma)', () => {
  assert.equal(PAYMENT_DESCRIPTION, 'Plano Pessoal');
});
