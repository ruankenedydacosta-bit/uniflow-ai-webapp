import { PLANNING_POLICY } from './planningPolicy.js';

const RECOMMENDATION_BY_DEPENDENCY = Object.freeze({
  TARGET_AMOUNT: 'ASK_TARGET_AMOUNT',
  TARGET_DATE: 'ASK_TARGET_DATE',
  FINANCIAL_SNAPSHOT: 'CONSULT_FINANCIAL_SNAPSHOT',
  INCOME_CONTEXT: 'ASK_INCOME_CONTEXT',
  DEBT_CONTEXT: 'ASK_DEBT_CONTEXT',
  INVESTMENT_PROFILE: 'ASK_INVESTMENT_PROFILE',
  BUDGET_CONTEXT: 'ASK_BUDGET_CONTEXT',
  BUSINESS_CONTEXT: 'ASK_BUSINESS_CONTEXT',
  WORKSPACE_CONTEXT: 'CONFIRM_WORKSPACE_CONTEXT',
  USER_CONFIRMATION: 'CONFIRM_PLAN',
  CONFLICT_RESOLUTION: 'RESOLVE_EPISTEMIC_CONFLICT',
});

export function buildPlanningSuggestions(input = {}) {
  const suggestions = [];
  const push = (entry) => {
    if (entry && !suggestions.includes(entry)) suggestions.push(entry);
  };
  for (const dependency of input.dependencyEvaluation?.missing ?? []) {
    push(RECOMMENDATION_BY_DEPENDENCY[dependency.type]);
  }
  if (input.goal?.multiple) push('REVIEW_MULTIPLE_GOALS');
  if (input.status === 'WAITING') push('WAIT_FOR_USER');
  if (input.status === 'READY') push('CONFIRM_PLAN');
  if (suggestions.length === 0) push('NO_ACTION');
  return suggestions.slice(0, PLANNING_POLICY.limits.maxRecommendations);
}

export { RECOMMENDATION_BY_DEPENDENCY };
