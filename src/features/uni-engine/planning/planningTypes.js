export const PLANNING_GOAL_TYPES = Object.freeze([
  'FINANCIAL',
  'SAVINGS',
  'DEBT',
  'INVESTMENT',
  'BUDGET',
  'BUSINESS',
  'GENERAL',
  'UNKNOWN',
]);

export const PLANNING_STATUSES = Object.freeze([
  'READY',
  'PARTIAL',
  'BLOCKED',
  'WAITING',
  'UNKNOWN',
]);

export const PLANNING_COMPLEXITIES = Object.freeze([
  'LOW',
  'MEDIUM',
  'HIGH',
  'VERY_HIGH',
]);

export const PLANNING_RISKS = Object.freeze([
  'NONE',
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
]);

export const PLANNING_DEPENDENCY_TYPES = Object.freeze([
  'TARGET_AMOUNT',
  'TARGET_DATE',
  'FINANCIAL_SNAPSHOT',
  'INCOME_CONTEXT',
  'DEBT_CONTEXT',
  'INVESTMENT_PROFILE',
  'BUDGET_CONTEXT',
  'BUSINESS_CONTEXT',
  'WORKSPACE_CONTEXT',
  'USER_CONFIRMATION',
  'CONFLICT_RESOLUTION',
]);

export const PLANNING_STEP_TYPES = Object.freeze([
  'DEFINE_GOAL',
  'ASSESS_CURRENT_STATE',
  'SET_TARGET',
  'SET_TIMELINE',
  'CALCULATE_GAP',
  'ALLOCATE_BUDGET',
  'CREATE_MILESTONES',
  'TRACK_PROGRESS',
  'REVIEW_PLAN',
  'RESOLVE_DEPENDENCY',
]);

export const PLANNING_DIAGNOSTICS = Object.freeze([
  'PLANNING_INTENT_DETECTED',
  'PLANNING_INTENT_NOT_DETECTED',
  'GOAL_TYPE_IDENTIFIED',
  'GOAL_TYPE_UNKNOWN',
  'MULTIPLE_GOALS_DETECTED',
  'TARGET_AMOUNT_AVAILABLE',
  'TARGET_AMOUNT_MISSING',
  'TARGET_DATE_AVAILABLE',
  'TARGET_DATE_MISSING',
  'SNAPSHOT_AVAILABLE',
  'SNAPSHOT_MISSING',
  'MEMORY_AVAILABLE',
  'EPISTEMIC_CONFLICT',
  'DECISION_CONTEXT_AVAILABLE',
  'DEPENDENCIES_SATISFIED',
  'DEPENDENCIES_PENDING',
  'PLAN_READY',
  'PLAN_PARTIAL',
  'PLAN_BLOCKED',
  'PLAN_WAITING',
  'SHADOW_ONLY',
]);

export const PLANNING_RECOMMENDATIONS = Object.freeze([
  'ASK_TARGET_AMOUNT',
  'ASK_TARGET_DATE',
  'CONSULT_FINANCIAL_SNAPSHOT',
  'ASK_INCOME_CONTEXT',
  'ASK_DEBT_CONTEXT',
  'ASK_INVESTMENT_PROFILE',
  'ASK_BUDGET_CONTEXT',
  'ASK_BUSINESS_CONTEXT',
  'CONFIRM_WORKSPACE_CONTEXT',
  'RESOLVE_EPISTEMIC_CONFLICT',
  'CONFIRM_PLAN',
  'REVIEW_MULTIPLE_GOALS',
  'WAIT_FOR_USER',
  'NO_ACTION',
]);

function includes(list, value) {
  return list.includes(value);
}

export const isValidGoalType = (value) => includes(PLANNING_GOAL_TYPES, value);
export const isValidPlanningStatus = (value) => includes(PLANNING_STATUSES, value);
export const isValidPlanningComplexity = (value) => includes(PLANNING_COMPLEXITIES, value);
export const isValidPlanningRisk = (value) => includes(PLANNING_RISKS, value);
export const isValidPlanningDependencyType = (value) => includes(PLANNING_DEPENDENCY_TYPES, value);
export const isValidPlanningStepType = (value) => includes(PLANNING_STEP_TYPES, value);
export const isValidPlanningDiagnostic = (value) => includes(PLANNING_DIAGNOSTICS, value);
export const isValidPlanningRecommendation = (value) => includes(PLANNING_RECOMMENDATIONS, value);
