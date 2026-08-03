// Uni Engine — Capability Activation Readiness: contratos (Parte 4, Bloco 1).
//
// Snapshot de prontidão de ativação estritamente observacional. Garantias
// absolutas:
//   - legacyPreserved SEMPRE true e applied SEMPRE false (nada é ativado);
//   - shadowMode true por padrão (nada sai da sombra nesta parte);
//   - SOMENTE em memória: serializável, congelado, determinístico, sem
//     funções, sem Map/Set e sem referências circulares;
//   - nenhum texto, ID, valor ou memória é embedado.
import { isSerializableValue } from '../uniEngineContracts.js';
import {
  CAPABILITY_READINESS_VERSION,
  isCapabilityReadinessMode,
  isCapabilityBlockReason,
} from './capabilityReadinessTypes.js';
import { CAPABILITY_READINESS_POLICY } from './capabilityReadinessPolicy.js';

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
      reason: isCapabilityBlockReason(item.reason) ? item.reason : 'NOT_EVALUATED',
    });
    if (result.length >= max) break;
  }
  return result.sort((a, b) => a.capability.localeCompare(b.capability));
}

function sanitizeMissingDependencies(list, max) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const result = [];
  for (const item of list) {
    if (!isPlainObject(item)) continue;
    const capability = typeof item.capability === 'string' ? item.capability : null;
    if (!capability || seen.has(capability)) continue;
    seen.add(capability);
    const dependencies = sanitizeStringList(item.dependencies, 8);
    if (dependencies.length === 0) continue;
    result.push({ capability, dependencies });
    if (result.length >= max) break;
  }
  return result.sort((a, b) => a.capability.localeCompare(b.capability));
}

const METADATA_ALLOWED_KEYS = Object.freeze([
  'sources',
  'evaluatedCount',
  'eligibleCount',
  'blockedCount',
  'missingDependencyCount',
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

export function createEmptyCapabilityReadinessSnapshot(options = {}) {
  const safe = isPlainObject(options) ? options : {};
  return deepFreeze({
    version: CAPABILITY_READINESS_VERSION,
    mode: 'observational',
    enabled: false,
    shadowMode: Boolean(safe.shadowMode ?? true),
    evaluatedCapabilities: [],
    eligibleCapabilities: [],
    blockedCapabilities: [],
    missingDependencies: [],
    nextRecommendedCapability: null,
    summary: {
      evaluatedCount: 0,
      eligibleCount: 0,
      blockedCount: 0,
      missingDependencyCount: 0,
    },
    diagnostics: [],
    metadata: { sources: [] },
    legacyPreserved: true,
    applied: false,
    serializable: true,
  });
}

export function createCapabilityReadinessSnapshot(options = {}) {
  const safe = isPlainObject(options) ? options : {};
  const eligible = sanitizeStringList(safe.eligibleCapabilities, CAPABILITY_READINESS_POLICY.maxEligibleCapabilities);
  const blocked = sanitizeBlockedList(safe.blockedCapabilities, CAPABILITY_READINESS_POLICY.maxBlockedCapabilities);
  const missingDependencies = sanitizeMissingDependencies(safe.missingDependencies, CAPABILITY_READINESS_POLICY.maxMissingDependencies);
  const evaluated = sanitizeStringList(safe.evaluatedCapabilities, 32);

  const snapshot = {
    version: CAPABILITY_READINESS_VERSION,
    mode: 'observational',
    enabled: Boolean(safe.enabled),
    shadowMode: safe.shadowMode !== false,
    evaluatedCapabilities: evaluated,
    eligibleCapabilities: eligible,
    blockedCapabilities: blocked,
    missingDependencies,
    nextRecommendedCapability: typeof safe.nextRecommendedCapability === 'string'
      ? safe.nextRecommendedCapability
      : null,
    summary: {
      evaluatedCount: evaluated.length,
      eligibleCount: eligible.length,
      blockedCount: blocked.length,
      missingDependencyCount: missingDependencies.length,
    },
    diagnostics: Array.isArray(safe.diagnostics)
      ? safe.diagnostics.slice(0, CAPABILITY_READINESS_POLICY.maxDiagnostics)
      : [],
    metadata: sanitizeMetadata(safe.metadata),
    legacyPreserved: true,
    applied: false,
    serializable: true,
  };
  return deepFreeze(snapshot);
}

export function validateCapabilityReadinessSnapshot(snapshot) {
  if (!isPlainObject(snapshot)) {
    return { valid: false, errors: ['SNAPSHOT_NOT_OBJECT'] };
  }
  const errors = [];
  if (snapshot.version !== CAPABILITY_READINESS_VERSION) errors.push('VERSION_INVALID');
  if (!isCapabilityReadinessMode(snapshot.mode) || snapshot.mode !== 'observational') {
    errors.push('MODE_NOT_OBSERVATIONAL');
  }
  if (typeof snapshot.enabled !== 'boolean') errors.push('ENABLED_INVALID');
  if (typeof snapshot.shadowMode !== 'boolean') errors.push('SHADOW_MODE_INVALID');
  if (!Array.isArray(snapshot.evaluatedCapabilities)) errors.push('EVALUATED_NOT_ARRAY');
  if (!Array.isArray(snapshot.eligibleCapabilities)) errors.push('ELIGIBLE_NOT_ARRAY');
  if (!Array.isArray(snapshot.blockedCapabilities)) errors.push('BLOCKED_NOT_ARRAY');
  if (!Array.isArray(snapshot.missingDependencies)) errors.push('MISSING_DEPS_NOT_ARRAY');
  if (snapshot.nextRecommendedCapability !== null && typeof snapshot.nextRecommendedCapability !== 'string') {
    errors.push('NEXT_RECOMMENDED_INVALID');
  }
  if (!isPlainObject(snapshot.summary)) errors.push('SUMMARY_INVALID');
  if (!Array.isArray(snapshot.diagnostics)) errors.push('DIAGNOSTICS_NOT_ARRAY');
  if (!isPlainObject(snapshot.metadata)) errors.push('METADATA_INVALID');
  if (snapshot.legacyPreserved !== true) errors.push('LEGACY_PRESERVED_FALSE');
  if (snapshot.applied !== false) errors.push('APPLIED_NOT_FALSE');
  if (snapshot.serializable !== true) errors.push('SERIALIZABLE_FALSE');
  if (!isSerializableValue(snapshot)) errors.push('SNAPSHOT_NOT_SERIALIZABLE');
  return { valid: errors.length === 0, errors };
}

export function isCapabilityReadinessSnapshotSerializable(snapshot) {
  return isPlainObject(snapshot) && isSerializableValue(snapshot);
}
