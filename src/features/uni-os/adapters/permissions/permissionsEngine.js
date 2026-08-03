import {
  resolveCognitiveScopes,
  resolvePermissionStatus,
} from './permissionsPolicy.js';

function addUnique(list, value) {
  if (!list.includes(value)) list.push(value);
}

function mapRestrictions(securitySnapshot, status) {
  const restrictions = [];
  const reasons = Array.isArray(securitySnapshot?.reasons) ? securitySnapshot.reasons : [];
  if (securitySnapshot?.confirmationRequired === true) {
    addUnique(restrictions, 'CONFIRMATION_REQUIRED');
  }
  if (reasons.includes('LOW_CONFIDENCE')) addUnique(restrictions, 'LOW_CONFIDENCE');
  if (reasons.some((reason) => reason.startsWith('AMBIGUOUS_'))) {
    addUnique(restrictions, 'AMBIGUITY_PRESENT');
  }
  if (reasons.includes('PERMISSION_UNKNOWN')) addUnique(restrictions, 'UNKNOWN_PERMISSION');
  if (reasons.includes('HIGH_RISK')) addUnique(restrictions, 'HIGH_RISK');
  if (reasons.some((reason) => reason.startsWith('MISSING_'))) {
    addUnique(restrictions, 'REQUIRED_DATA_MISSING');
  }
  if (reasons.includes('CONTEXT_CONFLICT')) addUnique(restrictions, 'CONTEXT_CONFLICT');
  if (reasons.includes('STRUCTURAL_CONFLICT')) addUnique(restrictions, 'STRUCTURAL_CONFLICT');
  if (status === 'NOT_AUTHORIZED' && restrictions.length === 0) {
    addUnique(restrictions, 'SECURITY_BLOCKED');
  }
  if (status === 'UNKNOWN' && restrictions.length === 0) {
    addUnique(restrictions, 'UNKNOWN_PERMISSION');
  }
  return restrictions;
}

function resolveReasons(securitySnapshot, status) {
  if (!securitySnapshot?.metadata?.version) return ['SECURITY_DECISION_MISSING'];
  if (status === 'AUTHORIZED') return ['SECURITY_ALLOWED'];
  if (status === 'AUTHORIZED_WITH_CONFIRMATION') {
    return ['SECURITY_CONFIRMATION_REQUIRED'];
  }
  if (status === 'NOT_AUTHORIZED') return ['SECURITY_BLOCKED'];
  return ['SECURITY_PERMISSION_UNKNOWN'];
}

export function evaluateCognitivePermissions(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const securitySnapshot = source.securitySnapshot ?? {};
  const status = resolvePermissionStatus(securitySnapshot);
  const scopes = resolveCognitiveScopes(source);
  const authorized = status === 'AUTHORIZED' || status === 'AUTHORIZED_WITH_CONFIRMATION';

  return {
    status,
    scopes,
    grants: authorized ? [...scopes] : [],
    restrictions: mapRestrictions(securitySnapshot, status),
    reasons: resolveReasons(securitySnapshot, status),
  };
}
