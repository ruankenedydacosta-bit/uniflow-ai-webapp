// Uni Engine — Cognitive Pipeline (Fase 14, Bloco 1). Contratos.
//
// Snapshot consolidado serializável do pipeline observacional do turno.
// Sempre congelado, sem funções, sem Promises, sem elementos React, sem
// objetos DOM e sem referências circulares. `influenceApplied` permanece
// SEMPRE false e `legacyPreserved` SEMPRE true.
import { COGNITIVE_PIPELINE_LAYERS, COGNITIVE_PIPELINE_VERSION } from './cognitivePipelineTypes.js';
import { isSerializableValue } from '../uniEngineContracts.js';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    return Object.freeze(value.map(deepFreeze));
  }
  const frozen = {};
  for (const key of Object.keys(value).sort()) {
    frozen[key] = deepFreeze(value[key]);
  }
  return Object.freeze(frozen);
}

function emptyLayer() {
  return Object.freeze({
    present: false,
    executed: false,
    disabled: false,
    errorCode: null,
  });
}

function buildEmptyLayers() {
  const layers = {};
  for (const layer of COGNITIVE_PIPELINE_LAYERS) {
    layers[layer] = emptyLayer();
  }
  return Object.freeze(layers);
}

export function createEmptyCognitivePipelineSnapshot({ turnId = null, messageId = null } = {}) {
  return deepFreeze({
    version: COGNITIVE_PIPELINE_VERSION,
    turnId: typeof turnId === 'string' ? turnId : null,
    messageId: typeof messageId === 'string' ? messageId : null,
    mode: 'observational',
    legacyPreserved: true,
    applied: false,
    influenceApplied: false,
    layers: buildEmptyLayers(),
    summary: Object.freeze({
      layersPresent: 0,
      layersExecuted: 0,
      layersDisabled: 0,
      layersWithErrors: 0,
      divergenceCount: 0,
      agreementStatus: null,
    }),
    flags: Object.freeze({}),
    safety: Object.freeze({
      responseModified: false,
      financialExecution: false,
      memoryWrite: false,
      learningApplied: false,
      ttsTriggered: false,
      persistenceWritten: false,
      databaseCalled: false,
      rpcCalled: false,
      influenceApplied: false,
      pendingActionModified: false,
      confirmationModified: false,
    }),
    rollbackStatus: 'engine_disabled',
    latencyMs: null,
    timestamp: null,
    serializable: true,
  });
}

export function createCognitivePipelineSnapshot(options = {}) {
  const safe = options && typeof options === 'object' ? options : {};
  const layers = safe.layers && typeof safe.layers === 'object' ? safe.layers : {};
  const summary = safe.summary && typeof safe.summary === 'object' ? safe.summary : {};
  const flags = safe.flags && typeof safe.flags === 'object' ? safe.flags : {};
  const safety = safe.safety && typeof safe.safety === 'object' ? safe.safety : {};

  const normalizedLayers = {};
  for (const layer of COGNITIVE_PIPELINE_LAYERS) {
    const entry = layers[layer] && typeof layers[layer] === 'object' ? layers[layer] : {};
    normalizedLayers[layer] = Object.freeze({
      present: Boolean(entry.present),
      executed: Boolean(entry.executed),
      disabled: Boolean(entry.disabled),
      errorCode: typeof entry.errorCode === 'string' ? entry.errorCode : null,
    });
  }

  const normalizedSafety = {};
  const SAFETY_KEYS = [
    'responseModified',
    'financialExecution',
    'memoryWrite',
    'learningApplied',
    'ttsTriggered',
    'persistenceWritten',
    'databaseCalled',
    'rpcCalled',
    'influenceApplied',
    'pendingActionModified',
    'confirmationModified',
  ];
  for (const key of SAFETY_KEYS) {
    normalizedSafety[key] = Boolean(safety[key]);
  }

  const latencyMs =
    typeof safe.latencyMs === 'number' && Number.isFinite(safe.latencyMs)
      ? Number(safe.latencyMs.toFixed(2))
      : null;
  const timestamp =
    typeof safe.timestamp === 'string'
      ? safe.timestamp
      : typeof safe.timestamp === 'number'
        ? new Date(safe.timestamp).toISOString()
        : null;

  const snapshot = {
    version: COGNITIVE_PIPELINE_VERSION,
    turnId: typeof safe.turnId === 'string' ? safe.turnId : null,
    messageId: typeof safe.messageId === 'string' ? safe.messageId : null,
    mode: 'observational',
    legacyPreserved: true,
    applied: false,
    influenceApplied: false,
    layers: normalizedLayers,
    summary: Object.freeze({
      layersPresent: Number(summary.layersPresent ?? 0),
      layersExecuted: Number(summary.layersExecuted ?? 0),
      layersDisabled: Number(summary.layersDisabled ?? 0),
      layersWithErrors: Number(summary.layersWithErrors ?? 0),
      divergenceCount: Number(summary.divergenceCount ?? 0),
      agreementStatus:
        typeof summary.agreementStatus === 'string' ? summary.agreementStatus : null,
    }),
    flags: deepFreeze(flags),
    safety: deepFreeze(normalizedSafety),
    rollbackStatus:
      typeof safe.rollbackStatus === 'string' ? safe.rollbackStatus : 'engine_disabled',
    latencyMs,
    timestamp,
    serializable: true,
  };

  return deepFreeze(snapshot);
}

export function validateCognitivePipelineSnapshot(snapshot) {
  const safe = snapshot && typeof snapshot === 'object' ? snapshot : null;
  if (!safe) return { valid: false, errors: ['PIPELINE_SNAPSHOT_INVALID'] };
  const errors = [];
  if (safe.version !== COGNITIVE_PIPELINE_VERSION) errors.push('VERSION_MISMATCH');
  if (safe.legacyPreserved !== true) errors.push('LEGACY_MUST_BE_PRESERVED');
  if (safe.influenceApplied !== false) errors.push('INFLUENCE_MUST_BE_FALSE');
  if (safe.applied !== false) errors.push('APPLIED_MUST_BE_FALSE');
  if (!isSerializableValue(safe)) errors.push('NOT_SERIALIZABLE');
  return { valid: errors.length === 0, errors };
}