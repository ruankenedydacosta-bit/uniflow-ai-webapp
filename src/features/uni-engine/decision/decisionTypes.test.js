// Testes dos tipos fechados da Camada de Decisão (Fase 5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DECISION_TYPES,
  DECISION_RISKS,
  DECISION_REASONS,
  DECISION_CONTEXT_SUFFICIENCY,
  DECISION_CONSISTENCY_STATES,
  DECISION_DIAGNOSTICS,
  DECISION_SUGGESTIONS,
  DECISION_RISK_TYPES,
  DECISION_DEPENDENCY_KEYS,
  DECISION_CONFIDENCE_BANDS,
  isValidDecisionType,
  isValidDecisionRisk,
  isValidDecisionReason,
  isValidDecisionContextSufficiency,
  isValidDecisionConsistency,
  isValidDecisionDiagnostic,
  isValidDecisionSuggestion,
  isValidDecisionRiskType,
  describeDecisionConfidence,
} from './decisionTypes.js';

test('decisão 1: DECISION_TYPES é fechado e contém as 10 decisões', () => {
  assert.deepEqual(DECISION_TYPES, [
    'ANSWER',
    'ASK',
    'CONFIRM',
    'WAIT',
    'CONSULT_MEMORY',
    'CONSULT_DATABASE',
    'REJECT',
    'CANCEL',
    'DEFER',
    'UNKNOWN',
  ]);
});

test('decisão 2: DECISION_RISKS é fechado com 5 níveis', () => {
  assert.deepEqual(DECISION_RISKS, ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
});

test('decisão 3: DECISION_REASONS é fechado com 15 razões', () => {
  assert.equal(DECISION_REASONS.length, 15);
  assert.ok(DECISION_REASONS.includes('HIGH_CONFIDENCE'));
  assert.ok(DECISION_REASONS.includes('MISSING_ACCOUNT'));
  assert.ok(DECISION_REASONS.includes('USER_CONFIRMATION_REQUIRED'));
});

test('decisão 4: validadores rejeitam valores fora do enum', () => {
  assert.equal(isValidDecisionType('ANSWER'), true);
  assert.equal(isValidDecisionType('EXECUTE'), false);
  assert.equal(isValidDecisionType('respond'), false);
  assert.equal(isValidDecisionType(null), false);
  assert.equal(isValidDecisionRisk('CRITICAL'), true);
  assert.equal(isValidDecisionRisk('FATAL'), false);
  assert.equal(isValidDecisionReason('STALE_DATA'), true);
  assert.equal(isValidDecisionReason('texto livre'), false);
});

test('decisão 5: sufficiency é fechado (SUFFICIENT/PARTIAL/INSUFFICIENT/UNKNOWN)', () => {
  assert.deepEqual(DECISION_CONTEXT_SUFFICIENCY, [
    'SUFFICIENT',
    'PARTIAL',
    'INSUFFICIENT',
    'UNKNOWN',
  ]);
  assert.equal(isValidDecisionContextSufficiency('SUFFICIENT'), true);
  assert.equal(isValidDecisionContextSufficiency('ENOUGH'), false);
});

test('decisão 6: consistency é fechado (CONSISTENT/PARTIAL/CONFLICTING/UNKNOWN)', () => {
  assert.deepEqual(DECISION_CONSISTENCY_STATES, [
    'CONSISTENT',
    'PARTIAL',
    'CONFLICTING',
    'UNKNOWN',
  ]);
  assert.equal(isValidDecisionConsistency('CONFLICTING'), true);
  assert.equal(isValidDecisionConsistency('OK'), false);
});

test('decisão 7: diagnósticos são enums — nunca texto livre', () => {
  assert.ok(DECISION_DIAGNOSTICS.length >= 20);
  for (const entry of DECISION_DIAGNOSTICS) {
    assert.equal(isValidDecisionDiagnostic(entry), true, entry);
    assert.match(entry, /^[A-Z0-9_]+$/, 'diagnóstico deve ser enum UPPER_SNAKE');
  }
  assert.equal(isValidDecisionDiagnostic('Contexto suficiente'), false);
});

test('decisão 8: recomendações são enums estruturados', () => {
  assert.ok(DECISION_SUGGESTIONS.includes('ASK_ACCOUNT'));
  assert.ok(DECISION_SUGGESTIONS.includes('ASK_CATEGORY'));
  assert.ok(DECISION_SUGGESTIONS.includes('ASK_CONFIRMATION'));
  assert.ok(DECISION_SUGGESTIONS.includes('CONSULT_MEMORY'));
  assert.ok(DECISION_SUGGESTIONS.includes('CONSULT_DATABASE'));
  assert.ok(DECISION_SUGGESTIONS.includes('REFRESH_SNAPSHOT'));
  assert.equal(isValidDecisionSuggestion('FAZER_ALGO'), false);
});

test('decisão 9: riscos de decisão são fechados (12 tipos)', () => {
  assert.equal(DECISION_RISK_TYPES.length, 12);
  assert.ok(DECISION_RISK_TYPES.includes('wrong_action_execution'));
  assert.ok(DECISION_RISK_TYPES.includes('conflicting_balance'));
  assert.ok(DECISION_RISK_TYPES.includes('incorrect_executor'));
  assert.equal(isValidDecisionRiskType('wrong_account'), true);
  assert.equal(isValidDecisionRiskType('tudo_errado'), false);
});

test('decisão 10: bandas de confiança são contínuas de 0 a 1', () => {
  let previousMax = -1;
  for (const band of DECISION_CONFIDENCE_BANDS) {
    assert.ok(band.min >= previousMax, 'bandas não podem se sobrepor');
    previousMax = band.max;
  }
  assert.equal(previousMax, 1);
  assert.equal(describeDecisionConfidence(0.95), 'very_high');
  assert.equal(describeDecisionConfidence(0.75), 'high');
  assert.equal(describeDecisionConfidence(0.55), 'medium');
  assert.equal(describeDecisionConfidence(0.3), 'low');
  assert.equal(describeDecisionConfidence(0.1), 'very_low');
  assert.equal(describeDecisionConfidence(-5), 'very_low');
});

test('decisão 10b: chaves de dependência são fechadas (8)', () => {
  assert.equal(DECISION_DEPENDENCY_KEYS.length, 8);
  assert.ok(DECISION_DEPENDENCY_KEYS.includes('requiresMemory'));
  assert.ok(DECISION_DEPENDENCY_KEYS.includes('requiresDatabase'));
  assert.ok(DECISION_DEPENDENCY_KEYS.includes('requiresExecutor'));
});
