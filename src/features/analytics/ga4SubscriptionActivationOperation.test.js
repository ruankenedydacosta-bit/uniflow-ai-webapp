import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearPendingGa4SubscriptionActivation,
  persistPendingGa4SubscriptionActivation,
  readGa4SubscriptionActivationState,
  trackConfirmedGa4SubscriptionActivation,
} from './ga4SubscriptionActivationOperation.js';

function createStorage({ fail = false } = {}) {
  const values = new Map();
  return {
    setItem(key, value) { if (fail) throw new Error('storage'); values.set(key, value); },
    getItem(key) { if (fail) throw new Error('storage'); return values.get(key) ?? null; },
    removeItem(key) { if (fail) throw new Error('storage'); values.delete(key); },
    dump: () => [...values.entries()],
  };
}

test('checkout de cartão pendente permite ativação inicial no retorno e consome uma única vez', () => {
  const storage = createStorage();
  const events = [];
  assert.equal(persistPendingGa4SubscriptionActivation(storage), true);
  assert.equal(readGa4SubscriptionActivationState(storage), 'pending');

  const first = trackConfirmedGa4SubscriptionActivation({
    currentStatus: 'active',
    storage,
    trackActivated: () => { events.push('subscription_activated'); return { sent: true, reason: 'sent' }; },
  });
  const duplicate = trackConfirmedGa4SubscriptionActivation({
    previousStatus: 'pending',
    currentStatus: 'active',
    storage,
    trackActivated: () => { events.push('duplicate'); return { sent: true }; },
  });

  assert.equal(first.sent, true);
  assert.equal(duplicate.reason, 'duplicate');
  assert.deepEqual(events, ['subscription_activated']);
  assert.equal(readGa4SubscriptionActivationState(storage), 'consumed');
});

test('sem marcador, active inicial não emite; pending -> active presenciado emite e cria tombstone', () => {
  const storage = createStorage();
  const events = [];

  assert.equal(trackConfirmedGa4SubscriptionActivation({
    currentStatus: 'active',
    storage,
    trackActivated: () => events.push('false_positive'),
  }).reason, 'missing_transition');

  const transition = trackConfirmedGa4SubscriptionActivation({
    previousStatus: 'pending',
    currentStatus: 'active',
    storage,
    trackActivated: () => { events.push('subscription_activated'); return { sent: true }; },
  });

  assert.equal(transition.sent, true);
  assert.deepEqual(events, ['subscription_activated']);
  assert.equal(readGa4SubscriptionActivationState(storage), 'consumed');
});

test('cancelamento remove somente marcador pendente e nunca reabre ativação consumida', () => {
  const pendingStorage = createStorage();
  persistPendingGa4SubscriptionActivation(pendingStorage);
  assert.equal(clearPendingGa4SubscriptionActivation(pendingStorage), true);
  assert.equal(readGa4SubscriptionActivationState(pendingStorage), null);

  const consumedStorage = createStorage();
  persistPendingGa4SubscriptionActivation(consumedStorage);
  trackConfirmedGa4SubscriptionActivation({
    currentStatus: 'active',
    storage: consumedStorage,
    trackActivated: () => ({ sent: true }),
  });
  assert.equal(clearPendingGa4SubscriptionActivation(consumedStorage), false);
  assert.equal(readGa4SubscriptionActivationState(consumedStorage), 'consumed');
});

test('falha de storage é fail-open para transição observada e nunca inventa active inicial', () => {
  const storage = createStorage({ fail: true });
  const events = [];

  assert.equal(persistPendingGa4SubscriptionActivation(storage), false);
  assert.equal(trackConfirmedGa4SubscriptionActivation({
    currentStatus: 'active',
    storage,
    trackActivated: () => events.push('false_positive'),
  }).reason, 'missing_transition');
  assert.doesNotThrow(() => trackConfirmedGa4SubscriptionActivation({
    previousStatus: 'pending',
    currentStatus: 'active',
    storage,
    trackActivated: () => { events.push('subscription_activated'); return { sent: true }; },
  }));
  assert.deepEqual(events, ['subscription_activated']);
});

test('marcador persistido não contém IDs nem dados pessoais ou financeiros', () => {
  const storage = createStorage();
  persistPendingGa4SubscriptionActivation(storage);
  const serialized = JSON.stringify(storage.dump());
  assert.doesNotMatch(serialized, /user|workspace|checkout|payment|cpf|email|value|amount|uuid/i);
  assert.match(serialized, /pending/);
});
