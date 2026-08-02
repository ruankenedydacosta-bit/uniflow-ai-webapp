// Testes de tipos fechados do Reflection & Learning Engine (Fase 8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LEARNING_CANDIDATE_STATUSES,
  LEARNING_CANDIDATE_TYPES,
  LEARNING_PRIORITIES,
  LEARNING_RISK_LEVELS,
  REFLECTION_OUTCOMES,
  REFLECTION_SIGNAL_TYPES,
  isValidLearningCandidateStatus,
  isValidLearningCandidateType,
  isValidLearningPriority,
  isValidLearningRiskLevel,
  isValidReflectionOutcome,
  isValidReflectionSignalType,
} from './reflectionTypes.js';

test('tipos: outcomes incluem os 12 obrigatórios', () => {
  for (const outcome of [
    'SUCCESS_CONFIRMED',
    'SUCCESS_INFERRED',
    'PARTIAL_SUCCESS',
    'USER_CORRECTED',
    'USER_REJECTED',
    'USER_CANCELLED',
    'SYSTEM_ERROR',
    'PROVIDER_ERROR',
    'AMBIGUOUS_RESULT',
    'UNRESOLVED',
    'ABANDONED',
    'UNKNOWN',
  ]) {
    assert.ok(REFLECTION_OUTCOMES.includes(outcome), outcome);
  }
});

test('tipos: sinais incluem os obrigatórios', () => {
  for (const signal of [
    'INTENT_MISMATCH',
    'ENTITY_MISMATCH',
    'ACCOUNT_MISMATCH',
    'CATEGORY_MISMATCH',
    'AMOUNT_MISMATCH',
    'DATE_MISMATCH',
    'CONTEXT_LOST',
    'MEMORY_CONFLICT',
    'EPISTEMIC_CONFLICT',
    'DECISION_MISMATCH',
    'PLANNING_MISMATCH',
    'GOAL_MISMATCH',
    'EXECUTOR_MISMATCH',
    'USER_CORRECTION',
    'USER_REJECTION',
    'USER_REPETITION',
    'LOW_CONFIDENCE',
    'STALE_INFORMATION',
    'MISSING_INFORMATION',
    'UNNECESSARY_QUESTION',
    'MISSING_QUESTION',
    'DUPLICATED_RESPONSE',
    'VOICE_FAILURE',
    'PROVIDER_FAILURE',
    'SUCCESSFUL_PATTERN',
    'UNKNOWN',
  ]) {
    assert.ok(REFLECTION_SIGNAL_TYPES.includes(signal), signal);
  }
});

test('tipos: candidatos incluem os obrigatórios', () => {
  for (const type of [
    'INTENT_PATTERN',
    'ENTITY_EXTRACTION_PATTERN',
    'ACCOUNT_PREFERENCE',
    'CATEGORY_PREFERENCE',
    'MERCHANT_CATEGORY_ASSOCIATION',
    'MERCHANT_ACCOUNT_ASSOCIATION',
    'CONVERSATION_PREFERENCE',
    'RESPONSE_STYLE_PREFERENCE',
    'USER_CORRECTION_PATTERN',
    'CONTEXT_RESOLUTION_PATTERN',
    'QUESTION_STRATEGY',
    'DECISION_POLICY_SIGNAL',
    'PLANNING_POLICY_SIGNAL',
    'GOAL_POLICY_SIGNAL',
    'EPISTEMIC_POLICY_SIGNAL',
    'ERROR_PREVENTION_PATTERN',
    'SUCCESS_REINFORCEMENT',
    'DO_NOT_LEARN',
    'UNKNOWN',
  ]) {
    assert.ok(LEARNING_CANDIDATE_TYPES.includes(type), type);
  }
});

test('tipos: status incluem os obrigatórios (sem applied)', () => {
  for (const status of [
    'DETECTED',
    'CANDIDATE',
    'NEEDS_EVIDENCE',
    'SUPPORTED',
    'HIGH_CONFIDENCE',
    'CONFLICTING',
    'REJECTED',
    'EXPIRED',
    'SUPERSEDED',
    'SHADOW_APPROVED',
    'UNKNOWN',
  ]) {
    assert.ok(LEARNING_CANDIDATE_STATUSES.includes(status), status);
  }
  assert.equal(LEARNING_CANDIDATE_STATUSES.includes('applied'), false);
});

test('tipos: prioridades incluem as obrigatórias', () => {
  for (const priority of ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'IGNORE', 'UNDETERMINED']) {
    assert.ok(LEARNING_PRIORITIES.includes(priority), priority);
  }
});

test('tipos: riscos incluem os obrigatórios', () => {
  for (const risk of ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'UNKNOWN']) {
    assert.ok(LEARNING_RISK_LEVELS.includes(risk), risk);
  }
});

test('tipos: validadores aceitam apenas valores do enum', () => {
  assert.equal(isValidReflectionOutcome('SUCCESS_CONFIRMED'), true);
  assert.equal(isValidReflectionOutcome('nao_existe'), false);
  assert.equal(isValidReflectionSignalType('INTENT_MISMATCH'), true);
  assert.equal(isValidReflectionSignalType('nao_existe'), false);
  assert.equal(isValidLearningCandidateType('ACCOUNT_PREFERENCE'), true);
  assert.equal(isValidLearningCandidateType('nao_existe'), false);
  assert.equal(isValidLearningCandidateStatus('SUPPORTED'), true);
  assert.equal(isValidLearningCandidateStatus('applied'), false);
  assert.equal(isValidLearningPriority('CRITICAL'), true);
  assert.equal(isValidLearningPriority('nao_existe'), false);
  assert.equal(isValidLearningRiskLevel('CRITICAL'), true);
  assert.equal(isValidLearningRiskLevel('nao_existe'), false);
});

test('tipos: enums são congelados e imutáveis', () => {
  assert.ok(Object.isFrozen(REFLECTION_OUTCOMES));
  assert.ok(Object.isFrozen(REFLECTION_SIGNAL_TYPES));
  assert.ok(Object.isFrozen(LEARNING_CANDIDATE_TYPES));
  assert.ok(Object.isFrozen(LEARNING_CANDIDATE_STATUSES));
  assert.ok(Object.isFrozen(LEARNING_PRIORITIES));
  assert.ok(Object.isFrozen(LEARNING_RISK_LEVELS));
});
