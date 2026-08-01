// Contratos da Memória Inteligente Persistente (Fase 3).
//
// Formas de dados de TODA entrada e saída do subsistema de memória. Nenhum
// contrato contém funções, instâncias, cliente Supabase, tokens, áudio ou
// texto integral desnecessário — tudo é JSON serializável.
//
// Item de memória (contrato da seção 4 da especificação):
//   {
//     id, userId, workspaceId, conversationId,
//     memoryType, subjectKey, value, normalizedValue,
//     status, confidence, evidenceCount,
//     source, firstSeenAt, lastSeenAt, confirmedAt,
//     expiresAt, supersededBy, metadata, createdAt, updatedAt
//   }
//
// Evidência (contrato da seção 5):
//   {
//     id, memoryId, evidenceType, sourceMessageId, sourceConversationId,
//     observedValue, normalizedValue, weight, occurredAt, metadata,
//     evidenceKey  // chave determinística de idempotência
//   }
import {
  EVIDENCE_TYPES,
  MEMORY_SOURCES,
  MEMORY_STATUSES,
  MEMORY_TYPES,
  isValidEvidenceType,
  isValidMemorySource,
  isValidMemoryStatus,
  isValidMemoryType,
} from './memoryTypes.js';
import {
  isSerializableValue,
  findFunctionsInValue,
} from '../uniEngineContracts.js';
import { MEMORY_POLICY, computeConfidence, getEvidenceWeight } from './memoryPolicy.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isValidUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

// -----------------------------------------------
// Evidência
// -----------------------------------------------

export function createEvidence(seed = {}) {
  const safe = seed && typeof seed === 'object' ? seed : {};
  return {
    id: safe.id ?? null,
    memoryId: safe.memoryId ?? null,
    evidenceType: safe.evidenceType ?? null,
    sourceMessageId: safe.sourceMessageId ?? null,
    sourceConversationId: safe.sourceConversationId ?? null,
    observedValue: safe.observedValue ?? null,
    normalizedValue: safe.normalizedValue ?? null,
    weight: safe.weight ?? 0,
    occurredAt: safe.occurredAt ?? null,
    evidenceKey: safe.evidenceKey ?? null,
    metadata: isPlainObject(safe.metadata) ? safe.metadata : {},
  };
}

export function validateEvidence(evidence, policy = MEMORY_POLICY) {
  const errors = [];
  if (!isPlainObject(evidence)) {
    return { valid: false, errors: ['EVIDENCE_NOT_OBJECT'] };
  }
  if (!isValidEvidenceType(evidence.evidenceType)) {
    errors.push('EVIDENCE_TYPE_INVALID');
  }
  if (typeof evidence.weight !== 'number' || evidence.weight < -1 || evidence.weight > 1) {
    errors.push('EVIDENCE_WEIGHT_INVALID');
  }
  if (evidence.observedValue != null && !isSerializableValue(evidence.observedValue)) {
    errors.push('EVIDENCE_VALUE_NOT_SERIALIZABLE');
  }
  if (evidence.metadata != null && !isPlainObject(evidence.metadata)) {
    errors.push('EVIDENCE_METADATA_INVALID');
  }
  if (
    evidence.observedValue != null
    && JSON.stringify(evidence.observedValue ?? null)?.length > policy.maxEvidenceSummaryBytes
  ) {
    errors.push('EVIDENCE_VALUE_TOO_LARGE');
  }
  return { valid: errors.length === 0, errors };
}

// Chave de idempotência determinística de uma evidência. A mesma combinação
// (tipo + mensagem de origem + instante) nunca é anexada duas vezes.
export function buildEvidenceKey({ evidenceType, sourceMessageId, occurredAt, memoryId }) {
  return [
    evidenceType ?? 'unknown',
    sourceMessageId ?? 'no-message',
    occurredAt ?? 'no-time',
    memoryId ?? 'no-memory',
  ].join('::');
}

// -----------------------------------------------
// Item de memória
// -----------------------------------------------

export function createMemoryItem(seed = {}) {
  const safe = seed && typeof seed === 'object' ? seed : {};
  const now = safe.now ?? new Date().toISOString();
  return {
    id: safe.id ?? null,
    userId: safe.userId ?? null,
    workspaceId: safe.workspaceId ?? null,
    conversationId: safe.conversationId ?? null,
    memoryType: safe.memoryType ?? null,
    subjectKey: safe.subjectKey ?? null,
    value: isPlainObject(safe.value) ? safe.value : (safe.value ?? {}),
    normalizedValue: safe.normalizedValue ?? null,
    status: safe.status ?? 'candidate',
    confidence: safe.confidence ?? 0,
    evidenceCount: safe.evidenceCount ?? 0,
    source: safe.source ?? 'engine',
    firstSeenAt: safe.firstSeenAt ?? now,
    lastSeenAt: safe.lastSeenAt ?? now,
    confirmedAt: safe.confirmedAt ?? null,
    expiresAt: safe.expiresAt ?? null,
    supersededBy: safe.supersededBy ?? null,
    metadata: isPlainObject(safe.metadata) ? safe.metadata : {},
    createdAt: safe.createdAt ?? now,
    updatedAt: safe.updatedAt ?? now,
  };
}

export function validateMemoryItem(item, policy = MEMORY_POLICY) {
  const errors = [];
  if (!isPlainObject(item)) {
    return { valid: false, errors: ['MEMORY_NOT_OBJECT'] };
  }
  if (!isValidMemoryType(item.memoryType)) {
    errors.push('MEMORY_TYPE_INVALID');
  }
  if (!isValidMemoryStatus(item.status)) {
    errors.push('MEMORY_STATUS_INVALID');
  }
  if (!isValidMemorySource(item.source)) {
    errors.push('MEMORY_SOURCE_INVALID');
  }
  if (
    typeof item.subjectKey !== 'string'
    || !item.subjectKey.trim()
    || item.subjectKey.length > policy.maxSubjectKeyLength
  ) {
    errors.push('MEMORY_SUBJECT_KEY_INVALID');
  }
  if (!isPlainObject(item.value) || !isSerializableValue(item.value)) {
    errors.push('MEMORY_VALUE_NOT_SERIALIZABLE_OBJECT');
  }
  if (JSON.stringify(item.value)?.length > policy.maxValueBytes) {
    errors.push('MEMORY_VALUE_TOO_LARGE');
  }
  if (
    typeof item.confidence !== 'number'
    || !Number.isFinite(item.confidence)
    || item.confidence < 0
    || item.confidence > 1
  ) {
    errors.push('MEMORY_CONFIDENCE_INVALID');
  }
  if (
    typeof item.evidenceCount !== 'number'
    || item.evidenceCount < 0
    || item.evidenceCount > policy.maxEvidencePerMemory
  ) {
    errors.push('MEMORY_EVIDENCE_COUNT_INVALID');
  }
  if (item.expiresAt != null && item.firstSeenAt != null && item.expiresAt < item.firstSeenAt) {
    errors.push('MEMORY_EXPIRATION_BEFORE_FIRST_SEEN');
  }
  if (item.status === 'superseded' && (!item.supersededBy || item.supersededBy === item.id)) {
    errors.push('MEMORY_SUPERSEDED_INVALID');
  }
  if (
    item.status !== 'superseded'
    && item.supersededBy != null
  ) {
    errors.push('MEMORY_SUPERSEDED_BY_WITHOUT_STATUS');
  }
  if (item.metadata != null && !isPlainObject(item.metadata)) {
    errors.push('MEMORY_METADATA_INVALID');
  }
  if (
    item.metadata != null
    && Object.keys(item.metadata).length > policy.maxMetadataKeys
  ) {
    errors.push('MEMORY_METADATA_TOO_MANY_KEYS');
  }
  return { valid: errors.length === 0, errors };
}

// Expiração determinística para um tipo de memória (null = nunca expira).
export function computeExpiresAt(memoryType, now = Date.now(), policy = MEMORY_POLICY) {
  const retention = getRetentionMs(memoryType, policy);
  return retention == null ? null : new Date(now + retention).toISOString();
}

function getRetentionMs(memoryType, policy) {
  return policy.retention[memoryType] ?? null;
}

// Cópia serializável segura do item (nunca expõe funções/referências).
export function serializeMemoryItem(item) {
  const safe = item && typeof item === 'object' ? item : {};
  const copy = createMemoryItem({
    id: safe.id,
    userId: safe.userId,
    workspaceId: safe.workspaceId,
    conversationId: safe.conversationId,
    memoryType: safe.memoryType,
    subjectKey: safe.subjectKey,
    value: isPlainObject(safe.value) ? safe.value : {},
    normalizedValue: safe.normalizedValue,
    status: safe.status,
    confidence: typeof safe.confidence === 'number' ? safe.confidence : 0,
    evidenceCount: typeof safe.evidenceCount === 'number' ? safe.evidenceCount : 0,
    source: safe.source,
    firstSeenAt: safe.firstSeenAt,
    lastSeenAt: safe.lastSeenAt,
    confirmedAt: safe.confirmedAt,
    expiresAt: safe.expiresAt,
    supersededBy: safe.supersededBy,
    metadata: isPlainObject(safe.metadata) ? safe.metadata : {},
    createdAt: safe.createdAt,
    updatedAt: safe.updatedAt,
  });
  copy.confidence = Number(copy.confidence.toFixed(4));
  return copy;
}

// Versão compacta e serializável usada dentro do Shadow Mode (somente o que
// o motor consome: identificação, tipo, chave, valor, status e confiança).
export function projectMemoryForEngine(item) {
  const safe = item && typeof item === 'object' ? item : {};
  return {
    id: safe.id ?? null,
    memoryType: safe.memoryType ?? null,
    subjectKey: safe.subjectKey ?? null,
    value: isPlainObject(safe.value) ? safe.value : {},
    status: safe.status ?? null,
    confidence: typeof safe.confidence === 'number' ? Number(safe.confidence.toFixed(4)) : 0,
    evidenceCount: typeof safe.evidenceCount === 'number' ? safe.evidenceCount : 0,
  };
}

// Constrói um item completo a partir de um candidato (usado pelo service).
export function buildItemFromCandidate(candidate, policy = MEMORY_POLICY) {
  const safe = candidate && typeof candidate === 'object' ? candidate : {};
  const now = new Date().toISOString();
  const weight = getEvidenceWeight(safe.evidenceType, policy);
  const item = createMemoryItem({
    userId: safe.userId,
    workspaceId: safe.workspaceId,
    conversationId: safe.conversationId,
    memoryType: safe.memoryType,
    subjectKey: safe.subjectKey,
    value: isPlainObject(safe.value) ? safe.value : {},
    normalizedValue: safe.normalizedValue ?? null,
    status: safe.status ?? initialStatus(safe.evidenceType),
    confidence: computeConfidence([weight], policy),
    evidenceCount: 1,
    source: safe.source ?? 'engine',
    firstSeenAt: now,
    lastSeenAt: now,
    confirmedAt: isConfirmationStatus(safe.status) ? now : null,
    expiresAt: safe.expiresAt ?? computeExpiresAt(safe.memoryType, Date.now(), policy),
    metadata: isPlainObject(safe.metadata) ? safe.metadata : {},
    createdAt: now,
    updatedAt: now,
  });
  return item;
}

function initialStatus(evidenceType) {
  return evidenceType === 'user_confirmation' || evidenceType === 'user_correction'
    ? 'confirmed'
    : 'candidate';
}

function isConfirmationStatus(status) {
  return status === 'confirmed';
}

export {
  EVIDENCE_TYPES,
  MEMORY_SOURCES,
  MEMORY_STATUSES,
  MEMORY_TYPES,
  findFunctionsInValue,
  isSerializableValue,
};
