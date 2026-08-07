// Sprint 4 Ciclo 3 (Bloco 4.6.3) — testes da telemetria DEV do
// orquestrador semântico.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildFinancialOrchestratorTelemetryEntry,
  logFinancialOrchestratorTelemetry,
} from './financialOrchestratorTelemetry.js';

test('entrada de telemetria nunca contém texto do usuário, valores financeiros ou secrets -- só metadados', () => {
  const entry = buildFinancialOrchestratorTelemetryEntry({
    requestId: 'req-1',
    intent: 'total_balance',
    source: 'semantic',
    llmCallCount: 1,
    modesUsed: ['financial_intent'],
    status: 'handled',
  });
  const serialized = JSON.stringify(entry);
  assert.doesNotMatch(serialized, /R\$/);
  assert.doesNotMatch(serialized, /sk-/);
  assert.doesNotMatch(serialized, /Bearer/);
});

test('campos numéricos com entrada inválida nunca quebram -- caem em default seguro', () => {
  const entry = buildFinancialOrchestratorTelemetryEntry({ llmCallCount: 'dois', toolCallCount: null, subIntentCount: undefined });
  assert.equal(entry.llmCallCount, 0);
  assert.equal(entry.toolCallCount, 0);
  assert.equal(entry.subIntentCount, 0);
});

test('entrada é congelada (imutável)', () => {
  const entry = buildFinancialOrchestratorTelemetryEntry({ requestId: 'req-2' });
  assert.equal(Object.isFrozen(entry), true);
  assert.equal(Object.isFrozen(entry.modesUsed), true);
  assert.equal(Object.isFrozen(entry.durationsMs), true);
});

test('logFinancialOrchestratorTelemetry nunca loga fora de DEV (isDev=false)', () => {
  let called = false;
  const originalDebug = console.debug;
  console.debug = () => { called = true; };
  try {
    logFinancialOrchestratorTelemetry(buildFinancialOrchestratorTelemetryEntry({}), { isDev: false });
    assert.equal(called, false);
  } finally {
    console.debug = originalDebug;
  }
});

test('logFinancialOrchestratorTelemetry loga em DEV (isDev=true)', () => {
  let called = false;
  const originalDebug = console.debug;
  console.debug = () => { called = true; };
  try {
    logFinancialOrchestratorTelemetry(buildFinancialOrchestratorTelemetryEntry({ requestId: 'req-3' }), { isDev: true });
    assert.equal(called, true);
  } finally {
    console.debug = originalDebug;
  }
});

test('logFinancialOrchestratorTelemetry nunca lança mesmo se console.debug falhar', () => {
  const originalDebug = console.debug;
  console.debug = () => { throw new Error('boom'); };
  try {
    assert.doesNotThrow(() => logFinancialOrchestratorTelemetry(buildFinancialOrchestratorTelemetryEntry({}), { isDev: true }));
  } finally {
    console.debug = originalDebug;
  }
});

test('logFinancialOrchestratorTelemetry com entrada nula nunca lança', () => {
  assert.doesNotThrow(() => logFinancialOrchestratorTelemetry(null, { isDev: true }));
});
