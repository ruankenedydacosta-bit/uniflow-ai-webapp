import { clampPlanningConfidence, PLANNING_POLICY } from './planningPolicy.js';

export function computePlanningConfidence(input = {}) {
  const goal = input.goal ?? {};
  const dependencyEvaluation = input.dependencyEvaluation ?? {};
  const c = PLANNING_POLICY.confidence;
  let value = c.base;
  if (goal.detected) value += c.intentBonus;
  if (goal.type && goal.type !== 'UNKNOWN') value += c.typeBonus;
  if (goal.targetAmount != null) value += c.amountBonus;
  if (goal.targetDate != null || goal.horizonMonths != null) value += c.timelineBonus;
  if (input.financialSnapshot?.hasData) value += c.snapshotBonus;
  if (dependencyEvaluation.hasMemory) value += c.memoryBonus;
  if (input.decisionLayer) value += c.decisionBonus;
  value -= (dependencyEvaluation.missing?.length ?? 0) * c.missingPenalty;
  if ((input.epistemicModel?.conflicts?.length ?? 0) > 0) value -= c.conflictPenalty;
  if (goal.multiple) value -= c.multiplePenalty;
  const confidence = Number(clampPlanningConfidence(value).toFixed(4));
  return {
    confidence,
    band: confidence >= 0.8 ? 'HIGH' : confidence >= 0.5 ? 'MEDIUM' : 'LOW',
  };
}
