import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createEmptyPlanningResult,
  createPlanningGoal,
  createPlanningResult,
  createPlanningShadow,
  createPlanningStep,
  PLANNING_ENGINE_VERSION,
  validatePlanningResult,
} from './planningContracts.js';

function validResult(overrides = {}) {
  return createPlanningResult({
    goal: { detected: true, type: 'SAVINGS', targetAmount: 1000, currency: 'BRL' },
    goalType: 'SAVINGS',
    status: 'READY',
    complexity: 'LOW',
    confidence: 0.8,
    risk: 'LOW',
    dependencies: [],
    timeline: { startDate: '2026-08-01', targetDate: '2027-08-01', horizonMonths: 12, milestones: [] },
    suggestedSteps: [{ id: 'step-1', type: 'DEFINE_GOAL', order: 1 }],
    diagnostics: ['PLAN_READY'],
    recommendations: ['CONFIRM_PLAN'],
    shadow: {},
    latency: { totalMs: 1 },
    ...overrides,
  });
}

const contractCases = [
  ['versão estável', () => assert.equal(PLANNING_ENGINE_VERSION, '1.0')],
  ['resultado válido', () => assert.equal(validatePlanningResult(validResult()).valid, true)],
  ['resultado serializável', () => assert.doesNotThrow(() => JSON.stringify(validResult()))],
  ['goal inválido normaliza', () => assert.equal(createPlanningGoal({ type: 'X' }).type, 'UNKNOWN')],
  ['status inválido normaliza', () => assert.equal(createPlanningResult({ status: 'X' }).status, 'UNKNOWN')],
  ['complexidade inválida normaliza', () => assert.equal(createPlanningResult({ complexity: 'X' }).complexity, 'LOW')],
  ['risco inválido normaliza', () => assert.equal(createPlanningResult({ risk: 'X' }).risk, 'NONE')],
  ['confiança acima limita', () => assert.equal(createPlanningResult({ confidence: 2 }).confidence, 1)],
  ['confiança abaixo limita', () => assert.equal(createPlanningResult({ confidence: -1 }).confidence, 0)],
  ['shadow nunca executa', () => assert.equal(createPlanningShadow({ planExecuted: true }).planExecuted, false)],
  ['shadow nunca aplica', () => assert.equal(createPlanningShadow({ appliedToDecision: true }).appliedToDecision, false)],
  ['shadow não chama executor', () => assert.equal(createPlanningShadow({ executorCalled: true }).executorCalled, false)],
  ['shadow não chama banco', () => assert.equal(createPlanningShadow({ databaseCalled: true }).databaseCalled, false)],
  ['shadow não altera memória', () => assert.equal(createPlanningShadow({ memoryModified: true }).memoryModified, false)],
  ['shadow não toca voz', () => assert.equal(createPlanningShadow({ voiceTouched: true }).voiceTouched, false)],
  ['shadow não altera resposta', () => assert.equal(createPlanningShadow({ responseModified: true }).responseModified, false)],
  ['shadow não altera pipeline', () => assert.equal(createPlanningShadow({ pipelineAltered: true }).pipelineAltered, false)],
  ['step normaliza ordem', () => assert.equal(createPlanningStep({ order: 0 }).order, 1)],
  ['step normaliza tipo', () => assert.equal(createPlanningStep({ type: 'X' }).type, 'DEFINE_GOAL')],
  ['goal preserva amount zero', () => assert.equal(createPlanningGoal({ targetAmount: 0 }).targetAmount, 0)],
  ['goal ignora amount NaN', () => assert.equal(createPlanningGoal({ targetAmount: Number.NaN }).targetAmount, null)],
  ['goal limita tipos detectados', () => assert.deepEqual(createPlanningGoal({ detectedGoalTypes: ['SAVINGS', 'X'] }).detectedGoalTypes, ['SAVINGS'])],
  ['empty é UNKNOWN', () => assert.equal(createEmptyPlanningResult().status, 'UNKNOWN')],
  ['empty recomenda NO_ACTION', () => assert.deepEqual(createEmptyPlanningResult().recommendations, ['NO_ACTION'])],
  ['validador rejeita null', () => assert.equal(validatePlanningResult(null).valid, false)],
];

for (const [name, assertion] of contractCases) test(`contrato: ${name}`, assertion);

for (const [field, value, error] of [
  ['goalType', 'X', 'GOAL_TYPE_INVALID'],
  ['status', 'X', 'STATUS_INVALID'],
  ['complexity', 'X', 'COMPLEXITY_INVALID'],
  ['risk', 'X', 'RISK_INVALID'],
  ['confidence', 2, 'CONFIDENCE_INVALID'],
  ['dependencies', null, 'DEPENDENCIES_INVALID'],
  ['suggestedSteps', null, 'STEPS_INVALID'],
  ['timeline', null, 'TIMELINE_INVALID'],
  ['latency', null, 'LATENCY_INVALID'],
]) {
  test(`validação rejeita ${field}`, () => {
    const result = validResult();
    result[field] = value;
    assert.ok(validatePlanningResult(result).errors.includes(error));
  });
}
