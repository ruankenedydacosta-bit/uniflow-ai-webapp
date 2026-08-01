import { PLANNING_POLICY } from './planningPolicy.js';

export function buildPlanningDiagnostics(input = {}) {
  const diagnostics = [];
  const push = (entry) => {
    if (!diagnostics.includes(entry)) diagnostics.push(entry);
  };
  const goal = input.goal ?? {};
  const missing = input.dependencyEvaluation?.missing ?? [];
  push(goal.detected ? 'PLANNING_INTENT_DETECTED' : 'PLANNING_INTENT_NOT_DETECTED');
  push(goal.type !== 'UNKNOWN' ? 'GOAL_TYPE_IDENTIFIED' : 'GOAL_TYPE_UNKNOWN');
  if (goal.multiple) push('MULTIPLE_GOALS_DETECTED');
  push(goal.targetAmount != null ? 'TARGET_AMOUNT_AVAILABLE' : 'TARGET_AMOUNT_MISSING');
  push(goal.targetDate != null || goal.horizonMonths != null ? 'TARGET_DATE_AVAILABLE' : 'TARGET_DATE_MISSING');
  push(input.financialSnapshot?.hasData ? 'SNAPSHOT_AVAILABLE' : 'SNAPSHOT_MISSING');
  if (input.dependencyEvaluation?.hasMemory) push('MEMORY_AVAILABLE');
  if ((input.epistemicModel?.conflicts?.length ?? 0) > 0) push('EPISTEMIC_CONFLICT');
  if (input.decisionLayer) push('DECISION_CONTEXT_AVAILABLE');
  push(missing.length === 0 ? 'DEPENDENCIES_SATISFIED' : 'DEPENDENCIES_PENDING');
  if (input.status === 'READY') push('PLAN_READY');
  if (input.status === 'PARTIAL') push('PLAN_PARTIAL');
  if (input.status === 'BLOCKED') push('PLAN_BLOCKED');
  if (input.status === 'WAITING') push('PLAN_WAITING');
  push('SHADOW_ONLY');
  return diagnostics.slice(0, PLANNING_POLICY.limits.maxDiagnostics);
}
