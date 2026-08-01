import { createPlanningStep } from './planningContracts.js';
import { PLANNING_POLICY } from './planningPolicy.js';

export function buildPlanningSteps(input = {}) {
  const goal = input.goal ?? {};
  const dependencies = Array.isArray(input.dependencies) ? input.dependencies : [];
  const missing = dependencies.filter((entry) => entry.required && !entry.satisfied);
  const types = ['DEFINE_GOAL'];
  if (missing.length > 0) types.push('RESOLVE_DEPENDENCY');
  types.push('ASSESS_CURRENT_STATE');
  if (goal.targetAmount != null) types.push('SET_TARGET', 'CALCULATE_GAP');
  if (goal.targetDate != null || goal.horizonMonths != null) types.push('SET_TIMELINE');
  if (['BUDGET', 'SAVINGS', 'DEBT', 'BUSINESS'].includes(goal.type)) types.push('ALLOCATE_BUDGET');
  types.push('CREATE_MILESTONES', 'TRACK_PROGRESS', 'REVIEW_PLAN');

  return types.slice(0, PLANNING_POLICY.limits.maxSteps).map((type, index) => createPlanningStep({
    id: `step-${index + 1}`,
    type,
    order: index + 1,
    status: type === 'DEFINE_GOAL' && goal.detected
      ? 'READY'
      : (type === 'RESOLVE_DEPENDENCY' && missing.length > 0 ? 'BLOCKED' : 'PENDING'),
    dependsOn: index === 0 ? [] : [`step-${index}`],
    metadata: type === 'RESOLVE_DEPENDENCY'
      ? { missingDependencyTypes: missing.map((entry) => entry.type) }
      : {},
  }));
}
