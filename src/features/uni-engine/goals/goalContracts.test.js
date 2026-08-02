// Testes de contratos do Goal Engine (Fase 7).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GOAL_ENGINE_VERSION,
  createEmptyGoalEngineResult,
  createGoalCandidate,
  createGoalConflict,
  createGoalDefinition,
  createGoalEngineResult,
  createGoalRisk,
  createGoalShadow,
  validateGoalEngineResult,
} from './goalContracts.js';
import {
  findFunctionsInValue,
  isSerializableValue,
} from '../uniEngineContracts.js';

test('goalContracts: resultado vazio respeita defaults e Shadow Mode', () => {
  const result = createEmptyGoalEngineResult();
  assert.equal(result.version, GOAL_ENGINE_VERSION);
  assert.equal(result.enabled, false);
  assert.equal(result.shadowMode, true);
  assert.equal(result.goalDetected, false);
  assert.equal(result.type, 'UNKNOWN');
  assert.equal(result.status, 'UNKNOWN');
  assert.equal(result.horizon, 'UNKNOWN');
  assert.equal(result.priority, 'UNDETERMINED');
  assert.equal(result.confidence, 0);
  assert.equal(result.feasibility, 'UNKNOWN');
  assert.equal(result.progress, null);
  assert.deepEqual(result.diagnostics, ['GOAL_NOT_DETECTED', 'SHADOW_ONLY']);
  assert.deepEqual(result.suggestions, ['NO_ACTION']);
  assert.equal(result.recommendedNextStep, 'NO_ACTION');
  assert.equal(result.latencyMs, 0);
  assert.equal(validateGoalEngineResult(result).valid, true);
});

test('goalContracts: resultado completo tem todos os campos do contrato', () => {
  const result = createGoalEngineResult({
    enabled: true,
    shadowMode: true,
    goalDetected: true,
    goal: { raw: 'quero juntar 10 mil', type: 'SAVINGS', status: 'NEEDS_INFORMATION' },
    type: 'SAVINGS',
    status: 'NEEDS_INFORMATION',
    horizon: 'MEDIUM_TERM',
    priority: 'HIGH',
    confidence: 0.7,
    feasibility: 'PARTIALLY_FEASIBLE',
    progress: 25,
    target: { amount: 10000, currency: 'BRL' },
    currentState: { description: null },
    missingInformation: ['target_date'],
    dependencies: [{ type: 'TARGET_DATE', satisfied: false }],
    conflicts: [{ type: 'NONE' }],
    risks: [{ type: 'NONE' }],
    diagnostics: ['GOAL_DETECTED'],
    suggestions: ['ASK_TARGET_DATE'],
    recommendedNextStep: 'REQUEST_TARGET_DETAILS',
    evidenceSummary: { targetAmount: true },
    sourceSummary: { source: 'explicit_user_statement' },
    shadow: { shadowMode: true },
    latencyMs: 1.23,
  });
  assert.equal(result.goalDetected, true);
  assert.equal(result.goal.type, 'SAVINGS');
  assert.equal(result.confidenceBand, 'high');
  assert.equal(result.progressBand, 'steady');
  assert.equal(result.target.amount, 10000);
  assert.equal(result.shadow.shadowMode, true);
  assert.equal(validateGoalEngineResult(result).valid, true);
  assert.equal(isSerializableValue(result), true);
  assert.deepEqual(findFunctionsInValue(result), []);
});

test('goalContracts: ausência nunca vira zero e valores inválidos são saneados', () => {
  const result = createGoalEngineResult({
    enabled: true,
    shadowMode: true,
    type: 'INVALID_TYPE',
    status: 'INVALID_STATUS',
    confidence: 99,
    progress: 250,
    target: { amount: null, currency: null, date: 42, horizonMonths: 'x', description: 9 },
    conflicts: [{ type: 'BOGUS' }, 'string'],
    risks: [{ type: 'BOGUS' }],
    diagnostics: ['BOGUS'],
    suggestions: ['BOGUS'],
  });
  assert.equal(result.type, 'UNKNOWN');
  assert.equal(result.status, 'UNKNOWN');
  assert.equal(result.confidence, 1, 'valor fora do domínio é clampado para [0,1]');
  assert.equal(result.progress, 100, 'progresso fora do domínio é clampado para [0,100]');
  assert.deepEqual(result.target, { amount: null, currency: null, date: null, horizonMonths: null, description: null });
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.risks, []);
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.suggestions, []);
  assert.equal(result.recommendedNextStep, 'NO_ACTION');
});

test('goalContracts: shadow bloqueia decisão, resposta e execução', () => {
  const shadow = createGoalShadow();
  assert.equal(shadow.shadowMode, true);
  assert.equal(shadow.appliedToDecision, false);
  assert.equal(shadow.appliedToResponse, false);
  assert.equal(shadow.executed, false);
  assert.equal(shadow.voiceTouched, false);
  assert.equal(shadow.databaseCalled, false);
  assert.equal(shadow.memoryModified, false);
  assert.equal(shadow.planningModified, false);
  assert.equal(shadow.pipelineAltered, false);

  const forced = createGoalEngineResult({
    enabled: true,
    shadow: { appliedToDecision: true, executed: true },
  });
  assert.equal(forced.shadow.appliedToDecision, false, 'nunca pode ser aplicado');
  assert.equal(forced.shadow.executed, false);
  assert.equal(validateGoalEngineResult(forced).valid, true);
});

test('goalContracts: validação rejeita resultados fora do contrato', () => {
  assert.equal(validateGoalEngineResult(null).valid, false);
  assert.equal(validateGoalEngineResult({}).valid, false);
  const withFunction = createGoalEngineResult({ enabled: true });
  withFunction.extra = () => {};
  assert.equal(validateGoalEngineResult(withFunction).valid, false);
  const tampered = createGoalEngineResult({ enabled: true });
  tampered.shadow.appliedToDecision = true;
  assert.equal(validateGoalEngineResult(tampered).valid, false);
  tampered.shadow.appliedToDecision = false;
  tampered.confidence = 1.5;
  assert.equal(validateGoalEngineResult(tampered).valid, false);
});

test('goalContracts: entradas não-objeto e parciais são seguras', () => {
  const definition = createGoalDefinition(null);
  assert.equal(definition.type, 'UNKNOWN');
  const conflict = createGoalConflict(undefined);
  assert.equal(conflict.type, 'NONE');
  const risk = createGoalRisk('string');
  assert.equal(risk.type, 'NONE');
  const candidate = createGoalCandidate();
  assert.equal(candidate.rawText, null);
  assert.equal(candidate.ambiguous, false);
});

test('goalContracts: serialização completa sem exceção', () => {
  const result = createGoalEngineResult({
    enabled: true,
    shadowMode: true,
    goalDetected: true,
    type: 'SAVINGS',
    status: 'DRAFT',
    horizon: 'UNKNOWN',
    priority: 'LOW',
    confidence: 0.5,
    feasibility: 'PARTIALLY_FEASIBLE',
    progress: 10,
    shadow: { shadowMode: true },
  });
  assert.doesNotThrow(() => JSON.stringify(result));
});
