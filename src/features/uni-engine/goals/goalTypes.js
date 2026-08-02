export const GOAL_TYPES = Object.freeze([
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

export const GOAL_STATUSES = Object.freeze([
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

export const GOAL_HORIZONS = Object.freeze([
  'IMMEDIATE',
  'SHORT_TERM',
  'MEDIUM_TERM',
  'LONG_TERM',
  'OPEN_ENDED',
  'UNKNOWN',
]);

export const GOAL_PRIORITIES = Object.freeze([
  'CRITICAL',
  'HIGH',
  'MEDIUM',
  'LOW',
  'UNDETERMINED',
]);

export const GOAL_FEASIBILITY = Object.freeze([
  'FEASIBLE',
  'PARTIALLY_FEASIBLE',
  'CURRENTLY_INFEASIBLE',
  'INSUFFICIENT_DATA',
  'UNKNOWN',
]);

export const GOAL_CONFLICT_TYPES = Object.freeze([
  'RESOURCE_CONFLICT',
  'PRIORITY_CONFLICT',
  'TIMELINE_CONFLICT',
  'PERSONAL_VS_BUSINESS',
  'NONE',
]);

export const GOAL_RISK_TYPES = Object.freeze([
  'INSUFFICIENT_DATA',
  'UNREALISTIC_TARGET',
  'MISSING_RESOURCES',
  'DEPENDENCY_CASCADE',
  'CONFLICTING_GOALS',
  'NONE',
]);

export const GOAL_DIAGNOSTICS = Object.freeze([
  'GOAL_DETECTED',
  'GOAL_NOT_DETECTED',
  'GOAL_EXPLICIT',
  'GOAL_IMPLICIT',
  'GOAL_AMBIGUOUS',
  'GOAL_TYPE_IDENTIFIED',
  'GOAL_TYPE_UNKNOWN',
  'GOAL_COMPLETE',
  'GOAL_INCOMPLETE',
  'TARGET_AMOUNT_AVAILABLE',
  'TARGET_AMOUNT_MISSING',
  'TARGET_DATE_AVAILABLE',
  'TARGET_DATE_MISSING',
  'SNAPSHOT_AVAILABLE',
  'SNAPSHOT_MISSING',
  'MEMORY_AVAILABLE',
  'MEMORY_MISSING',
  'DEPENDENCIES_SATISFIED',
  'DEPENDENCIES_PENDING',
  'NO_CONFLICTS_DETECTED',
  'CONFLICTS_DETECTED',
  'RISKS_DETECTED',
  'NO_RISKS_DETECTED',
  'SHADOW_ONLY',
  'PROGRESS_ESTIMATED',
  'PROGRESS_INSUFFICIENT_DATA',
  'NEXT_STEP_SUGGESTED',
  'PERSONAL_WORKSPACE',
  'BUSINESS_WORKSPACE',
  'MULTIPLE_GOALS_DETECTED',
]);

export const GOAL_SUGGESTIONS = Object.freeze([
  'ASK_TARGET_AMOUNT',
  'ASK_TARGET_DATE',
  'ASK_HORIZON',
  'CONSULT_FINANCIAL_SNAPSHOT',
  'ASK_INCOME_SOURCE',
  'ASK_DEBT_CONTEXT',
  'ASK_INVESTMENT_PREFERENCE',
  'ASK_BUDGET_CONSTRAINTS',
  'ASK_BUSINESS_CONTEXT',
  'CLARIFY_GOAL_TYPE',
  'CLARIFY_GOAL_AMBIGUITY',
  'SEPARATE_PERSONAL_BUSINESS',
  'RESOLVE_CONFLICT',
  'MITIGATE_RISK',
  'REFINE_TARGET',
  'ESTABLISH_MILESTONES',
  'WAIT_FOR_USER',
  'NO_ACTION',
]);

export const GOAL_NEXT_STEPS = Object.freeze([
  'REQUEST_TARGET_DETAILS',
  'REQUEST_HORIZON',
  'REQUEST_INCOME_CONTEXT',
  'REQUEST_SNAPSHOT',
  'RESOLVE_AMBIGUITY',
  'WAIT_FOR_MORE_INFORMATION',
  'MONITOR_PROGRESS',
  'REFINE_GOAL',
  'NO_ACTION',
]);

export const GOAL_CONFIDENCE_BANDS = Object.freeze([
  { label: 'insufficient', min: 0.0, max: 0.24 },
  { label: 'low', min: 0.25, max: 0.49 },
  { label: 'moderate', min: 0.5, max: 0.69 },
  { label: 'high', min: 0.7, max: 0.89 },
  { label: 'very_high', min: 0.9, max: 1.0 },
]);

export const GOAL_PROGRESS_BANDS = Object.freeze([
  { label: 'not_started', min: 0, max: 0 },
  { label: 'early', min: 1, max: 24 },
  { label: 'steady', min: 25, max: 49 },
  { label: 'advanced', min: 50, max: 74 },
  { label: 'nearing_completion', min: 75, max: 99 },
  { label: 'inferred_complete', min: 100, max: 100 },
]);

function includes(list, value) {
  return list.includes(value);
}

export const isValidGoalType = (v) => includes(GOAL_TYPES, v);
export const isValidGoalStatus = (v) => includes(GOAL_STATUSES, v);
export const isValidGoalHorizon = (v) => includes(GOAL_HORIZONS, v);
export const isValidGoalPriority = (v) => includes(GOAL_PRIORITIES, v);
export const isValidGoalFeasibility = (v) => includes(GOAL_FEASIBILITY, v);
export const isValidGoalConflictType = (v) => includes(GOAL_CONFLICT_TYPES, v);
export const isValidGoalRiskType = (v) => includes(GOAL_RISK_TYPES, v);
export const isValidGoalDiagnostic = (v) => includes(GOAL_DIAGNOSTICS, v);
export const isValidGoalSuggestion = (v) => includes(GOAL_SUGGESTIONS, v);
export const isValidGoalNextStep = (v) => includes(GOAL_NEXT_STEPS, v);

export function describeGoalConfidence(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'insufficient';
  for (const band of GOAL_CONFIDENCE_BANDS) {
    if (value >= band.min && value <= band.max) return band.label;
  }
  return 'insufficient';
}

export function describeGoalProgress(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'not_started';
  for (const band of GOAL_PROGRESS_BANDS) {
    if (value >= band.min && value <= band.max) return band.label;
  }
  return 'not_started';
}