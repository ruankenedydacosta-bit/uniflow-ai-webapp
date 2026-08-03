export const ROLLOUT_VERSION = '1.0';

export const ROLLOUT_STAGES = Object.freeze([
  'ROLLOUT_OFF',
  'ROLLOUT_SHADOW',
  'ROLLOUT_INTERNAL',
  'ROLLOUT_CANARY',
  'ROLLOUT_BLOCKED',
]);

export const OPERATIONAL_STATUSES = Object.freeze([
  'OPERATIONAL_SHADOW_ONLY',
  'OPERATIONAL_INTERNAL',
  'OPERATIONAL_BLOCKED',
]);

export const ROLLOUT_SAFETY_KEYS = Object.freeze([
  'financialExecution',
  'memoryWrite',
  'learningApplied',
  'confirmationSkipped',
  'pendingActionModifiedUnsafely',
  'databaseCalled',
  'rpcCalled',
  'freeTextGenerated',
  'productionEnabled',
  'canaryEnabled',
]);

export const OPERATIONAL_METADATA_ALLOWED_KEYS = Object.freeze([
  'rolloutStage',
  'effectiveStage',
  'eligible',
  'visibleInfluenceAllowed',
  'authorizedCapabilities',
  'blockedCapabilities',
  'sameTurn',
  'environmentAllowed',
  'userAuthorized',
  'orchestratorValid',
  'readinessValid',
  'circuitBreakerClosed',
  'fallbackUsed',
  'fallbackReason',
  'readinessReport',
]);

export function isRolloutStage(value) {
  return ROLLOUT_STAGES.includes(value);
}

export function isOperationalStatus(value) {
  return OPERATIONAL_STATUSES.includes(value);
}

export function isRolloutSafetyKey(key) {
  return ROLLOUT_SAFETY_KEYS.includes(key);
}

export function isOperationalMetadataKey(key) {
  return OPERATIONAL_METADATA_ALLOWED_KEYS.includes(key);
}