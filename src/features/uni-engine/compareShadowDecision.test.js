// Testes do comparador em Shadow Mode (Fase 1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareShadowDecision } from './compareShadowDecision.js';

function engineFor(overrides = {}) {
  return {
    classification: {
      messageType: 'action',
      primaryIntent: 'register_expense',
      confidence: 0.95,
      ...(overrides.classification ?? {}),
    },
    plan: {
      decision: 'ask',
      missingFields: ['account'],
      ...(overrides.plan ?? {}),
    },
    diagnostics: {},
    ...(overrides.engine ?? {}),
  };
}

function pipelineFor(overrides = {}) {
  return {
    detectedIntent: 'register_expense',
    pendingIntent: null,
    pendingActive: false,
    resultType: 'unknown',
    ...overrides,
  };
}

test('comparação 52: pendência ativa no pipeline + ação nova explícita no motor', () => {
  const result = compareShadowDecision(
    engineFor({
      classification: { messageType: 'action', primaryIntent: 'register_income', confidence: 0.9 },
    }),
    pipelineFor({
      detectedIntent: 'question',
      pendingIntent: 'register_expense',
      pendingActive: true,
      resultType: 'needs_clarification',
    }),
  );
  assert.equal(result.status, 'pending_context_divergence');
  assert.equal(result.severity, 'high');
  assert.deepEqual(result.reasons, ['engine_new_explicit_action', 'pipeline_treats_as_pending_reply']);
});

test('comparação 53: motor vê ação enquanto pipeline vê consulta', () => {
  const result = compareShadowDecision(
    engineFor(),
    pipelineFor({ detectedIntent: 'check_balance', resultType: 'ready' }),
  );
  assert.equal(result.status, 'action_query_divergence');
  assert.equal(result.severity, 'high');
  assert.equal(result.engineIntent, 'register_expense');
  assert.equal(result.pipelineIntent, 'check_balance');
});

test('comparação: concordância quando intenções e tipos alinham', () => {
  const result = compareShadowDecision(
    engineFor({
      classification: { messageType: 'query', primaryIntent: 'check_balance', confidence: 0.9 },
      plan: { decision: 'respond', missingFields: [] },
    }),
    pipelineFor({ detectedIntent: 'check_balance', resultType: 'ready' }),
  );
  assert.equal(result.status, 'agreement');
  assert.equal(result.severity, 'low');
  assert.ok(result.reasons.includes('same_intent'));
});

test('comparação: motor sem classificação reporta engine_unknown', () => {
  const result = compareShadowDecision({}, pipelineFor());
  assert.equal(result.status, 'engine_unknown');
  assert.deepEqual(result.reasons, ['engine_no_classification']);
});

test('comparação: divergência de intenção entre duas ações', () => {
  const result = compareShadowDecision(
    engineFor({
      classification: { messageType: 'action', primaryIntent: 'register_income', confidence: 0.9 },
    }),
    pipelineFor({ detectedIntent: 'register_expense', resultType: 'unknown' }),
  );
  assert.equal(result.status, 'intent_divergence');
  assert.equal(result.severity, 'high');
});

test('comparação: campo ausente no motor enquanto pipeline segue pronto', () => {
  const result = compareShadowDecision(
    engineFor({
      classification: { messageType: 'action', primaryIntent: 'register_expense', confidence: 0.9 },
      plan: { decision: 'ask', missingFields: ['account'] },
    }),
    pipelineFor({ detectedIntent: 'register_expense', resultType: 'ready' }),
  );
  assert.equal(result.status, 'missing_field_divergence');
  assert.equal(result.severity, 'medium');
});

test('comparação: lacuna de confiança quando intenções concordam mas confiança é baixa', () => {
  const result = compareShadowDecision(
    engineFor({
      classification: { messageType: 'action', primaryIntent: 'register_expense', confidence: 0.4 },
      plan: { decision: 'confirm', missingFields: [] },
    }),
    pipelineFor({ detectedIntent: 'register_expense', resultType: 'unknown' }),
  );
  assert.equal(result.status, 'confidence_gap');
  assert.equal(result.severity, 'low');
});
