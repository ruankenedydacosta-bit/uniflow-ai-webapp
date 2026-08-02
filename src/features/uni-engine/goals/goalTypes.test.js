// Testes dos tipos e enums do Goal Engine (Fase 7).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GOAL_TYPES,
  GOAL_STATUSES,
  GOAL_HORIZONS,
  GOAL_PRIORITIES,
  GOAL_FEASIBILITY,
  isValidGoalType,
  isValidGoalStatus,
  isValidGoalHorizon,
  isValidGoalPriority,
  isValidGoalFeasibility,
  isValidGoalConflictType,
  isValidGoalRiskType,
  isValidGoalDiagnostic,
  isValidGoalSuggestion,
  isValidGoalNextStep,
  describeGoalConfidence,
  describeGoalProgress,
} from './goalTypes.js';

test('goalTypes: enums cobrem o contrato mínimo da Fase 7', () => {
  assert.deepEqual(GOAL_TYPES, [
    'SAVINGS',
    'EMERGENCY_FUND',
    'DEBT_REDUCTION',
    'DEBT_PAYOFF',
    'PURCHASE',
    'INVESTMENT',
    'INCOME',
    'EXPENSE_REDUCTION',
    'BUDGET',
    'CASH_FLOW',
    'BUSINESS',
    'FINANCIAL_ORGANIZATION',
    'CUSTOM',
    'UNKNOWN',
  ]);
  assert.deepEqual(GOAL_STATUSES, [
    'DETECTED',
    'DRAFT',
    'NEEDS_INFORMATION',
    'READY',
    'ACTIVE_SHADOW',
    'PAUSED',
    'BLOCKED',
    'AT_RISK',
    'ACHIEVED_INFERRED',
    'ABANDONED_INFERRED',
    'UNKNOWN',
  ]);
  assert.deepEqual(GOAL_HORIZONS, [
    'IMMEDIATE',
    'SHORT_TERM',
    'MEDIUM_TERM',
    'LONG_TERM',
    'OPEN_ENDED',
    'UNKNOWN',
  ]);
  assert.deepEqual(GOAL_PRIORITIES, [
    'CRITICAL',
    'HIGH',
    'MEDIUM',
    'LOW',
    'UNDETERMINED',
  ]);
  assert.deepEqual(GOAL_FEASIBILITY, [
    'FEASIBLE',
    'PARTIALLY_FEASIBLE',
    'CURRENTLY_INFEASIBLE',
    'INSUFFICIENT_DATA',
    'UNKNOWN',
  ]);
});

test('goalTypes: validadores aceitam somente valores dos enums', () => {
  assert.equal(isValidGoalType('SAVINGS'), true);
  assert.equal(isValidGoalType('SAVINGS_EXTRA'), false);
  assert.equal(isValidGoalType(undefined), false);
  assert.equal(isValidGoalStatus('BLOCKED'), true);
  assert.equal(isValidGoalStatus('blocked'), false);
  assert.equal(isValidGoalHorizon('OPEN_ENDED'), true);
  assert.equal(isValidGoalHorizon('WEEK'), false);
  assert.equal(isValidGoalPriority('UNDETERMINED'), true);
  assert.equal(isValidGoalPriority('TOP'), false);
  assert.equal(isValidGoalFeasibility('FEASIBLE'), true);
  assert.equal(isValidGoalFeasibility('MAYBE'), false);
  assert.equal(isValidGoalConflictType('PERSONAL_VS_BUSINESS'), true);
  assert.equal(isValidGoalRiskType('UNREALISTIC_TARGET'), true);
  assert.equal(isValidGoalDiagnostic('GOAL_DETECTED'), true);
  assert.equal(isValidGoalDiagnostic('GOAL_EXECUTED'), false);
  assert.equal(isValidGoalSuggestion('ASK_TARGET_AMOUNT'), true);
  assert.equal(isValidGoalSuggestion('EXECUTE_GOAL'), false);
  assert.equal(isValidGoalNextStep('MONITOR_PROGRESS'), true);
  assert.equal(isValidGoalNextStep('CREATE_GOAL'), false);
});

test('goalTypes: bandas de confiança e progresso são determinísticas', () => {
  assert.equal(describeGoalConfidence(0.1), 'insufficient');
  assert.equal(describeGoalConfidence(0.3), 'low');
  assert.equal(describeGoalConfidence(0.55), 'moderate');
  assert.equal(describeGoalConfidence(0.75), 'high');
  assert.equal(describeGoalConfidence(0.95), 'very_high');
  assert.equal(describeGoalConfidence(NaN), 'insufficient');
  assert.equal(describeGoalProgress(0), 'not_started');
  assert.equal(describeGoalProgress(12), 'early');
  assert.equal(describeGoalProgress(30), 'steady');
  assert.equal(describeGoalProgress(60), 'advanced');
  assert.equal(describeGoalProgress(85), 'nearing_completion');
  assert.equal(describeGoalProgress(100), 'inferred_complete');
  assert.equal(describeGoalProgress(null), 'not_started');
});
