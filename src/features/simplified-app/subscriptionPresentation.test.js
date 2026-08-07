// Correção (Bloco Saldo + Cobrança): testes da fonte única de apresentação
// de assinatura, reaproveitada por Conta, Seu plano e Pagamento e
// assinatura -- cobre os 9 estados reais pedidos e garante que nenhuma
// data/valor seja inventado quando ausente.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatDate,
  resolveCancelEffectiveAt,
  resolvePaymentMethodLabel,
  resolvePlanState,
  resolveRenewsAt,
  resolveTrialEndsAt,
} from './subscriptionPresentation.js';

test('resolvePlanState: sem assinatura -> "Nenhuma assinatura ativa" (nunca inventa)', () => {
  assert.deepEqual(resolvePlanState({ exists: false }), {
    status: 'not_configured',
    label: 'Nenhuma assinatura ativa',
    tone: 'neutral',
  });
  assert.deepEqual(resolvePlanState(null), {
    status: 'not_configured',
    label: 'Nenhuma assinatura ativa',
    tone: 'neutral',
  });
});

test('resolvePlanState: active sem cancelamento agendado -> "Seu plano está ativo"', () => {
  const result = resolvePlanState({ exists: true, internal_status: 'active', cancel_at_period_end: false });
  assert.deepEqual(result, { status: 'active', label: 'Seu plano está ativo', tone: 'ok' });
});

test('resolvePlanState: active COM cancel_at_period_end -> "Cancelamento agendado" (checado antes de "active" puro)', () => {
  const result = resolvePlanState({ exists: true, internal_status: 'active', cancel_at_period_end: true });
  assert.deepEqual(result, { status: 'cancel_scheduled', label: 'Cancelamento agendado', tone: 'warn' });
});

test('resolvePlanState: pending -> "Pagamento pendente"', () => {
  const result = resolvePlanState({ exists: true, internal_status: 'pending' });
  assert.deepEqual(result, { status: 'pending', label: 'Pagamento pendente', tone: 'neutral' });
});

test('resolvePlanState: trialing -> "Período de teste"', () => {
  const result = resolvePlanState({ exists: true, internal_status: 'trialing' });
  assert.deepEqual(result, { status: 'trialing', label: 'Período de teste', tone: 'ok' });
});

test('resolvePlanState: past_due -> "Pagamento em atraso"', () => {
  const result = resolvePlanState({ exists: true, internal_status: 'past_due' });
  assert.deepEqual(result, { status: 'past_due', label: 'Pagamento em atraso', tone: 'warn' });
});

test('resolvePlanState: suspended -> "Assinatura suspensa"', () => {
  const result = resolvePlanState({ exists: true, internal_status: 'suspended' });
  assert.deepEqual(result, { status: 'suspended', label: 'Assinatura suspensa', tone: 'danger' });
});

test('resolvePlanState: canceled -> "Assinatura cancelada"', () => {
  const result = resolvePlanState({ exists: true, internal_status: 'canceled' });
  assert.deepEqual(result, { status: 'canceled', label: 'Assinatura cancelada', tone: 'danger' });
});

test('resolvePlanState: expired -> "Assinatura expirada"', () => {
  const result = resolvePlanState({ exists: true, internal_status: 'expired' });
  assert.deepEqual(result, { status: 'expired', label: 'Assinatura expirada', tone: 'danger' });
});

test('resolveRenewsAt: só existe para active/trialing -- nunca uma data inventada nos demais estados', () => {
  const active = resolvePlanState({ exists: true, internal_status: 'active' });
  const canceled = resolvePlanState({ exists: true, internal_status: 'canceled' });
  const subscription = { current_period_ends_at: '2026-08-30T12:00:00Z' };

  assert.equal(resolveRenewsAt(subscription, active), '2026-08-30T12:00:00Z');
  assert.equal(resolveRenewsAt(subscription, canceled), null);
  assert.equal(resolveRenewsAt({}, active), null);
});

test('resolveRenewsAt: cancel_scheduled NUNCA aparece como "Próxima cobrança" -- cancelamento agendado não gera nova cobrança', () => {
  const cancelScheduled = resolvePlanState({ exists: true, internal_status: 'active', cancel_at_period_end: true });
  const subscription = { current_period_ends_at: '2026-08-30T12:00:00Z', cancel_effective_at: '2026-08-30T12:00:00Z' };
  assert.equal(resolveRenewsAt(subscription, cancelScheduled), null);
  assert.equal(resolveCancelEffectiveAt(subscription, cancelScheduled), '2026-08-30T12:00:00Z');
});

test('resolveRenewsAt: sem next billing real -> null (nunca 31/12/2099 nem qualquer outra data inventada)', () => {
  const active = resolvePlanState({ exists: true, internal_status: 'active' });
  assert.equal(resolveRenewsAt({ current_period_ends_at: null }, active), null);
  assert.equal(resolveRenewsAt({ current_period_ends_at: '2099-12-31T00:00:00Z' }, resolvePlanState({ exists: false })), null);
});

test('resolveCancelEffectiveAt: só existe para cancel_scheduled', () => {
  const canceled = resolvePlanState({ exists: true, internal_status: 'active', cancel_at_period_end: true });
  const active = resolvePlanState({ exists: true, internal_status: 'active' });
  const subscription = { cancel_effective_at: '2026-08-30T12:00:00Z' };
  assert.equal(resolveCancelEffectiveAt(subscription, canceled), '2026-08-30T12:00:00Z');
  assert.equal(resolveCancelEffectiveAt(subscription, active), null);
});

test('resolveTrialEndsAt: só existe para trialing', () => {
  const trialing = resolvePlanState({ exists: true, internal_status: 'trialing' });
  const active = resolvePlanState({ exists: true, internal_status: 'active' });
  const subscription = { trial_ends_at: '2026-08-30T12:00:00Z' };
  assert.equal(resolveTrialEndsAt(subscription, trialing), '2026-08-30T12:00:00Z');
  assert.equal(resolveTrialEndsAt(subscription, active), null);
});

test('resolvePaymentMethodLabel: só traduz os 3 métodos reais do MVP -- desconhecido/ausente vira null (nunca inventa)', () => {
  assert.equal(resolvePaymentMethodLabel('pix'), 'Pix');
  assert.equal(resolvePaymentMethodLabel('pix_automatico'), 'Pix Automático');
  assert.equal(resolvePaymentMethodLabel('credit_card'), 'Cartão de crédito');
  assert.equal(resolvePaymentMethodLabel('boleto'), null);
  assert.equal(resolvePaymentMethodLabel(null), null);
  assert.equal(resolvePaymentMethodLabel(undefined), null);
});

test('formatDate: valor ausente/inválido vira string vazia -- nunca "Invalid Date" nem uma data inventada', () => {
  assert.equal(formatDate(null), '');
  assert.equal(formatDate(undefined), '');
  assert.equal(formatDate(''), '');
});

test('formatDate: formata no padrão brasileiro dd/mm/aaaa', () => {
  assert.equal(formatDate('2026-08-30T12:58:41.581+00:00'), '30/08/2026');
});
