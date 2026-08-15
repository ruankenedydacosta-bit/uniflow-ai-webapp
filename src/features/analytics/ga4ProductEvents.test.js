import assert from 'node:assert/strict';
import test from 'node:test';
import { createGa4Client } from './ga4Client.js';
import {
  createGa4ProductEventGateway,
  createGa4CheckoutEventLifecycle,
  createGa4SignUpViewedLifecycle,
  createGa4VoiceEventLifecycle,
  trackGa4ConfirmedCalendarCreation,
  trackGa4ConfirmedTransactionCreation,
} from './ga4ProductEvents.js';

const ENABLED_ENV = Object.freeze({
  VITE_GA4_ENABLED: 'true',
  VITE_GA4_MEASUREMENT_ID: 'G-TEST123',
});

function createRuntime() {
  const scripts = [];
  const elements = new Map();
  const runtime = {
    location: new URL('https://app.invalid/app/home'),
    document: {
      createElement: () => ({}),
      getElementById: (id) => elements.get(id) ?? null,
      head: {
        appendChild(script) {
          scripts.push(script);
          if (script.id) elements.set(script.id, script);
        },
      },
    },
  };
  return { runtime, scripts };
}

function eventCommands(runtime, eventName) {
  return (runtime.dataLayer ?? [])
    .map((entry) => Array.from(entry))
    .filter((entry) => entry[0] === 'event' && entry[1] === eventName);
}

test('gateway envia evento permitido já sanitizado e falha aberto', () => {
  const emitted = [];
  const gateway = createGa4ProductEventGateway({
    emit: (eventName, params) => {
      emitted.push({ eventName, params });
      return { sent: true, reason: 'sent' };
    },
  });

  assert.equal(gateway.track('login', { method: 'password', email: 'pessoa@example.com' }).sent, true);
  assert.deepEqual(emitted, [{ eventName: 'login', params: { method: 'password' } }]);
  assert.equal(gateway.track('unknown', {}).reason, 'invalid');

  const failing = createGa4ProductEventGateway({ emit: () => { throw new Error('private'); } });
  assert.doesNotThrow(() => failing.track('login', { method: 'password' }));
  assert.equal(failing.track('login', { method: 'password' }).reason, 'failed');
});

test('consentimento unknown/denied e env desligado descartam sem fila retroativa', () => {
  const { runtime } = createRuntime();
  const client = createGa4Client({ runtime });
  client.initialize(ENABLED_ENV);

  assert.equal(client.trackProductEvent('login', { method: 'password' }).reason, 'blocked');
  assert.equal(eventCommands(runtime, 'login').length, 0);

  client.denyConsent();
  assert.equal(client.trackProductEvent('login', { method: 'password' }).reason, 'blocked');
  client.grantConsent();
  assert.equal(eventCommands(runtime, 'login').length, 0);
  assert.equal(client.trackProductEvent('login', { method: 'password' }).sent, true);
  assert.equal(eventCommands(runtime, 'login').length, 1);

  client.denyConsent();
  assert.equal(client.trackProductEvent('sign_up', { method: 'google' }).reason, 'blocked');
  assert.equal(eventCommands(runtime, 'sign_up').length, 0);

  const disabledRuntime = createRuntime().runtime;
  const disabledClient = createGa4Client({ runtime: disabledRuntime });
  disabledClient.initialize({ ...ENABLED_ENV, VITE_GA4_ENABLED: 'false' });
  disabledClient.grantConsent();
  assert.equal(disabledClient.trackProductEvent('login', { method: 'password' }).reason, 'blocked');
  assert.equal('dataLayer' in disabledRuntime, false);
});

test('cliente revalida contrato e nunca envia parâmetro desconhecido ou valor inválido', () => {
  const { runtime } = createRuntime();
  const client = createGa4Client({ runtime });
  client.initialize(ENABLED_ENV);
  client.grantConsent();

  assert.equal(client.trackProductEvent('voice_completed', {
    result: 'success',
    interaction_mode: 'voice_button',
    transcript: 'conteúdo proibido',
  }).sent, true);
  assert.equal(client.trackProductEvent('voice_completed', {
    result: 'resultado-livre',
    interaction_mode: 'voice_button',
  }).reason, 'invalid');
  assert.deepEqual(eventCommands(runtime, 'voice_completed')[0][2], {
    result: 'success',
    interaction_mode: 'voice_button',
    page_location: 'https://app.invalid/app/home',
  });
});

test('lifecycle de voz deduplica start e terminal da mesma interação', () => {
  const started = [];
  const completed = [];
  const lifecycle = createGa4VoiceEventLifecycle({
    trackStarted: (mode) => { started.push(mode); return { sent: true }; },
    trackCompleted: (event) => { completed.push(event); return { sent: true }; },
  });

  lifecycle.begin(1);
  lifecycle.markStarted(1);
  lifecycle.markStarted(1);
  lifecycle.complete(1, 'success');
  lifecycle.complete(1, 'error');

  assert.deepEqual(started, ['voice_button']);
  assert.deepEqual(completed, [{ result: 'success', interactionMode: 'voice_button' }]);

  lifecycle.begin(2);
  lifecycle.complete(2, 'cancelled');
  assert.equal(completed.length, 1);
  lifecycle.markStarted(2);
  lifecycle.completeCurrent('cancelled');
  assert.equal(completed.length, 2);
});

test('criação financeira emite uma vez no sucesso novo e ignora falha/replay', () => {
  const events = [];
  const track = (event) => { events.push(event); return { sent: true }; };

  trackGa4ConfirmedTransactionCreation({
    confirmed: false,
    transactionType: 'income',
    origin: 'manual',
  }, track);
  trackGa4ConfirmedTransactionCreation({
    confirmed: true,
    idempotentReplay: true,
    transactionType: 'expense',
    origin: 'voice',
  }, track);
  trackGa4ConfirmedTransactionCreation({
    confirmed: true,
    transactionType: 'expense',
    origin: 'voice',
  }, track);

  assert.deepEqual(events, [{ direction: 'exit', origin: 'voice' }]);
});

test('criação de Agenda emite uma vez no sucesso novo com semântica all_day/timed', () => {
  const events = [];
  const track = (event) => { events.push(event); return { sent: true }; };

  trackGa4ConfirmedCalendarCreation({
    confirmed: true,
    idempotentReplay: true,
    isAllDay: false,
    hasExplicitTime: true,
    origin: 'manual',
  }, track);
  trackGa4ConfirmedCalendarCreation({
    confirmed: true,
    isAllDay: true,
    hasExplicitTime: false,
    origin: 'manual',
  }, track);
  trackGa4ConfirmedCalendarCreation({
    confirmed: true,
    isAllDay: false,
    hasExplicitTime: true,
    origin: 'voice',
  }, track);

  assert.deepEqual(events, [
    { origin: 'manual', scheduleKind: 'all_day' },
    { origin: 'voice', scheduleKind: 'timed' },
  ]);
});

test('visibilidade de cadastro emite uma vez por entrada real no modo signup', () => {
  const events = [];
  const lifecycle = createGa4SignUpViewedLifecycle({
    trackViewed: () => { events.push('sign_up_viewed'); return { sent: true }; },
  });

  lifecycle.update(false);
  lifecycle.update(true);
  lifecycle.update(true);
  lifecycle.update(true);
  assert.deepEqual(events, ['sign_up_viewed']);

  lifecycle.update(false);
  lifecycle.update(true);
  assert.deepEqual(events, ['sign_up_viewed', 'sign_up_viewed']);
});

test('checkout mede entrada e método somente na confirmação, com deduplicação', () => {
  const events = [];
  const lifecycle = createGa4CheckoutEventLifecycle({
    trackBegin: () => { events.push({ name: 'begin_checkout' }); return { sent: true }; },
    trackPaymentMethod: (paymentType) => {
      events.push({ name: 'payment_method_selected', payment_type: paymentType });
      return { sent: true };
    },
  });

  lifecycle.begin();
  lifecycle.begin();
  assert.deepEqual(events, [{ name: 'begin_checkout' }]);

  lifecycle.confirmPaymentMethod('credit_card');
  lifecycle.confirmPaymentMethod('pix');
  assert.deepEqual(events, [
    { name: 'begin_checkout' },
    { name: 'payment_method_selected', payment_type: 'card' },
  ]);

  lifecycle.close();
  lifecycle.begin();
  lifecycle.confirmPaymentMethod('pix');
  assert.deepEqual(events.slice(-2), [
    { name: 'begin_checkout' },
    { name: 'payment_method_selected', payment_type: 'pix' },
  ]);
});

test('método inválido e confirmação fora do checkout não emitem', () => {
  const methods = [];
  const lifecycle = createGa4CheckoutEventLifecycle({
    trackBegin: () => ({ sent: true }),
    trackPaymentMethod: (paymentType) => { methods.push(paymentType); return { sent: true }; },
  });

  lifecycle.confirmPaymentMethod('pix');
  lifecycle.begin();
  lifecycle.confirmPaymentMethod('pix_automatico');
  lifecycle.confirmPaymentMethod('pix');
  assert.deepEqual(methods, ['pix']);
});
