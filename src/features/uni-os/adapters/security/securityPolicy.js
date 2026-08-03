export const SECURITY_STATUSES = Object.freeze([
  'ALLOW',
  'ALLOW_WITH_CONFIRMATION',
  'BLOCK',
]);

export const SECURITY_REASONS = Object.freeze([
  'LOW_CONFIDENCE',
  'AMBIGUOUS_ACCOUNT',
  'AMBIGUOUS_CATEGORY',
  'AMBIGUOUS_INTERPRETATION',
  'MISSING_ACCOUNT',
  'MISSING_CATEGORY',
  'MISSING_AMOUNT',
  'MISSING_DATE',
  'HIGH_RISK',
  'CONTEXT_CONFLICT',
  'STRUCTURAL_CONFLICT',
  'PERMISSION_UNKNOWN',
]);

export const SECURITY_WARNINGS = Object.freeze([
  'CONFIRMATION_REQUIRED',
  'REVIEW_RECOMMENDED',
]);

const ISSUE_REASON_MAP = Object.freeze({
  LOW_CONFIDENCE: 'LOW_CONFIDENCE',
  MULTIPLE_ACCOUNTS: 'AMBIGUOUS_ACCOUNT',
  MULTIPLE_CATEGORIES: 'AMBIGUOUS_CATEGORY',
  MISSING_ACCOUNT: 'MISSING_ACCOUNT',
  MISSING_CATEGORY: 'MISSING_CATEGORY',
  MISSING_AMOUNT: 'MISSING_AMOUNT',
  MISSING_DATE: 'MISSING_DATE',
  CONTEXT_WORKSPACE_CONFLICT: 'CONTEXT_CONFLICT',
  EMPTY_PLAN: 'STRUCTURAL_CONFLICT',
  PLAN_INTENT_MISMATCH: 'STRUCTURAL_CONFLICT',
  EXECUTION_NOT_BLOCKED: 'STRUCTURAL_CONFLICT',
});

const ACTION_STEP_TYPES = new Set([
  'create_account_candidate',
  'reactivate_account_candidate',
  'persist_transaction',
]);

export function mapInconsistencyReason(code) {
  return ISSUE_REASON_MAP[code] ?? 'STRUCTURAL_CONFLICT';
}

export function planningRequiresKnownPermission(planningSnapshot = {}) {
  const steps = Array.isArray(planningSnapshot.steps) ? planningSnapshot.steps : [];
  return steps.some((step) => ACTION_STEP_TYPES.has(step?.type));
}
