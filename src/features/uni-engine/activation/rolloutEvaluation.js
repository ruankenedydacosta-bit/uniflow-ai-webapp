// Activation Engine — avaliação de rollout determinística (Fase 9).
//
// Deriva o modo de rollout a partir de percentual, identidade e ambiente.
// O bucket é sempre determinístico (mesma identidade → mesmo bucket) e o
// identificador nunca é exposto na telemetria.
import { ACTIVATION_ROLLOUT_MODES } from './activationTypes.js';
import { ACTIVATION_POLICY, clampRolloutPercent } from './activationPolicy.js';
import { computeRolloutBucket } from './activationContracts.js';

export function resolveRolloutMode(options = {}) {
  const safe = options ?? {};
  const percent = clampRolloutPercent(safe.percent);
  const environment = typeof safe.environment === 'string' ? safe.environment : 'unknown';
  const identity = typeof safe.identity === 'string' ? safe.identity : null;
  const inTestCohort = Boolean(safe.inTestCohort);
  const developmentOnly = Boolean(safe.developmentOnly);
  const manualOverride = Boolean(safe.manualOverride);
  const bucket = computeRolloutBucket(identity);

  // Rollout percentual maior/igual a 100 é bloqueado por política nesta
  // fase — FULL_ROLLOUT existe no contrato, mas permanece inativo.
  if (percent >= 100) return { mode: 'FULL_ROLLOUT', bucket, blockedByPolicy: true };

  if (inTestCohort && environment === 'development') {
    return { mode: 'TEST_USERS', bucket, blockedByPolicy: false };
  }

  if (developmentOnly && environment === 'development') {
    return { mode: 'DEVELOPMENT_ONLY', bucket, blockedByPolicy: false };
  }

  if (manualOverride) {
    return { mode: 'MANUAL_OVERRIDE', bucket, blockedByPolicy: false };
  }

  if (percent > 0 && bucket !== null && bucket < percent) {
    return { mode: 'PERCENTAGE', bucket, blockedByPolicy: false };
  }

  return { mode: 'OFF', bucket, blockedByPolicy: false };
}

export function resolveShadowRolloutMode(options = {}) {
  const safe = options ?? {};
  if (safe.shadowMode) return 'SHADOW';
  return resolveRolloutMode(safe).mode;
}

export function isValidRolloutMode(mode) {
  return ACTIVATION_ROLLOUT_MODES.includes(mode);
}

export function isRolloutActive(mode) {
  return mode === 'TEST_USERS'
    || mode === 'DEVELOPMENT_ONLY'
    || mode === 'MANUAL_OVERRIDE'
    || mode === 'PERCENTAGE';
}

export function isRolloutBlockedByPolicy(mode) {
  return mode === 'FULL_ROLLOUT';
}

export function getRolloutModeOrder() {
  return Object.freeze([...ACTIVATION_ROLLOUT_MODES]);
}

export function getRolloutPolicy() {
  return {
    defaultPercent: ACTIVATION_POLICY.defaultRolloutPercent,
    maxPercent: ACTIVATION_POLICY.maxRolloutPercent,
    fullRolloutBlocked: ACTIVATION_POLICY.fullRolloutBlocked,
  };
}
