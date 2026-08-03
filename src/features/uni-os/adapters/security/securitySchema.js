import {
  SECURITY_REASONS,
  SECURITY_STATUSES,
  SECURITY_WARNINGS,
} from './securityPolicy.js';

export const UNI_OS_SECURITY_SCHEMA_VERSION = '1.0';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function allowedUnique(values, allowed) {
  return Array.isArray(values)
    ? [...new Set(values.filter((value) => allowed.includes(value)))]
    : [];
}

function safeConfidence(value) {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

export function createSecurityDecision(input = {}) {
  const status = SECURITY_STATUSES.includes(input.status) ? input.status : 'BLOCK';
  return deepFreeze({
    securityId: typeof input.securityId === 'string' ? input.securityId : '',
    timestamp: typeof input.timestamp === 'string' ? input.timestamp : '',
    status,
    blocked: status === 'BLOCK',
    confirmationRequired: input.confirmationRequired === true,
    confidence: safeConfidence(input.confidence),
    risk: ['LOW', 'MEDIUM', 'HIGH'].includes(input.risk) ? input.risk : 'HIGH',
    reasons: allowedUnique(input.reasons, SECURITY_REASONS),
    warnings: allowedUnique(input.warnings, SECURITY_WARNINGS),
    executionAllowed: false,
    metadata: {
      version: UNI_OS_SECURITY_SCHEMA_VERSION,
    },
  });
}
