// Uni Engine — Cognitive Orchestrator: contratos (Parte 9, Bloco Único).
//
// Snapshot consolidado estritamente observacional. Garantias absolutas:
//   - legacyPreserved SEMPRE true e applied SEMPRE false;
//   - shadowMode true por padrão;
//   - SOMENTE em memória: serializável, congelado, determinístico,
//     sem funções, sem Map/Set, sem referências circulares;
//   - nenhum texto de resposta, ID, valor ou memória é embedado.
import { isSerializableValue } from '../uniEngineContracts.js';
import {
  COGNITIVE_ORCHESTRATOR_VERSION,
  isOrchestratorStatus,
  isOrchestratorLayer,
  ORCHESTRATOR_DIAGNOSTIC_CODES,
  ORCHESTRATOR_METADATA_ALLOWED_KEYS,
} from './cognitiveOrchestratorTypes.js';
import { COGNITIVE_ORCHESTRATOR_POLICY } from './cognitiveOrchestratorPolicy.js';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

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

function sanitizeMetadata(value) {
  if (!isPlainObject(value)) return {};
  const sanitized = {};
  for (const key of ORCHESTRATOR_METADATA_ALLOWED_KEYS) {
    const item = value[key];
    if (item === undefined || item === null) continue;
    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
      sanitized[key] = item;
    } else if (Array.isArray(item)) {
      const list = item.filter((entry) => typeof entry === 'string')
        .slice(0, COGNITIVE_ORCHESTRATOR_POLICY.maxSources);
      if (list.length > 0) sanitized[key] = list;
    }
  }
  return sanitized;
}

function sanitizeLayer(key, value) {
  if (!isPlainObject(value)) return null;
  const sanitized = { ...value };
  if (sanitized.serializable === false) return null;
  if (key !== 'application' && key !== 'conversationRoute' && sanitized.applied === true) {
    return null;
  }
  return sanitized;
}

export function createEmptyCognitiveOrchestratorSnapshot(options = {}) {
  const safe = isPlainObject(options) ? options : {};
  return deepFreeze({
    version: COGNITIVE_ORCHESTRATOR_VERSION,
    mode: 'observational',
    orchestratorStatus: isOrchestratorStatus(safe.orchestratorStatus)
      ? safe.orchestratorStatus
      : 'EMPTY',
    observation: null,
    guidance: null,
    decision: null,
    capabilityReadiness: null,
    executionReadiness: null,
    application: null,
    conversationPlan: null,
    conversationRoute: null,
    diagnostics: Array.isArray(safe.diagnostics)
      ? safe.diagnostics.slice(0, COGNITIVE_ORCHESTRATOR_POLICY.maxDiagnostics)
      : [],
    metadata: sanitizeMetadata(safe.metadata),
    sameTurn: Boolean(safe.sameTurn),
    applied: false,
    shadowMode: true,
    legacyPreserved: true,
    serializable: true,
  });
}

export function createCognitiveOrchestratorSnapshot(options = {}) {
  const safe = isPlainObject(options) ? options : {};
  const layers = isPlainObject(safe.layers) ? safe.layers : {};
  const sanitizedLayers = {};
  const validLayerNames = [];

  for (const layerName of [
    'observation',
    'guidance',
    'decision',
    'capabilityReadiness',
    'executionReadiness',
    'application',
    'conversationPlan',
    'conversationRoute',
  ]) {
    const sanitized = sanitizeLayer(layerName, layers[layerName]);
    if (sanitized) {
      sanitizedLayers[layerName] = sanitized;
      validLayerNames.push(layerName);
    } else {
      sanitizedLayers[layerName] = null;
    }
  }

  const diagnostics = Array.isArray(safe.diagnostics)
    ? safe.diagnostics.slice(0, COGNITIVE_ORCHESTRATOR_POLICY.maxDiagnostics)
    : [];

  const metadata = sanitizeMetadata({
    ...safe.metadata,
    sources: validLayerNames,
    layerCount: 8,
    validLayerCount: validLayerNames.length,
    missingLayerCount: 8 - validLayerNames.length,
    status: safe.orchestratorStatus ?? 'EMPTY',
  });

  const snapshot = {
    version: COGNITIVE_ORCHESTRATOR_VERSION,
    mode: 'observational',
    orchestratorStatus: isOrchestratorStatus(safe.orchestratorStatus)
      ? safe.orchestratorStatus
      : (validLayerNames.length === 8 ? 'ORCHESTRATED' : validLayerNames.length > 0 ? 'PARTIAL' : 'EMPTY'),
    observation: sanitizedLayers.observation,
    guidance: sanitizedLayers.guidance,
    decision: sanitizedLayers.decision,
    capabilityReadiness: sanitizedLayers.capabilityReadiness,
    executionReadiness: sanitizedLayers.executionReadiness,
    application: sanitizedLayers.application,
    conversationPlan: sanitizedLayers.conversationPlan,
    conversationRoute: sanitizedLayers.conversationRoute,
    diagnostics,
    metadata,
    sameTurn: Boolean(safe.sameTurn),
    applied: false,
    shadowMode: true,
    legacyPreserved: true,
    serializable: true,
  };
  return deepFreeze(snapshot);
}

export function validateCognitiveOrchestratorSnapshot(snapshot) {
  if (!isPlainObject(snapshot)) {
    return { valid: false, errors: ['SNAPSHOT_NOT_OBJECT'] };
  }
  const errors = [];
  if (snapshot.version !== COGNITIVE_ORCHESTRATOR_VERSION) errors.push('VERSION_INVALID');
  if (snapshot.mode !== 'observational') errors.push('MODE_NOT_OBSERVATIONAL');
  if (!isOrchestratorStatus(snapshot.orchestratorStatus)) errors.push('STATUS_INVALID');
  const layers = [
    'observation',
    'guidance',
    'decision',
    'capabilityReadiness',
    'executionReadiness',
    'application',
    'conversationPlan',
    'conversationRoute',
  ];
  for (const layer of layers) {
    const value = snapshot[layer];
    if (value !== null && !isPlainObject(value)) {
      errors.push(`${layer.toUpperCase()}_INVALID`);
    }
  }
  if (!Array.isArray(snapshot.diagnostics)) errors.push('DIAGNOSTICS_NOT_ARRAY');
  if (!isPlainObject(snapshot.metadata)) errors.push('METADATA_INVALID');
  if (snapshot.applied !== false) errors.push('APPLIED_NOT_FALSE');
  if (snapshot.shadowMode !== true) errors.push('SHADOW_MODE_FALSE');
  if (snapshot.legacyPreserved !== true) errors.push('LEGACY_PRESERVED_FALSE');
  if (snapshot.serializable !== true) errors.push('SERIALIZABLE_FALSE');
  if (!isSerializableValue(snapshot)) errors.push('SNAPSHOT_NOT_SERIALIZABLE');
  return { valid: errors.length === 0, errors };
}

export function isCognitiveOrchestratorSnapshotSerializable(snapshot) {
  return isPlainObject(snapshot) && isSerializableValue(snapshot);
}