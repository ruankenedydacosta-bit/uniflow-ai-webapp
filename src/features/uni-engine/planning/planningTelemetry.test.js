import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlanningTelemetry, emitPlanningTelemetry } from './planningTelemetry.js';
import { PLANNING_TELEMETRY_ALLOWED_FIELDS, redactPlanningTelemetry } from './redactPlanningTelemetry.js';

function planning() {
  return {
    goalType: 'SAVINGS',
    status: 'READY',
    complexity: 'LOW',
    confidence: 0.9,
    risk: 'NONE',
    dependencies: [{ required: true, satisfied: true }],
    suggestedSteps: [{ id: 'step-1' }],
    diagnostics: ['PLAN_READY'],
    recommendations: ['CONFIRM_PLAN'],
    shadow: { shadowMode: true },
    latency: { totalMs: 1.234 },
  };
}

test('telemetria contém apenas allowlist', () => {
  const result = redactPlanningTelemetry({ goalType: 'SAVINGS', message: 'segredo', amount: 1000 });
  assert.deepEqual(Object.keys(result), ['goalType']);
});

for (const forbidden of ['message', 'text', 'amount', 'value', 'user', 'workspace', 'account', 'balance', 'category']) {
  test(`telemetria nunca expõe ${forbidden}`, () => {
    const result = buildPlanningTelemetry({ planning: { ...planning(), [forbidden]: 'sensitive' } });
    assert.equal(Object.hasOwn(result, forbidden), false);
  });
}

test('telemetria produz contagens agregadas', () => {
  const result = buildPlanningTelemetry({ planning: planning() });
  assert.equal(result.stepsCount, 1);
  assert.equal(result.dependenciesCount, 1);
});

test('telemetria respeita allowlist completa', () => {
  const result = buildPlanningTelemetry({ planning: planning() });
  assert.ok(Object.keys(result).every((key) => PLANNING_TELEMETRY_ALLOWED_FIELDS.includes(key)));
});

test('adapter recebe entrada redigida', () => {
  const received = [];
  emitPlanningTelemetry({ goalType: 'SAVINGS', message: 'segredo' }, (entry) => received.push(entry));
  assert.deepEqual(received, [{ goalType: 'SAVINGS' }]);
});

test('erro de adapter não quebra', () => {
  assert.doesNotThrow(() => emitPlanningTelemetry({ goalType: 'SAVINGS' }, () => { throw new Error('offline'); }));
});
