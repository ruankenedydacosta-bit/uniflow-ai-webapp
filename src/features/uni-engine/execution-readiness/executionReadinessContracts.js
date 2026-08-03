// Uni Engine — Execution Readiness: contratos (Parte 4, Bloco 2).
//
// Snapshot de prontidão de execução estritamente observacional. Garantias
// absolutas:
//   - legacyPreserved SEMPRE true e applied SEMPRE false (nada é executado);
//   - shadowMode true por padrão (nada sai da sombra nesta parte);
//   - SOMENTE em memória: serializável, congelado, determinístico, sem
//     funções, sem Map/Set e sem referências circulares;
//   - nenhum texto, ID, valor ou memória é embedado.
import { isSerializableValue } from '../uniEngineContracts.js';
import {
  EXECUTION_READINESS_VERSION,
  isExecutionReadinessMode,
  isExecutionBlockReason,
  isExecutionRisk,
  isExecutionRecommendation,
} from './executionReadinessTypes.js';
import { EXECUTION_READINESS_POLICY } from './executionReadinessPolicy.js';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Congela em profundidade. Reentrante e idempotente.
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

function sanitizeStringList(list, max) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const result = [];
  for (const item of list) {
    if (typeof item === 'string' && item && !seen.has(item)) {
      seen.add(item);
      result.push(item);
      if (result.length >= max) break;
    }
  }
  return result.sort();
}

const METADATA_ALLOWED_KEYS = Object.freeze([
  'sources',
  'blockedReasonCount',
  'requiredCapabilityCount',
  'missingRequirementCount',
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

export function createEmptyExecutionReadinessSnapshot(options = {}) {
  const safe = isPlainObject(options) ? options : {};
  return deepFreeze({
    version: EXECUTION_READINESS_VERSION,
    mode: 'observational',
    enabled: false,
    shadowMode: Boolean(safe.shadowMode ?? true),
    executionAvailable: false,
    executionBlockedReasons: [],
    executionConfidence: 0,
    requiredCapabilities: [],
    missingRequirements: [],
    executionRisk: 'NONE',
    executionRecommendation: 'OBSERVE_ONLY',
    diagnostics: [],
    metadata: { sources: [] },
    legacyPreserved: true,
    applied: false,
    serializable: true,
  });
}

export function createExecutionReadinessSnapshot(options = {}) {
  const safe = isPlainObject(options) ? options : {};
  const blockedReasons = Array.isArray(safe.executionBlockedReasons)
    ? safe.executionBlockedReasons.filter((reason) => isExecutionBlockReason(reason))
    : [];

  const snapshot = {
    version: EXECUTION_READINESS_VERSION,
    mode: 'observational',
    enabled: Boolean(safe.enabled),
    shadowMode: safe.shadowMode !== false,
    executionAvailable: Boolean(safe.executionAvailable),
    executionBlockedReasons: [...new Set(blockedReasons)].sort(),
    executionConfidence: typeof safe.executionConfidence === 'number'
      ? Math.min(1, Math.max(0, safe.executionConfidence))
      : 0,
    requiredCapabilities: sanitizeStringList(
      safe.requiredCapabilities,
      EXECUTION_READINESS_POLICY.maxRequiredCapabilities,
    ),
    missingRequirements: sanitizeStringList(
      safe.missingRequirements,
      EXECUTION_READINESS_POLICY.maxMissingRequirements,
    ),
    executionRisk: isExecutionRisk(safe.executionRisk) ? safe.executionRisk : 'NONE',
    executionRecommendation: isExecutionRecommendation(safe.executionRecommendation)
      ? safe.executionRecommendation
      : 'OBSERVE_ONLY',
    diagnostics: Array.isArray(safe.diagnostics)
      ? safe.diagnostics.slice(0, EXECUTION_READINESS_POLICY.maxDiagnostics)
      : [],
    metadata: sanitizeMetadata(safe.metadata),
    legacyPreserved: true,
    applied: false,
    serializable: true,
  };
  return deepFreeze(snapshot);
}

export function validateExecutionReadinessSnapshot(snapshot) {
  if (!isPlainObject(snapshot)) {
    return { valid: false, errors: ['SNAPSHOT_NOT_OBJECT'] };
  }
  const errors = [];
  if (snapshot.version !== EXECUTION_READINESS_VERSION) errors.push('VERSION_INVALID');
  if (!isExecutionReadinessMode(snapshot.mode) || snapshot.mode !== 'observational') {
    errors.push('MODE_NOT_OBSERVATIONAL');
  }
  if (typeof snapshot.enabled !== 'boolean') errors.push('ENABLED_INVALID');
  if (typeof snapshot.shadowMode !== 'boolean') errors.push('SHADOW_MODE_INVALID');
  if (typeof snapshot.executionAvailable !== 'boolean') errors.push('EXECUTION_AVAILABLE_INVALID');
  if (!Array.isArray(snapshot.executionBlockedReasons)) errors.push('BLOCKED_REASONS_NOT_ARRAY');
  if (typeof snapshot.executionConfidence !== 'number' || snapshot.executionConfidence < 0 || snapshot.executionConfidence > 1) {
    errors.push('EXECUTION_CONFIDENCE_INVALID');
  }
  if (!Array.isArray(snapshot.requiredCapabilities)) errors.push('REQUIRED_CAPABILITIES_NOT_ARRAY');
  if (!Array.isArray(snapshot.missingRequirements)) errors.push('MISSING_REQUIREMENTS_NOT_ARRAY');
  if (!isExecutionRisk(snapshot.executionRisk)) errors.push('EXECUTION_RISK_INVALID');
  if (!isExecutionRecommendation(snapshot.executionRecommendation)) {
    errors.push('EXECUTION_RECOMMENDATION_INVALID');
  }
  if (!Array.isArray(snapshot.diagnostics)) errors.push('DIAGNOSTICS_NOT_ARRAY');
  if (!isPlainObject(snapshot.metadata)) errors.push('METADATA_INVALID');
  if (snapshot.legacyPreserved !== true) errors.push('LEGACY_PRESERVED_FALSE');
  if (snapshot.applied !== false) errors.push('APPLIED_NOT_FALSE');
  if (snapshot.serializable !== true) errors.push('SERIALIZABLE_FALSE');
  if (!isSerializableValue(snapshot)) errors.push('SNAPSHOT_NOT_SERIALIZABLE');
  return { valid: errors.length === 0, errors };
}

export function isExecutionReadinessSnapshotSerializable(snapshot) {
  return isPlainObject(snapshot) && isSerializableValue(snapshot);
}
