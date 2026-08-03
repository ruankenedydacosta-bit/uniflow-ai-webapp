// Uni Engine — Decision Readiness: contratos (Parte 3).
//
// Snapshot de prontidão estritamente observacional. Garantias absolutas:
//   - legacyPreserved SEMPRE true e applied SEMPRE false (nada é aplicado);
//   - shadowMode true por padrão (nada sai da sombra nesta parte);
//   - SOMENTE em memória: serializável, congelado e determinístico;
//   - nenhum texto, ID, valor ou memória é embedado.
import { isSerializableValue } from '../uniEngineContracts.js';
import {
  READINESS_VERSION,
  isReadinessMode,
  isReadinessNextStep,
  isActivationReadinessStatus,
} from './readinessTypes.js';
import { READINESS_POLICY } from './readinessPolicy.js';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Congela em profundidade. Reentrante e idempotente: objetos já congelados
// não são varridos de novo (evita loops em DAGs compartilhados).
export function deepFreeze(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item);
    return Object.freeze(value);
  }
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}

function sanitizeCapabilityList(list, max) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const result = [];
  for (const item of list) {
    if (typeof item === 'string' && !seen.has(item)) {
      seen.add(item);
      result.push(item);
      if (result.length >= max) break;
    }
  }
  return result.sort();
}

function sanitizeBlockedList(list, max) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const result = [];
  for (const item of list) {
    if (!isPlainObject(item)) continue;
    const capability = typeof item.capability === 'string' ? item.capability : null;
    if (!capability || seen.has(capability)) continue;
    seen.add(capability);
    result.push({
      capability,
      reason: typeof item.reason === 'string' ? item.reason : 'BLOCKED_BY_ACTIVATION',
    });
    if (result.length >= max) break;
  }
  return result;
}

function sanitizeStringList(list, max) {
  if (!Array.isArray(list)) return [];
  const result = [];
  const seen = new Set();
  for (const item of list) {
    if (typeof item === 'string' && !seen.has(item)) {
      seen.add(item);
      result.push(item);
      if (result.length >= max) break;
    }
  }
  return result;
}

function sanitizeActivationReadiness(value) {
  const safe = isPlainObject(value) ? value : {};
  return {
    status: isActivationReadinessStatus(safe.status) ? safe.status : 'NOT_EVALUATED',
    activeCount: Number.isFinite(safe.activeCount) ? safe.activeCount : 0,
    eligibleCount: Number.isFinite(safe.eligibleCount) ? safe.eligibleCount : 0,
    shadowCount: Number.isFinite(safe.shadowCount) ? safe.shadowCount : 0,
    blockedCount: Number.isFinite(safe.blockedCount) ? safe.blockedCount : 0,
    errorCount: Number.isFinite(safe.errorCount) ? safe.errorCount : 0,
    decisionsCount: Number.isFinite(safe.decisionsCount) ? safe.decisionsCount : 0,
  };
}

function sanitizeCircuitBreaker(value) {
  const safe = isPlainObject(value) ? value : {};
  return {
    open: Boolean(safe.open),
    openCapabilities: sanitizeStringList(safe.openCapabilities, 16),
  };
}

const METADATA_ALLOWED_KEYS = Object.freeze([
  'sources',
  'recommendedCount',
  'eligibleCount',
  'blockedCount',
  'decisionType',
  'activationReadinessStatus',
  'environment',
]);

function sanitizeMetadata(value) {
  if (!isPlainObject(value)) return {};
  const sanitized = {};
  for (const key of METADATA_ALLOWED_KEYS) {
    const item = value[key];
    if (item === undefined || item === null) continue;
    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
      sanitized[key] = item;
    } else if (Array.isArray(item)) {
      const list = item.filter((entry) => typeof entry === 'string').slice(0, 8);
      if (list.length > 0) sanitized[key] = list;
    }
  }
  return sanitized;
}

export function createEmptyReadinessSnapshot(options = {}) {
  const safe = isPlainObject(options) ? options : {};
  return deepFreeze({
    version: READINESS_VERSION,
    mode: 'observational',
    enabled: false,
    shadowMode: Boolean(safe.shadowMode ?? true),
    decisionAvailable: false,
    decisionStatus: 'UNKNOWN',
    recommendedCapabilities: [],
    eligibleCapabilities: [],
    blockedCapabilities: [],
    missingInformation: [],
    confidence: 0,
    confidenceBand: 'very_low',
    risk: 'NONE',
    activationReadiness: {
      status: 'NOT_EVALUATED',
      activeCount: 0,
      eligibleCount: 0,
      shadowCount: 0,
      blockedCount: 0,
      errorCount: 0,
      decisionsCount: 0,
    },
    circuitBreakerStatus: { open: false, openCapabilities: [] },
    recommendedNextStep: 'OBSERVE_ONLY',
    diagnostics: [],
    metadata: { sources: [] },
    legacyPreserved: true,
    applied: false,
    serializable: true,
  });
}

export function createReadinessSnapshot(options = {}) {
  const safe = isPlainObject(options) ? options : {};
  const snapshot = {
    version: READINESS_VERSION,
    mode: 'observational',
    enabled: Boolean(safe.enabled),
    shadowMode: safe.shadowMode !== false,
    decisionAvailable: Boolean(safe.decisionAvailable),
    decisionStatus: typeof safe.decisionStatus === 'string' ? safe.decisionStatus : 'UNKNOWN',
    recommendedCapabilities: sanitizeCapabilityList(
      safe.recommendedCapabilities,
      READINESS_POLICY.maxRecommendedCapabilities,
    ),
    eligibleCapabilities: sanitizeCapabilityList(
      safe.eligibleCapabilities,
      READINESS_POLICY.maxEligibleCapabilities,
    ),
    blockedCapabilities: sanitizeBlockedList(
      safe.blockedCapabilities,
      READINESS_POLICY.maxBlockedCapabilities,
    ),
    missingInformation: sanitizeStringList(
      safe.missingInformation,
      READINESS_POLICY.maxMissingInformation,
    ),
    confidence: clamp01(safe.confidence),
    confidenceBand: typeof safe.confidenceBand === 'string' ? safe.confidenceBand : 'very_low',
    risk: typeof safe.risk === 'string' ? safe.risk : 'NONE',
    activationReadiness: sanitizeActivationReadiness(safe.activationReadiness),
    circuitBreakerStatus: sanitizeCircuitBreaker(safe.circuitBreakerStatus),
    recommendedNextStep: isReadinessNextStep(safe.recommendedNextStep)
      ? safe.recommendedNextStep
      : 'EVALUATE_CONTEXT',
    diagnostics: Array.isArray(safe.diagnostics) ? safe.diagnostics.slice(0, READINESS_POLICY.maxDiagnostics) : [],
    metadata: sanitizeMetadata(safe.metadata),
    legacyPreserved: true,
    applied: false,
    serializable: true,
  };
  return deepFreeze(snapshot);
}

function clamp01(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function validateReadinessSnapshot(snapshot) {
  if (!isPlainObject(snapshot)) {
    return { valid: false, errors: ['SNAPSHOT_NOT_OBJECT'] };
  }
  const errors = [];
  if (snapshot.version !== READINESS_VERSION) errors.push('VERSION_INVALID');
  if (!isReadinessMode(snapshot.mode) || snapshot.mode !== 'observational') {
    errors.push('MODE_NOT_OBSERVATIONAL');
  }
  if (typeof snapshot.enabled !== 'boolean') errors.push('ENABLED_INVALID');
  if (typeof snapshot.shadowMode !== 'boolean') errors.push('SHADOW_MODE_INVALID');
  if (typeof snapshot.decisionAvailable !== 'boolean') errors.push('DECISION_AVAILABLE_INVALID');
  if (typeof snapshot.decisionStatus !== 'string') errors.push('DECISION_STATUS_INVALID');
  if (!Array.isArray(snapshot.recommendedCapabilities)) errors.push('RECOMMENDED_NOT_ARRAY');
  if (!Array.isArray(snapshot.eligibleCapabilities)) errors.push('ELIGIBLE_NOT_ARRAY');
  if (!Array.isArray(snapshot.blockedCapabilities)) errors.push('BLOCKED_NOT_ARRAY');
  if (!Array.isArray(snapshot.missingInformation)) errors.push('MISSING_INFO_NOT_ARRAY');
  if (typeof snapshot.confidence !== 'number' || snapshot.confidence < 0 || snapshot.confidence > 1) {
    errors.push('CONFIDENCE_INVALID');
  }
  if (typeof snapshot.confidenceBand !== 'string') errors.push('CONFIDENCE_BAND_INVALID');
  if (typeof snapshot.risk !== 'string') errors.push('RISK_INVALID');
  if (!isPlainObject(snapshot.activationReadiness)) errors.push('ACTIVATION_READINESS_INVALID');
  if (!isActivationReadinessStatus(snapshot.activationReadiness?.status)) {
    errors.push('ACTIVATION_READINESS_STATUS_INVALID');
  }
  if (!isPlainObject(snapshot.circuitBreakerStatus)) errors.push('CIRCUIT_BREAKER_INVALID');
  if (typeof snapshot.circuitBreakerStatus?.open !== 'boolean') errors.push('CIRCUIT_OPEN_INVALID');
  if (!isReadinessNextStep(snapshot.recommendedNextStep)) errors.push('NEXT_STEP_INVALID');
  if (!Array.isArray(snapshot.diagnostics)) errors.push('DIAGNOSTICS_NOT_ARRAY');
  if (!isPlainObject(snapshot.metadata)) errors.push('METADATA_INVALID');
  if (snapshot.legacyPreserved !== true) errors.push('LEGACY_PRESERVED_FALSE');
  if (snapshot.applied !== false) errors.push('APPLIED_NOT_FALSE');
  if (snapshot.serializable !== true) errors.push('SERIALIZABLE_FALSE');
  if (!isSerializableValue(snapshot)) errors.push('SNAPSHOT_NOT_SERIALIZABLE');
  return { valid: errors.length === 0, errors };
}

export function isReadinessSnapshotSerializable(snapshot) {
  return isPlainObject(snapshot) && isSerializableValue(snapshot);
}
