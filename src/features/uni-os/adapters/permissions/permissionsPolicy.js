export const PERMISSIONS_STATUSES = Object.freeze([
  'AUTHORIZED',
  'AUTHORIZED_WITH_CONFIRMATION',
  'NOT_AUTHORIZED',
  'UNKNOWN',
]);

export const COGNITIVE_SCOPES = Object.freeze([
  'READ_CONTEXT',
  'READ_MEMORY',
  'READ_CONVERSATION',
  'PROPOSE_FINANCIAL_ACTION',
  'REQUEST_CONFIRMATION',
  'READ_PROFILE',
]);

export const PERMISSION_RESTRICTIONS = Object.freeze([
  'CONFIRMATION_REQUIRED',
  'LOW_CONFIDENCE',
  'AMBIGUITY_PRESENT',
  'UNKNOWN_PERMISSION',
  'HIGH_RISK',
  'REQUIRED_DATA_MISSING',
  'CONTEXT_CONFLICT',
  'STRUCTURAL_CONFLICT',
  'SECURITY_BLOCKED',
]);

export const PERMISSION_REASONS = Object.freeze([
  'SECURITY_ALLOWED',
  'SECURITY_CONFIRMATION_REQUIRED',
  'SECURITY_BLOCKED',
  'SECURITY_PERMISSION_UNKNOWN',
  'SECURITY_DECISION_MISSING',
]);

const ACTION_STEPS = new Set([
  'create_account_candidate',
  'reactivate_account_candidate',
  'persist_transaction',
]);

export function resolveCognitiveScopes(input = {}) {
  const scopes = [];
  if (input.parsedIntent?.intent) scopes.push('READ_CONVERSATION');
  if (input.contextSnapshot?.metadata?.version) scopes.push('READ_CONTEXT');
  if (input.contextSnapshot?.user?.id) scopes.push('READ_PROFILE');
  if (input.memorySnapshot?.metadata?.version) scopes.push('READ_MEMORY');
  const steps = Array.isArray(input.planningSnapshot?.steps) ? input.planningSnapshot.steps : [];
  if (steps.some((step) => ACTION_STEPS.has(step?.type))) scopes.push('PROPOSE_FINANCIAL_ACTION');
  if (input.securitySnapshot?.confirmationRequired === true) scopes.push('REQUEST_CONFIRMATION');
  return scopes;
}

export function resolvePermissionStatus(securitySnapshot = {}) {
  if (!securitySnapshot?.metadata?.version) return 'UNKNOWN';
  if (securitySnapshot.status === 'ALLOW') return 'AUTHORIZED';
  if (securitySnapshot.status === 'ALLOW_WITH_CONFIRMATION') {
    return 'AUTHORIZED_WITH_CONFIRMATION';
  }
  const reasons = Array.isArray(securitySnapshot.reasons) ? securitySnapshot.reasons : [];
  if (securitySnapshot.status === 'BLOCK' && reasons.length === 1
      && reasons[0] === 'PERMISSION_UNKNOWN') {
    return 'UNKNOWN';
  }
  return securitySnapshot.status === 'BLOCK' ? 'NOT_AUTHORIZED' : 'UNKNOWN';
}
