// Activation Engine — contratos puros (Fase 9).
//
// Formas de dados serializáveis e determinísticas de toda a decisão de
// ativação. Nenhum contrato contém funções, IDs, textos ou dados sensíveis.
import { ACTIVATION_POLICY, clampRolloutPercent } from './activationPolicy.js';
import {
  isValidActivationCapability,
  isValidActivationEnvironment,
  isValidActivationGateName,
  isValidActivationRolloutMode,
  isValidActivationStatus,
} from './activationTypes.js';

export const ACTIVATION_VERSION = '1.0';

export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Hash determinístico (djb2) — nunca usado para identificar o usuário; apenas
// para derivar um bucket de rollout entre 0 e 99.
export function djb2(value) {
  const text = typeof value === 'string' ? value : String(value ?? '');
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function computeRolloutBucket(identity) {
  if (typeof identity !== 'string' || !identity.trim()) return null;
  return djb2(identity.trim()) % 100;
}

export function createActivationGate(options = {}) {
  const safe = options && typeof options === 'object' ? options : {};
  return {
    name: isValidActivationGateName(safe.name) ? safe.name : 'UNKNOWN',
    passed: Boolean(safe.passed),
    reasonCode: typeof safe.reasonCode === 'string' ? safe.reasonCode : null,
    severity: typeof safe.severity === 'string' ? safe.severity : 'none',
    metadata: isPlainObject(safe.metadata) ? safe.metadata : {},
  };
}

export function createActivationShadow(options = {}) {
  const safe = options && typeof options === 'object' ? options : {};
  return {
    shadowMode: Boolean(safe.shadowMode),
    appliedToDecision: Boolean(safe.appliedToDecision),
    appliedToResponse: Boolean(safe.appliedToResponse),
    executed: Boolean(safe.executed),
    persisted: Boolean(safe.persisted),
    changedBehavior: Boolean(safe.changedBehavior),
    memoryModified: Boolean(safe.memoryModified),
    databaseCalled: Boolean(safe.databaseCalled),
    voiceTouched: Boolean(safe.voiceTouched),
  };
}

export function createEmptyActivationDecision(options = {}) {
  const safe = options && typeof options === 'object' ? options : {};
  return {
    version: ACTIVATION_VERSION,
    enabled: Boolean(safe.enabled),
    shadowMode: Boolean(safe.shadowMode),
    environment: isValidActivationEnvironment(safe.environment)
      ? safe.environment
      : 'unknown',
    capability: isValidActivationCapability(safe.capability)
      ? safe.capability
      : 'UNKNOWN',
    requested: Boolean(safe.requested),
    eligible: false,
    activationStatus: 'DISABLED',
    rolloutMode: 'OFF',
    rolloutBucket: null,
    confidence: null,
    confidenceThreshold: ACTIVATION_POLICY.defaultConfidenceThreshold,
    risk: null,
    workspaceType: null,
    dataSufficient: false,
    gates: [],
    applied: false,
    appliedEffect: null,
    fallbackUsed: true,
    fallbackReason: 'ACTIVATION_DISABLED',
    comparison: null,
    diagnostics: [],
    telemetry: null,
    shadow: createActivationShadow({ shadowMode: safe.shadowMode }),
    latencyMs: typeof safe.latencyMs === 'number' ? Number(safe.latencyMs.toFixed(2)) : null,
  };
}

export function createActivationDecision(options = {}) {
  const safe = options && typeof options === 'object' ? options : {};
  const shadow = createActivationShadow(safe.shadow ?? {});
  return {
    version: ACTIVATION_VERSION,
    enabled: Boolean(safe.enabled),
    shadowMode: Boolean(safe.shadowMode),
    environment: isValidActivationEnvironment(safe.environment)
      ? safe.environment
      : 'unknown',
    capability: isValidActivationCapability(safe.capability)
      ? safe.capability
      : 'UNKNOWN',
    requested: Boolean(safe.requested),
    eligible: Boolean(safe.eligible),
    activationStatus: isValidActivationStatus(safe.activationStatus)
      ? safe.activationStatus
      : 'UNKNOWN',
    rolloutMode: isValidActivationRolloutMode(safe.rolloutMode)
      ? safe.rolloutMode
      : 'UNKNOWN',
    rolloutBucket:
      typeof safe.rolloutBucket === 'number' && Number.isFinite(safe.rolloutBucket)
        ? clampRolloutPercent(safe.rolloutBucket)
        : null,
    confidence:
      typeof safe.confidence === 'number' && Number.isFinite(safe.confidence)
        ? safe.confidence
        : null,
    confidenceThreshold:
      typeof safe.confidenceThreshold === 'number'
        && Number.isFinite(safe.confidenceThreshold)
        ? safe.confidenceThreshold
        : ACTIVATION_POLICY.defaultConfidenceThreshold,
    risk: typeof safe.risk === 'string' ? safe.risk : null,
    workspaceType: typeof safe.workspaceType === 'string' ? safe.workspaceType : null,
    dataSufficient: Boolean(safe.dataSufficient),
    gates: Array.isArray(safe.gates)
      ? safe.gates.map((gate) => createActivationGate(gate)).slice(0, ACTIVATION_POLICY.maxGates)
      : [],
    applied: Boolean(safe.applied),
    appliedEffect: isPlainObject(safe.appliedEffect) ? safe.appliedEffect : null,
    fallbackUsed: Boolean(safe.fallbackUsed),
    fallbackReason: typeof safe.fallbackReason === 'string' ? safe.fallbackReason : null,
    comparison: isPlainObject(safe.comparison) ? safe.comparison : null,
    diagnostics: Array.isArray(safe.diagnostics)
      ? safe.diagnostics.filter((item) => typeof item === 'string').slice(0, 12)
      : [],
    telemetry: isPlainObject(safe.telemetry) ? safe.telemetry : null,
    shadow,
    latencyMs:
      typeof safe.latencyMs === 'number'
        ? Number(safe.latencyMs.toFixed(2))
        : null,
  };
}

export function validateActivationDecision(decision) {
  if (!isPlainObject(decision)) {
    return { valid: false, errors: ['DECISION_NOT_OBJECT'] };
  }
  const errors = [];
  if (!isValidActivationCapability(decision.capability)) {
    errors.push('CAPABILITY_INVALID');
  }
  if (!isValidActivationStatus(decision.activationStatus)) {
    errors.push('STATUS_INVALID');
  }
  if (!isValidActivationRolloutMode(decision.rolloutMode)) {
    errors.push('ROLLOUT_MODE_INVALID');
  }
  if (!isValidActivationEnvironment(decision.environment)) {
    errors.push('ENVIRONMENT_INVALID');
  }
  if (decision.applied && !isPlainObject(decision.appliedEffect)) {
    errors.push('APPLIED_WITHOUT_EFFECT');
  }
  if (decision.shadow?.executed) {
    errors.push('SHADOW_EXECUTED_FORBIDDEN');
  }
  if (decision.shadow?.persisted) {
    errors.push('SHADOW_PERSISTED_FORBIDDEN');
  }
  if (decision.shadow?.memoryModified) {
    errors.push('SHADOW_MEMORY_MODIFIED_FORBIDDEN');
  }
  if (decision.shadow?.databaseCalled) {
    errors.push('SHADOW_DATABASE_CALLED_FORBIDDEN');
  }
  if (decision.shadow?.voiceTouched) {
    errors.push('SHADOW_VOICE_TOUCHED_FORBIDDEN');
  }
  return { valid: errors.length === 0, errors };
}
