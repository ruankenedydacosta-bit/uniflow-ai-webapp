import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as types from './planningTypes.js';

const enumValidators = [
  [types.PLANNING_GOAL_TYPES, types.isValidGoalType],
  [types.PLANNING_STATUSES, types.isValidPlanningStatus],
  [types.PLANNING_COMPLEXITIES, types.isValidPlanningComplexity],
  [types.PLANNING_RISKS, types.isValidPlanningRisk],
  [types.PLANNING_DEPENDENCY_TYPES, types.isValidPlanningDependencyType],
  [types.PLANNING_STEP_TYPES, types.isValidPlanningStepType],
  [types.PLANNING_DIAGNOSTICS, types.isValidPlanningDiagnostic],
  [types.PLANNING_RECOMMENDATIONS, types.isValidPlanningRecommendation],
];

for (const [values, validator] of enumValidators) {
  for (const value of values) {
    test(`enum aceita ${value}`, () => assert.equal(validator(value), true));
  }
  test(`enum rejeita valor desconhecido (${values[0]})`, () => {
    assert.equal(validator('__INVALID__'), false);
  });
  test(`enum ${values[0]} é imutável`, () => assert.equal(Object.isFrozen(values), true));
}
