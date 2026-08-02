// Testes da Fase 10 — Serialização e integridade das saídas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runUniEngineShadow } from '../runUniEngineShadow.js';
import { isSerializableValue, findFunctionsInValue, projectFinancialSnapshot } from '../uniEngineContracts.js';
import { runEngineHealthCheck } from '../health/buildEngineHealth.js';
import { buildObservabilitySnapshot } from '../observability/buildObservabilitySnapshot.js';
import { phase10CoreConfig, phase10FullConfig, phase10Input, TEST_SNAPSHOT } from './shared.js';

function walkAllValues(root, visit) {
  const seen = new Set();
  const walk = (value, path) => {
    if (value === null || typeof value !== 'object') {
      visit(value, path);
      return;
    }
    if (seen.has(value)) {
      visit(value, path);
      return;
    }
    seen.add(value);
    visit(value, path);
    if (value instanceof Map) {
      for (const [key, entry] of value.entries()) walk(entry, `${path}.Map(${String(key)})`);
    } else if (value instanceof Set) {
      for (const entry of value.values()) walk(entry, `${path}.Set`);
    } else if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(entry, `${path}[${index}]`));
    } else {
      for (const key of Object.keys(value)) walk(value[key], `${path}.${key}`);
    }
  };
  walk(root, '$');
}

test('saída completa do motor é JSON-safe (round-trip exato)', () => {
  const config = phase10FullConfig({ VITE_UNI_ENGINE_MEMORY_ENABLED: 'false' });
  const result = runUniEngineShadow(phase10Input(), { config });
  const roundTrip = JSON.parse(JSON.stringify(result));
  assert.deepEqual(roundTrip, result);
});

test('saída completa não contém funções, Map, Set ou Date', () => {
  const config = phase10FullConfig({ VITE_UNI_ENGINE_MEMORY_ENABLED: 'false' });
  const result = runUniEngineShadow(phase10Input(), { config });
  assert.equal(isSerializableValue(result), true);
  assert.deepEqual(findFunctionsInValue(result), []);
  let badTypes = 0;
  walkAllValues(result, (value) => {
    if (value instanceof Date || value instanceof Map || value instanceof Set) badTypes += 1;
  });
  assert.equal(badTypes, 0);
});

test('health check é serializável em todos os cenários', () => {
  const config = phase10FullConfig({ VITE_UNI_ENGINE_MEMORY_ENABLED: 'false' });
  const result = runUniEngineShadow(phase10Input(), { config });
  const health = runEngineHealthCheck({ config, result });
  assert.equal(isSerializableValue(health), true);
  assert.equal(JSON.parse(JSON.stringify(health)).status, health.status);
});

test('snapshot de observability é serializável', () => {
  const config = phase10FullConfig({ VITE_UNI_ENGINE_MEMORY_ENABLED: 'false' });
  const result = runUniEngineShadow(phase10Input(), { config });
  const snapshot = buildObservabilitySnapshot({ config, result });
  assert.equal(isSerializableValue(snapshot), true);
  assert.equal(JSON.parse(JSON.stringify(snapshot)).health, snapshot.health);
});

test('caminho de erro do motor continua serializável', () => {
  const config = phase10CoreConfig();
  const result = runUniEngineShadow('not-an-object', { config });
  assert.equal(isSerializableValue(result), true);
  assert.deepEqual(findFunctionsInValue(result), []);
});

test('caminho desligado do motor é serializável', () => {
  const config = phase10CoreConfig({ VITE_UNI_ENGINE_ENABLED: 'false' });
  const result = runUniEngineShadow(phase10Input(), { config });
  assert.equal(isSerializableValue(result), true);
  assert.deepEqual(findFunctionsInValue(result), []);
});

test('nenhuma seção contém campos com referências vivas', () => {
  const config = phase10FullConfig({ VITE_UNI_ENGINE_MEMORY_ENABLED: 'false' });
  const result = runUniEngineShadow(phase10Input(), { config });
  for (const section of ['decisionLayer', 'planning', 'goals', 'reflection', 'activation', 'epistemicModel', 'classification', 'epistemicState', 'plan', 'validation', 'shadowComparison', 'cognitiveContext', 'referenceResolution', 'suggestions']) {
    const value = result[section];
    if (value === null || value === undefined) continue;
    assert.equal(isSerializableValue(value), true, `seção ${section}`);
    assert.deepEqual(findFunctionsInValue(value), [], `seção ${section}`);
  }
});

test('latências nunca são negativas e são números', () => {
  const config = phase10FullConfig({ VITE_UNI_ENGINE_MEMORY_ENABLED: 'false' });
  const result = runUniEngineShadow(phase10Input(), { config });
  const latencies = [
    result.diagnostics.latencyMs,
    result.decisionLayer.latencyMs,
    result.planning.latencyMs,
    result.goals.latencyMs,
    result.reflection.latencyMs,
    result.epistemicModel.latencyMs,
    result.activation.decisions[0].latencyMs,
  ];
  for (const latency of latencies) {
    assert.equal(typeof latency, 'number');
    assert.ok(Number.isFinite(latency));
    assert.ok(latency >= 0);
  }
});

test('projectFinancialSnapshot remove Maps e projeta apenas campos seguros', () => {
  const projected = projectFinancialSnapshot({
    hasData: true,
    totalBalance: 100,
    referenceDate: '2026-08-01',
    accounts: [{ id: 'a1', name: 'Nubank', current_balance: 100, secret: 'x' }],
    categories: [{ id: 'c1', name: 'Food' }],
    recentTransactions: [{ id: 't1', description: 'Mercado', amount: 10, transaction_type: 'expense', account_id: 'a1', category_id: 'c1' }],
    accountsById: new Map([['a1', { id: 'a1' }]]),
  });
  assert.equal(projected.hasData, true);
  assert.equal(projected.totalBalance, 100);
  assert.equal(projected.accounts[0].secret, undefined);
  assert.equal(projected.accounts[0].id, 'a1');
  assert.equal(isSerializableValue(projected), true);
});

test('projectFinancialSnapshot com entrada inválida → vazio seguro', () => {
  for (const input of [null, undefined, 'x', 42, {}]) {
    const projected = projectFinancialSnapshot(input);
    assert.equal(projected.hasData, false);
    assert.deepEqual(projected.accounts, []);
    assert.deepEqual(projected.recentTransactions, []);
  }
});

test('engine aceita snapshot do app (com Maps) sem quebrar', () => {
  const input = phase10Input();
  input.context.financialSnapshot = projectFinancialSnapshot(TEST_SNAPSHOT);
  const config = phase10FullConfig({ VITE_UNI_ENGINE_MEMORY_ENABLED: 'false' });
  const result = runUniEngineShadow(input, { config });
  assert.equal(result.enabled, true);
  assert.equal(isSerializableValue(result), true);
});

test('findFunctionsInValue encontra funções em profundidade', () => {
  assert.deepEqual(findFunctionsInValue({ a: { b: () => {} } }), ['a.b']);
  assert.deepEqual(findFunctionsInValue({ a: [() => {}] }), ['a[0]']);
  assert.deepEqual(findFunctionsInValue({ a: 1 }), []);
  assert.deepEqual(findFunctionsInValue(() => {}), ['(root)']);
});

test('isSerializableValue rejeita Map, Set, função e bigint', () => {
  assert.equal(isSerializableValue(new Map()), false);
  assert.equal(isSerializableValue(new Set()), false);
  assert.equal(isSerializableValue(() => {}), false);
  assert.equal(isSerializableValue(10n), false);
  assert.equal(isSerializableValue(Symbol('x')), false);
  assert.equal(isSerializableValue({ a: new Map() }), false);
  assert.equal(isSerializableValue([1, 'a', true, null, { b: 2 }]), true);
});

test('isSerializableValue tolera referências circulares', () => {
  const circular = { a: 1 };
  circular.self = circular;
  assert.equal(isSerializableValue(circular), true);
});

test('strings sensíveis do usuário nunca vazam para health/snapshot', () => {
  const config = phase10FullConfig({ VITE_UNI_ENGINE_MEMORY_ENABLED: 'false' });
  const result = runUniEngineShadow(phase10Input({ message: { text: 'senha-super-secreta-xyz' } }), { config });
  const healthJson = JSON.stringify(runEngineHealthCheck({ config, result }));
  const snapshotJson = JSON.stringify(buildObservabilitySnapshot({ config, result }));
  assert.ok(!healthJson.includes('senha-super-secreta-xyz'));
  assert.ok(!snapshotJson.includes('senha-super-secreta-xyz'));
});
