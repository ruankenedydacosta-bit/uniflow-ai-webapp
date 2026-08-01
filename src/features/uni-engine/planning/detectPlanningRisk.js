import { highestPlanningRisk } from './planningPolicy.js';

export function detectPlanningRisk(input = {}) {
  const goal = input.goal ?? {};
  const dependencies = input.dependencyEvaluation?.missing ?? [];
  const reasons = [];
  const levels = [];
  if (!goal.detected) {
    reasons.push('GOAL_NOT_DETECTED');
    levels.push('LOW');
  }
  if (goal.multiple) {
    reasons.push('MULTIPLE_GOALS');
    levels.push('MEDIUM');
  }
  if (dependencies.length > 0) {
    reasons.push('MISSING_DEPENDENCIES');
    levels.push(dependencies.length >= 3 ? 'HIGH' : 'MEDIUM');
  }
  if ((input.epistemicModel?.conflicts?.length ?? 0) > 0) {
    reasons.push('EPISTEMIC_CONFLICT');
    levels.push('HIGH');
  }
  if (input.safetyBlocked) {
    reasons.push('SAFETY_BLOCKED');
    levels.push('CRITICAL');
  }
  if (input.complexity === 'VERY_HIGH') {
    reasons.push('VERY_HIGH_COMPLEXITY');
    levels.push('HIGH');
  }
  return { level: highestPlanningRisk(...levels), reasons };
}
