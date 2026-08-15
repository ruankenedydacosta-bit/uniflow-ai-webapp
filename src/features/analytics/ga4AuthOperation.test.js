import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearPendingGa4GoogleAuth,
  persistPendingGa4GoogleAuth,
  readPendingGa4GoogleAuth,
  trackConfirmedGa4GoogleAuth,
} from './ga4AuthOperation.js';

function createStorage({ fail = false } = {}) {
  const values = new Map();
  return {
    setItem(key, value) { if (fail) throw new Error('storage'); values.set(key, value); },
    getItem(key) { if (fail) throw new Error('storage'); return values.get(key) ?? null; },
    removeItem(key) { if (fail) throw new Error('storage'); values.delete(key); },
    dump: () => [...values.entries()],
  };
}

test('operação OAuth persiste somente o evento categórico e confirma login uma vez', () => {
  const storage = createStorage();
  const calls = [];
  assert.equal(persistPendingGa4GoogleAuth('login', storage), true);
  assert.equal(readPendingGa4GoogleAuth(storage), 'login');
  assert.deepEqual(storage.dump().map(([, value]) => value), ['login']);

  trackConfirmedGa4GoogleAuth({
    storage,
    trackLogin: (method) => calls.push(['login', method]),
  });
  trackConfirmedGa4GoogleAuth({ storage, trackLogin: () => calls.push(['duplicate']) });

  assert.deepEqual(calls, [['login', 'google']]);
  assert.equal(readPendingGa4GoogleAuth(storage), null);
});

test('superfície de cadastro Google nunca cria sign_up sem prova de conta nova', () => {
  const storage = createStorage();
  const calls = [];
  assert.equal(persistPendingGa4GoogleAuth('sign_up', storage), false);
  trackConfirmedGa4GoogleAuth({
    storage,
    trackLogin: (method) => calls.push(['login', method]),
  });
  assert.deepEqual(calls, []);
  assert.doesNotMatch(JSON.stringify(storage.dump()), /email|user|workspace|uuid/i);
});

test('falha ou indisponibilidade de storage nunca bloqueia autenticação', () => {
  const storage = createStorage({ fail: true });
  assert.doesNotThrow(() => persistPendingGa4GoogleAuth('login', storage));
  assert.equal(persistPendingGa4GoogleAuth('login', storage), false);
  assert.equal(readPendingGa4GoogleAuth(storage), null);
  assert.equal(clearPendingGa4GoogleAuth(storage), false);
  assert.doesNotThrow(() => trackConfirmedGa4GoogleAuth({ storage }));
});

test('evento OAuth inválido não é persistido', () => {
  const storage = createStorage();
  assert.equal(persistPendingGa4GoogleAuth('purchase', storage), false);
  assert.deepEqual(storage.dump(), []);
});
