// Testes da política central da Camada de Decisão (Fase 5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DECISION_POLICY,
  clamp01,
  describeConfidence,
  whenAnswerPolicy,
  whenAskPolicy,
  whenRejectPolicy,
  whenWaitPolicy,
  whenConfirmPolicy,
} from './decisionPolicy.js';

test('política 1: todos os números vivem em DECISION_POLICY', () => {
  assert.ok(DECISION_POLICY.bands.veryHighMin === 0.9);
  assert.ok(DECISION_POLICY.thresholds.answerMinConfidence === 0.7);
  assert.ok(DECISION_POLICY.confidence.base === 0.4);
  assert.ok(DECISION_POLICY.limits.maxDiagnostics > 0);
  assert.ok(DECISION_POLICY.risk.criticalIntents.includes('set_balance'));
});

test('política 2: clamp01 limita qualquer número a [0,1]', () => {
  assert.equal(clamp01(-5), 0);
  assert.equal(clamp01(0.5), 0.5);
  assert.equal(clamp01(7), 1);
  assert.equal(clamp01(Number.NaN), 0);
});

test('política 3: describeConfidence — faixas muito baixa/baixa/média/alta/muito alta', () => {
  assert.equal(describeConfidence(0.05), 'very_low');
  assert.equal(describeConfidence(0.3), 'low');
  assert.equal(describeConfidence(0.5), 'medium');
  assert.equal(describeConfidence(0.75), 'high');
  assert.equal(describeConfidence(0.95), 'very_high');
});

test('política 4: whenAnswer — contexto suficiente + confiança alta + risco baixo', () => {
  assert.equal(whenAnswerPolicy({
    context: { sufficiency: 'SUFFICIENT' },
    confidence: 0.85,
    risk: { level: 'LOW' },
  }), true);
  assert.equal(whenAnswerPolicy({
    context: { sufficiency: 'PARTIAL' },
    confidence: 0.85,
    risk: { level: 'LOW' },
  }), false);
  assert.equal(whenAnswerPolicy({
    context: { sufficiency: 'SUFFICIENT' },
    confidence: 0.5,
    risk: { level: 'LOW' },
  }), false);
});

test('política 5: whenAnswer — pendência pronta impede responder direto', () => {
  assert.equal(whenAnswerPolicy({
    context: { sufficiency: 'SUFFICIENT' },
    confidence: 0.9,
    risk: { level: 'LOW' },
    pending: { status: 'ready' },
  }), false);
});

test('política 6: whenAsk — campos faltantes com confiança baixa', () => {
  assert.equal(whenAskPolicy({
    context: { sufficiency: 'PARTIAL' },
    confidence: 0.4,
    missingFields: ['account'],
  }), true);
  assert.equal(whenAskPolicy({
    context: { sufficiency: 'SUFFICIENT' },
    confidence: 0.8,
    missingFields: [],
  }), false);
});

test('política 7: whenAsk — pendência em clarificação força perguntar', () => {
  assert.equal(whenAskPolicy({
    context: { sufficiency: 'INSUFFICIENT' },
    confidence: 0.5,
    missingFields: [],
    pending: { status: 'needs_clarification' },
  }), true);
});

test('política 8: whenReject — risco crítico ou bloqueio de segurança', () => {
  assert.equal(whenRejectPolicy({ safetyBlocked: true }), true);
  assert.equal(whenRejectPolicy({ risk: { level: 'CRITICAL' } }), true);
  assert.equal(whenRejectPolicy({ risk: { level: 'HIGH' }, confidence: 0.3 }), true);
  assert.equal(whenRejectPolicy({ risk: { level: 'HIGH' }, confidence: 0.85 }), false);
  assert.equal(whenRejectPolicy({ risk: { level: 'LOW' } }), false);
});

test('política 9: whenWait — pipeline executando ou conversa trocada', () => {
  assert.equal(whenWaitPolicy({ pending: { status: 'executing' } }), true);
  assert.equal(whenWaitPolicy({ conversationSwitched: true }), true);
  assert.equal(whenWaitPolicy({}), false);
});

test('política 10: whenConfirm — pendência pronta com confiança intermediária', () => {
  assert.equal(whenConfirmPolicy({
    confidence: 0.6,
    risk: { level: 'MEDIUM' },
    pending: { status: 'ready' },
  }), true);
  assert.equal(whenConfirmPolicy({
    confidence: 0.9,
    risk: { level: 'LOW' },
    pending: { status: 'ready' },
  }), true, 'confiança alta não pode escapar da confirmação pendente');
  assert.equal(whenConfirmPolicy({
    confidence: 0.3,
    risk: { level: 'LOW' },
    pending: { status: 'ready' },
  }), false);
});

test('política 10b: whenConfirm — sem pendência pronta nunca confirma', () => {
  assert.equal(whenConfirmPolicy({
    confidence: 0.6,
    risk: { level: 'LOW' },
    pending: null,
  }), false);
});

test('política 11: críticos incluem todas as ações financeiras', () => {
  for (const intent of ['register_income', 'register_expense', 'register_transfer', 'set_balance', 'create_goal']) {
    assert.ok(DECISION_POLICY.risk.criticalIntents.includes(intent));
  }
  assert.ok(!DECISION_POLICY.risk.criticalIntents.includes('small_talk'));
});

test('política 12: executor é obrigatório para ações e consultas de saldo', () => {
  for (const intent of ['register_income', 'register_expense', 'register_transfer', 'set_balance', 'create_goal', 'check_balance']) {
    assert.ok(DECISION_POLICY.risk.executorRequiredIntents.includes(intent));
  }
});

test('política 13: janelas de recência são determinísticas', () => {
  assert.ok(DECISION_POLICY.recency.snapshotFreshMs > 0);
  assert.ok(DECISION_POLICY.recency.memoryFreshMs > DECISION_POLICY.recency.snapshotFreshMs);
});
