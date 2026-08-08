import test from 'node:test';
import assert from 'node:assert/strict';
import { RUNTIME_SAFETY_KEYS } from '../types/index.js';
import { validateFinancialRuntimeSafety } from './evaluateFinancialEligibility.js';

function safeRuntime(overrides = {}) {
  return {
    shadowMode: true,
    executionAllowed: false,
    influenceApplied: false,
    executed: false,
    persisted: false,
    discarded: true,
    legacyPreserved: true,
    safety: Object.fromEntries(RUNTIME_SAFETY_KEYS.map((key) => [key, false])),
    ...overrides,
  };
}

test('Gate 0 aprova safety somente quando todas as invariantes shadow foram verificadas', () => {
  const result = validateFinancialRuntimeSafety(safeRuntime());
  assert.equal(result.approved, true);
  assert.deepEqual(result.reasonCodes, []);
  assert.ok(Object.isFrozen(result));
});

test('Gate 0 falha fechado sem snapshot real de safety', () => {
  const result = validateFinancialRuntimeSafety(safeRuntime({ safety: null }));
  assert.equal(result.approved, false);
  assert.ok(result.reasonCodes.includes('SAFETY_SNAPSHOT_MISSING'));
});

test('Gate 0 bloqueia executionAllowed e qualquer efeito financeiro', () => {
  const execution = validateFinancialRuntimeSafety(safeRuntime({ executionAllowed: true }));
  const mutation = validateFinancialRuntimeSafety(safeRuntime({
    safety: { ...safeRuntime().safety, financialMutation: true },
  }));
  assert.equal(execution.approved, false);
  assert.ok(execution.reasonCodes.includes('EXECUTION_NOT_BLOCKED'));
  assert.equal(mutation.approved, false);
  assert.ok(mutation.reasonCodes.includes('SAFETY_FINANCIALMUTATION_NOT_BLOCKED'));
});

test('Gate 0 bloqueia runtime fora de Shadow Mode ou capaz de influenciar a resposta', () => {
  const result = validateFinancialRuntimeSafety(safeRuntime({
    shadowMode: false,
    influenceApplied: true,
    discarded: false,
  }));
  assert.equal(result.approved, false);
  assert.ok(result.reasonCodes.includes('SHADOW_MODE_REQUIRED'));
  assert.ok(result.reasonCodes.includes('INFLUENCE_NOT_BLOCKED'));
  assert.ok(result.reasonCodes.includes('RESULT_NOT_DISCARDED'));
});
