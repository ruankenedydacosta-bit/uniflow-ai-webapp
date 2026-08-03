// Uni Engine — Conversation Planner: contratos (Parte 7, Bloco Único).
//
// Snapshot do plano de conversa estritamente observacional. Garantias
// absolutas:
//   - legacyPreserved SEMPRE true e applied SEMPRE false (nada é executado);
//   - shadowMode true por padrão (nada sai da sombra nesta parte);
//   - SOMENTE em memória: serializável, congelado, determinístico, sem
//     funções, sem Map/Set e sem referências circulares;
//   - nenhum texto de resposta, ID, valor ou memória é embedado — o plano
//     apenas declara o próximo passo lógico (NEXT_STEP_*).
import { isSerializableValue } from '../uniEngineContracts.js';
import {
  CONVERSATION_PLANNER_VERSION,
  isConversationPlannerMode,
  isNextStep,
  isPlannerStatus,
  isPlannerReason,
} from './conversationPlannerTypes.js';
import { CONVERSATION_PLANNER_POLICY, clamp01 } from './conversationPlannerPolicy.js';

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

const METADATA_ALLOWED_KEYS = Object.freeze([
  'sources',
  'confidence',
  'environment',
  'signalSource',
  'decisionType',
  'executionBlockedCount',
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
      const list = item.filter((entry) => typeof entry === 'string')
        .slice(0, CONVERSATION_PLANNER_POLICY.maxSources);
      if (list.length > 0) sanitized[key] = list;
    }
  }
  return sanitized;
}

export function createEmptyConversationPlanSnapshot(options = {}) {
  const safe = isPlainObject(options) ? options : {};
  return deepFreeze({
    version: CONVERSATION_PLANNER_VERSION,
    mode: 'observational',
    enabled: false,
    shadowMode: Boolean(safe.shadowMode ?? true),
    plannerStatus: isPlannerStatus(safe.plannerStatus) ? safe.plannerStatus : 'EMPTY',
    nextStep: 'NEXT_STEP_NONE',
    confidence: 0,
    reason: 'NO_SIGNAL',
    diagnostics: [],
    metadata: { sources: [] },
    legacyPreserved: true,
    applied: false,
    serializable: true,
  });
}

export function createConversationPlanSnapshot(options = {}) {
  const safe = isPlainObject(options) ? options : {};
  const snapshot = {
    version: CONVERSATION_PLANNER_VERSION,
    mode: 'observational',
    enabled: Boolean(safe.enabled),
    shadowMode: safe.shadowMode !== false,
    plannerStatus: isPlannerStatus(safe.plannerStatus) ? safe.plannerStatus : 'UNKNOWN',
    nextStep: isNextStep(safe.nextStep) ? safe.nextStep : 'NEXT_STEP_NONE',
    confidence: clamp01(safe.confidence),
    reason: isPlannerReason(safe.reason) ? safe.reason : 'UNKNOWN',
    diagnostics: Array.isArray(safe.diagnostics)
      ? safe.diagnostics.slice(0, CONVERSATION_PLANNER_POLICY.maxDiagnostics)
      : [],
    metadata: sanitizeMetadata(safe.metadata),
    legacyPreserved: true,
    applied: false,
    serializable: true,
  };
  return deepFreeze(snapshot);
}

export function validateConversationPlanSnapshot(snapshot) {
  if (!isPlainObject(snapshot)) {
    return { valid: false, errors: ['SNAPSHOT_NOT_OBJECT'] };
  }
  const errors = [];
  if (snapshot.version !== CONVERSATION_PLANNER_VERSION) errors.push('VERSION_INVALID');
  if (!isConversationPlannerMode(snapshot.mode) || snapshot.mode !== 'observational') {
    errors.push('MODE_NOT_OBSERVATIONAL');
  }
  if (typeof snapshot.enabled !== 'boolean') errors.push('ENABLED_INVALID');
  if (typeof snapshot.shadowMode !== 'boolean') errors.push('SHADOW_MODE_INVALID');
  if (!isPlannerStatus(snapshot.plannerStatus)) errors.push('PLANNER_STATUS_INVALID');
  if (!isNextStep(snapshot.nextStep)) errors.push('NEXT_STEP_INVALID');
  if (typeof snapshot.confidence !== 'number'
    || snapshot.confidence < 0
    || snapshot.confidence > 1) {
    errors.push('CONFIDENCE_INVALID');
  }
  if (!isPlannerReason(snapshot.reason)) errors.push('REASON_INVALID');
  if (!Array.isArray(snapshot.diagnostics)) errors.push('DIAGNOSTICS_NOT_ARRAY');
  if (!isPlainObject(snapshot.metadata)) errors.push('METADATA_INVALID');
  if (snapshot.legacyPreserved !== true) errors.push('LEGACY_PRESERVED_FALSE');
  if (snapshot.applied !== false) errors.push('APPLIED_NOT_FALSE');
  if (snapshot.serializable !== true) errors.push('SERIALIZABLE_FALSE');
  if (!isSerializableValue(snapshot)) errors.push('SNAPSHOT_NOT_SERIALIZABLE');
  return { valid: errors.length === 0, errors };
}

export function isConversationPlanSnapshotSerializable(snapshot) {
  return isPlainObject(snapshot) && isSerializableValue(snapshot);
}
