import { GOAL_POLICY } from './goalPolicy.js';

export function evaluateGoalFeasibility(input = {}) {
  const safe = input && typeof input === 'object' ? input : {};
  const completeness = safe.completeness ?? {};
  const risks = safe.risks ?? [];

  const available = completeness?.available ?? [];
  const missing = completeness?.missing ?? [];

  if (available.length === 0 && missing.length > 0) return 'INSUFFICIENT_DATA';

  let score = 0;
  const weights = GOAL_POLICY.feasibilityWeights;
  if (available.includes('target_amount')) score += weights.hasAmount;
  if (available.includes('target_date')) score += weights.hasDate;
  if (available.includes('financial_snapshot')) score += weights.hasSnapshot;
  if (available.includes('memory')) score += weights.hasMemory;
  if (safe.depAllSatisfied) score += weights.hasDepsSatisfied;
  const realRisks = risks.filter((risk) => risk?.type && risk.type !== 'NONE');
  if (realRisks.length === 0) score += weights.noConflicts;
  else if (realRisks.length <= GOAL_POLICY.maxRisksForFeasible) score += weights.lowRisk;

  if (score >= 0.7) return 'FEASIBLE';
  if (score >= 0.4) return 'PARTIALLY_FEASIBLE';
  if (score > 0 && score < 0.4) return 'CURRENTLY_INFEASIBLE';
  return 'INSUFFICIENT_DATA';
}