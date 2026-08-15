import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildGa4ProductEvent,
  GA4_PRODUCT_EVENT_NAMES,
  resolveGa4PaymentType,
  resolveGa4ScheduleKind,
  resolveGa4TransactionDirection,
} from './ga4ProductContracts.js';

const VALID_EVENTS = Object.freeze([
  ['login', { method: 'password' }],
  ['sign_up', { method: 'password' }],
  ['sign_up_viewed', {}],
  ['voice_started', { interaction_mode: 'voice_button' }],
  ['voice_completed', { result: 'success', interaction_mode: 'voice_button' }],
  ['transaction_created', { direction: 'entry', origin: 'manual' }],
  ['calendar_event_created', { origin: 'voice', schedule_kind: 'all_day' }],
  ['begin_checkout', {}],
  ['payment_method_selected', { payment_type: 'pix' }],
]);

test('contrato fechado aceita somente os nove eventos e parâmetros categóricos previstos', () => {
  for (const [eventName, params] of VALID_EVENTS) {
    assert.deepEqual(buildGa4ProductEvent(eventName, params), { eventName, params });
  }
  assert.deepEqual(Object.values(GA4_PRODUCT_EVENT_NAMES), VALID_EVENTS.map(([name]) => name));
});

test('evento desconhecido e valor categórico inválido são rejeitados', () => {
  assert.equal(buildGa4ProductEvent('purchase', { value: 50 }), null);
  assert.equal(buildGa4ProductEvent('login', { method: 'email-da-pessoa' }), null);
  assert.equal(buildGa4ProductEvent('sign_up', { method: 'google' }), null);
  assert.equal(buildGa4ProductEvent('payment_method_selected', { payment_type: 'credit_card' }), null);
  assert.equal(buildGa4ProductEvent('transaction_created', {
    direction: 'transfer',
    origin: 'manual',
  }), null);
});

test('parâmetros extras e PII sintética são descartados antes da emissão', () => {
  const event = buildGa4ProductEvent('transaction_created', {
    direction: 'exit',
    origin: 'voice',
    value: 75,
    currency: 'BRL',
    description: 'gasolina',
    email: 'pessoa@example.com',
    user_id: '11111111-1111-4111-8111-111111111111',
    transcript: 'gastei setenta e cinco reais',
  });

  assert.deepEqual(event, {
    eventName: 'transaction_created',
    params: { direction: 'exit', origin: 'voice' },
  });
  assert.doesNotMatch(JSON.stringify(event), /75|BRL|gasolina|pessoa|11111111|transcript/);
});

test('mapeamentos de domínio aceitam somente semânticas reais do produto', () => {
  assert.equal(resolveGa4TransactionDirection('income'), 'entry');
  assert.equal(resolveGa4TransactionDirection('expense'), 'exit');
  assert.equal(resolveGa4TransactionDirection('transfer'), null);
  assert.equal(resolveGa4TransactionDirection('adjustment'), null);
  assert.equal(resolveGa4ScheduleKind({ is_all_day: true }), 'all_day');
  assert.equal(resolveGa4ScheduleKind({ has_explicit_time: false }), 'all_day');
  assert.equal(resolveGa4ScheduleKind({ is_all_day: false, has_explicit_time: true }), 'timed');
  assert.equal(resolveGa4PaymentType('pix'), 'pix');
  assert.equal(resolveGa4PaymentType('credit_card'), 'card');
  assert.equal(resolveGa4PaymentType('pix_automatico'), null);
});

test('eventos comerciais sem parâmetros descartam PII e método aceita somente pix ou card', () => {
  assert.deepEqual(buildGa4ProductEvent('sign_up_viewed', {
    email: 'pessoa@example.com',
  }), { eventName: 'sign_up_viewed', params: {} });
  assert.deepEqual(buildGa4ProductEvent('begin_checkout', {
    value: 29.9,
    currency: 'BRL',
    plan_id: 'pro',
  }), { eventName: 'begin_checkout', params: {} });
  assert.deepEqual(buildGa4ProductEvent('payment_method_selected', {
    payment_type: 'card',
    cpf_cnpj: '00000000000',
    checkout_id: 'checkout-private',
  }), {
    eventName: 'payment_method_selected',
    params: { payment_type: 'card' },
  });
});
