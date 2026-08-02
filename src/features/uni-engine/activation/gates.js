// Activation Engine — gates independentes e auditáveis (Fase 9).
//
// Cada gate é uma função pura: entrada → { name, passed, reasonCode,
// severity, metadata }. Nunca contém dados sensíveis no metadata.
import { createActivationGate } from './activationContracts.js';
import { ACTIVATION_POLICY, clampRolloutPercent } from './activationPolicy.js';
import { isRiskAllowed } from './activationPolicy.js';
import { computeRolloutBucket } from './activationContracts.js';
import {
  isCapabilityForbidden,
  isCapabilityEligible,
} from './capabilityRegistry.js';
import { ACTIVATION_ENVIRONMENTS } from './activationTypes.js';

export function gateEngineEnabled(options = {}) {
  const safe = options ?? {};
  return createActivationGate({
    name: 'ENGINE_ENABLED',
    passed: Boolean(safe.engineEnabled),
    reasonCode: safe.engineEnabled ? 'ENGINE_ENABLED' : 'ENGINE_DISABLED',
    severity: safe.engineEnabled ? 'none' : 'critical',
    metadata: {},
  });
}

export function gateActivationEnabled(options = {}) {
  const safe = options ?? {};
  return createActivationGate({
    name: 'ACTIVATION_ENABLED',
    passed: Boolean(safe.activationEnabled),
    reasonCode: safe.activationEnabled ? 'ACTIVATION_ENABLED' : 'ACTIVATION_DISABLED',
    severity: safe.activationEnabled ? 'none' : 'critical',
    metadata: {},
  });
}

export function gateCapabilityEnabled(options = {}) {
  const safe = options ?? {};
  const passed = Boolean(safe.capabilityEnabled);
  return createActivationGate({
    name: 'CAPABILITY_ENABLED',
    passed,
    reasonCode: passed ? 'CAPABILITY_ENABLED' : 'CAPABILITY_DISABLED',
    severity: passed ? 'none' : 'medium',
    metadata: { capability: safe.capability ?? null },
  });
}

export function gateEnvironmentAllowed(options = {}) {
  const safe = options ?? {};
  const environment = ACTIVATION_ENVIRONMENTS.includes(safe.environment)
    ? safe.environment
    : 'unknown';
  const allowed = Array.isArray(safe.allowedEnvironments)
    ? safe.allowedEnvironments
    : ACTIVATION_POLICY.defaultAllowedEnvironments;
  const passed = allowed.includes(environment);
  return createActivationGate({
    name: 'ENVIRONMENT_ALLOWED',
    passed,
    reasonCode: passed ? 'ENVIRONMENT_ALLOWED' : 'ENVIRONMENT_BLOCKED',
    severity: passed ? 'none' : 'high',
    metadata: { environment },
  });
}

export function gateTestUserAllowed(options = {}) {
  const safe = options ?? {};
  const testUserIds = Array.isArray(safe.testUserIds) ? safe.testUserIds : [];
  const userId = typeof safe.userId === 'string' ? safe.userId : null;
  const passed = userId !== null && testUserIds.includes(userId);
  return createActivationGate({
    name: 'TEST_USER_ALLOWED',
    passed,
    reasonCode: passed ? 'TEST_USER_ALLOWED' : 'TEST_USER_NOT_IN_COHORT',
    severity: passed ? 'none' : 'low',
    metadata: { hasIdentity: Boolean(userId), inCohort: passed },
  });
}

export function gatePercentageRollout(options = {}) {
  const safe = options ?? {};
  const percent = clampRolloutPercent(safe.percent);
  const identity = typeof safe.identity === 'string' ? safe.identity : null;
  const bucket = computeRolloutBucket(identity);
  const passed = percent > 0 && percent < 100 && bucket !== null && bucket < percent;
  return createActivationGate({
    name: 'PERCENTAGE_ROLLOUT',
    passed,
    reasonCode: passed
      ? 'ROLLOUT_INCLUDED'
      : percent === 0
        ? 'ROLLOUT_PERCENT_ZERO'
        : percent >= 100
          ? 'FULL_ROLLOUT_BLOCKED_BY_POLICY'
          : bucket === null
            ? 'ROLLOUT_NO_IDENTITY'
            : 'ROLLOUT_EXCLUDED',
    severity: 'none',
    metadata: { percent, bucket },
  });
}

export function gateConfidenceThreshold(options = {}) {
  const safe = options ?? {};
  const threshold = typeof safe.threshold === 'number' ? safe.threshold : ACTIVATION_POLICY.defaultConfidenceThreshold;
  const confidence = typeof safe.confidence === 'number' && Number.isFinite(safe.confidence)
    ? safe.confidence
    : null;
  const passed = confidence !== null && confidence >= threshold;
  return createActivationGate({
    name: 'CONFIDENCE_THRESHOLD',
    passed,
    reasonCode: passed
      ? 'CONFIDENCE_OK'
      : confidence === null
        ? 'CONFIDENCE_MISSING'
        : 'CONFIDENCE_BELOW_THRESHOLD',
    severity: passed ? 'none' : 'medium',
    metadata: {},
  });
}

export function gateRiskThreshold(options = {}) {
  const safe = options ?? {};
  const risk = typeof safe.risk === 'string' ? safe.risk : null;
  const passed = risk !== null && isRiskAllowed(risk);
  return createActivationGate({
    name: 'RISK_THRESHOLD',
    passed,
    reasonCode: passed
      ? 'RISK_OK'
      : risk === null
        ? 'RISK_MISSING'
        : 'RISK_EXCEEDS_POLICY',
    severity: passed ? 'none' : 'high',
    metadata: { risk },
  });
}

export function gateWorkspaceCompatible(options = {}) {
  const safe = options ?? {};
  const workspaceType = typeof safe.workspaceType === 'string' ? safe.workspaceType : null;
  const allowed = Array.isArray(safe.allowedWorkspaceTypes)
    ? safe.allowedWorkspaceTypes
    : ACTIVATION_POLICY.allowedWorkspaceTypes;
  const passed = workspaceType !== null && allowed.includes(workspaceType);
  return createActivationGate({
    name: 'WORKSPACE_COMPATIBLE',
    passed,
    reasonCode: passed
      ? 'WORKSPACE_OK'
      : workspaceType === null
        ? 'WORKSPACE_MISSING'
        : 'WORKSPACE_NOT_ALLOWED',
    severity: passed ? 'none' : 'medium',
    metadata: { workspaceType },
  });
}

export function gateDataSufficiency(options = {}) {
  const safe = options ?? {};
  const required = ACTIVATION_POLICY.dataSufficiencyRequired;
  const hasData = Boolean(safe.dataSufficient);
  const passed = !required || hasData;
  return createActivationGate({
    name: 'DATA_SUFFICIENCY',
    passed,
    reasonCode: passed ? 'DATA_OK' : 'DATA_INSUFFICIENT',
    severity: passed ? 'none' : 'medium',
    metadata: { required },
  });
}

export function gateCapabilityPolicy(options = {}) {
  const safe = options ?? {};
  const capability = safe.capability ?? null;
  const forbidden = isCapabilityForbidden(capability);
  const eligible = isCapabilityEligible(capability);
  const passed = !forbidden && eligible;
  return createActivationGate({
    name: 'CAPABILITY_POLICY',
    passed,
    reasonCode: forbidden
      ? 'CAPABILITY_FORBIDDEN_BY_POLICY'
      : !eligible
        ? 'CAPABILITY_NOT_ELIGIBLE'
        : 'CAPABILITY_ALLOWED',
    severity: forbidden ? 'critical' : passed ? 'none' : 'medium',
    metadata: { capability },
  });
}

export function gateCircuitBreaker(options = {}) {
  const safe = options ?? {};
  const capability = safe.capability ?? null;
  const isOpen = Boolean(safe.circuitOpen);
  const passed = !isOpen;
  return createActivationGate({
    name: 'CIRCUIT_BREAKER',
    passed,
    reasonCode: passed ? 'CIRCUIT_CLOSED' : 'CIRCUIT_OPEN',
    severity: passed ? 'none' : 'high',
    metadata: { capability },
  });
}

export function gateFallbackAvailability(options = {}) {
  const safe = options ?? {};
  const passed = Boolean(safe.legacyAvailable);
  return createActivationGate({
    name: 'FALLBACK_AVAILABILITY',
    passed,
    reasonCode: passed ? 'LEGACY_AVAILABLE' : 'LEGACY_UNAVAILABLE',
    severity: passed ? 'none' : 'critical',
    metadata: {},
  });
}

export const ACTIVATION_GATES = Object.freeze([
  gateEngineEnabled,
  gateActivationEnabled,
  gateCapabilityEnabled,
  gateEnvironmentAllowed,
  gateTestUserAllowed,
  gatePercentageRollout,
  gateConfidenceThreshold,
  gateRiskThreshold,
  gateWorkspaceCompatible,
  gateDataSufficiency,
  gateCapabilityPolicy,
  gateCircuitBreaker,
  gateFallbackAvailability,
]);
