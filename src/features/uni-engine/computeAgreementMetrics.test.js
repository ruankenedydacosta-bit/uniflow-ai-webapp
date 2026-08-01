// Testes das métricas de concordância (Fase 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAgreementMetrics } from './computeAgreementMetrics.js';

function baseOptions(overrides = {}) {
  return {
    comparison: { status: 'agreement', engineIntent: 'register_expense', pipelineIntent: 'register_expense' },
    classification: { messageType: 'action', primaryIntent: 'register_expense', ambiguity: false, ambiguities: [] },
    plan: { decision: 'confirm', missingFields: [], ambiguities: [] },
    referenceResolution: { resolved: false },
    cognitiveContext: { subjectChanged: false },
    pipeline: { detectedIntent: 'register_expense', resultType: 'ready' },
    divergences: [],
    latencyMs: 3.1415,
    ...overrides,
  };
}

test('métricas 130: concordância pura com todas as bandeiras zeradas', () => {
  const metrics = computeAgreementMetrics(baseOptions());
  assert.equal(metrics.agreement, true);
  assert.equal(metrics.comparisonStatus, 'agreement');
  assert.equal(metrics.falsePositive, false);
  assert.equal(metrics.falseNegative, false);
  assert.equal(metrics.contextRecovered, false);
  assert.equal(metrics.ambiguityDetected, false);
  assert.equal(metrics.implicitReferenceResolved, false);
  assert.equal(metrics.contextSwitch, false);
  assert.equal(metrics.divergenceCount, 0);
  assert.equal(metrics.latencyMs, 3.14);
});

test('métricas 131: falso positivo — engine divergiu mas pipeline entregou ready', () => {
  const metrics = computeAgreementMetrics(baseOptions({
    comparison: { status: 'missing_field_divergence', engineIntent: 'register_expense', pipelineIntent: 'register_expense' },
    plan: { decision: 'ask', missingFields: ['account'] },
  }));
  assert.equal(metrics.agreement, false);
  assert.equal(metrics.falsePositive, true);
});

test('métricas 132: sem falso positivo quando intenções divergem', () => {
  const metrics = computeAgreementMetrics(baseOptions({
    comparison: { status: 'intent_divergence', engineIntent: 'register_income', pipelineIntent: 'register_expense' },
    classification: { messageType: 'action', primaryIntent: 'register_income', ambiguity: false, ambiguities: [] },
    pipeline: { detectedIntent: 'register_expense', resultType: 'ready' },
  }));
  assert.equal(metrics.falsePositive, false);
});

test('métricas 133: falso negativo — engine concordou mas pipeline precisou de esclarecimento', () => {
  const metrics = computeAgreementMetrics(baseOptions({
    pipeline: { detectedIntent: 'register_expense', resultType: 'needs_clarification' },
  }));
  assert.equal(metrics.agreement, true);
  assert.equal(metrics.falseNegative, true);
});

test('métricas 134: sem falso negativo quando o engine também perguntou', () => {
  const metrics = computeAgreementMetrics(baseOptions({
    plan: { decision: 'ask', missingFields: ['account'] },
    pipeline: { detectedIntent: 'register_expense', resultType: 'needs_clarification' },
  }));
  assert.equal(metrics.falseNegative, false);
});

test('métricas 135: contexto recuperado e referência resolvida', () => {
  const metrics = computeAgreementMetrics(baseOptions({
    referenceResolution: {
      resolved: true,
      source: 'operational_memory',
      referenceType: 'account',
    },
  }));
  assert.equal(metrics.contextRecovered, true);
  assert.equal(metrics.implicitReferenceResolved, true);
});

test('métricas 136: ambiguidade detectada via classificador ou plano', () => {
  const viaClassifier = computeAgreementMetrics(baseOptions({
    classification: { messageType: 'action', primaryIntent: 'ambiguous_balance_or_income', ambiguity: true, ambiguities: ['balance_or_income'] },
  }));
  assert.equal(viaClassifier.ambiguityDetected, true);

  const viaPlan = computeAgreementMetrics(baseOptions({
    plan: { decision: 'confirm', missingFields: [], ambiguities: [{ type: 'account' }] },
  }));
  assert.equal(viaPlan.ambiguityDetected, true);
});

test('métricas 137: mudança de assunto refletida no contexto', () => {
  const metrics = computeAgreementMetrics(baseOptions({
    cognitiveContext: { subjectChanged: true, currentSubject: 'register_expense:Mercado' },
  }));
  assert.equal(metrics.contextSwitch, true);
});

test('métricas 138: contagem de divergências e latência são registradas', () => {
  const metrics = computeAgreementMetrics(baseOptions({
    divergences: [{ type: 'intent_divergence' }, { type: 'confidence_gap' }],
  }));
  assert.equal(metrics.divergenceCount, 2);
  assert.equal(typeof metrics.latencyMs, 'number');
});

test('métricas: saída sempre serializável', () => {
  const metrics = computeAgreementMetrics(baseOptions());
  assert.doesNotThrow(() => JSON.stringify(metrics));
});
