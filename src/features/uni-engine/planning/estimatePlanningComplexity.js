import { PLANNING_POLICY } from './planningPolicy.js';

const TYPE_SCORE = Object.freeze({
  UNKNOWN: 0,
  GENERAL: 1,
  BUDGET: 2,
  FINANCIAL: 2,
  SAVINGS: 2,
  DEBT: 3,
  INVESTMENT: 4,
  BUSINESS: 4,
});

export function estimatePlanningComplexity(input = {}) {
  const goal = input.goal ?? {};
  const dependencies = Array.isArray(input.dependencies) ? input.dependencies : [];
  let score = TYPE_SCORE[goal.type] ?? 0;
  score += dependencies.filter((entry) => entry.required && !entry.satisfied).length;
  if (goal.multiple) score += 3;
  if ((goal.horizonMonths ?? 0) > 24) score += 2;
  if (input.hasConflicts) score += 2;
  let complexity = 'LOW';
  if (score >= PLANNING_POLICY.complexity.veryHighScore) complexity = 'VERY_HIGH';
  else if (score >= PLANNING_POLICY.complexity.highScore) complexity = 'HIGH';
  else if (score >= PLANNING_POLICY.complexity.mediumScore) complexity = 'MEDIUM';
  return { complexity, score };
}
