// Contratos do Motor Epistêmico
// Definição pura e serializável dos contratos do conhecimento

import {
  findFunctionsInValue,
  isSerializableValue,
  deepFreeze,
} from '../uniEngineContracts.js';
import { KNOWLEDGE_TYPES, KNOWLEDGE_STATUSES, EVIDENCE_TYPES, SOURCE_TYPES, CONFIDENCE_LEVELS, EPISTEMIC_VERSION, EPISTEMIC_STATUSES, EPISTEMIC_SOURCES, EPISTEMIC_CLAIM_TYPES, EPISTEMIC_EVIDENCE_TYPES } from './epistemicTypes.js';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finiteOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function clamp01(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

// Hash determinístico simples (djb2)
function djb2(text) {
  let hash = 5381;
  const str = String(text);
  for (let i = 0; i < str.length; i += 1) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

export function createKnowledgeId({ type, subjectKey, normalizedValue }) {
  const base = [type ?? 'UNKNOWN', subjectKey ?? '', normalizedValue ?? ''].join('::');
  return `knowledge_${djb2(base).slice(0, 12)}`;
}

// ----------
// KnowledgeContract — objeto completo que representa um fato, inferência ou hipótese
// ----------
export function createKnowledgeContract(seed = {}) {
  const safe = isPlainObject(seed) ? seed : {};

  // Campos obrigatórios para validade
  const id = typeof safe.id === 'string' && safe.id.trim() ? safe.id : createKnowledgeId({
    type: safe.type ?? null,
    subjectKey: safe.subjectKey ?? null,
    normalizedValue: safe.normalizedValue ?? null,
  });

  const type = KNOWLEDGE_TYPES.includes(safe.type) ? safe.type : 'UNKNOWN';
  const status = KNOWLEDGE_STATUSES.includes(safe.status) ? safe.status : 'UNKNOWN';
  const confidence = clamp01(typeof safe.confidence === 'number' ? safe.confidence : 0);
  const confidenceLevel = CONFIDENCE_LEVELS.includes(safe.confidenceLevel)
    ? safe.confidenceLevel
    : confidence >= 0.95 ? 'VERIFIED'
    : confidence >= 0.75 ? 'HIGH'
    : confidence >= 0.5 ? 'MEDIUM'
    : confidence >= 0.25 ? 'LOW'
    : 'NONE';

  return {
    id,
    type,
    status,
    statement: typeof safe.statement === 'string' ? safe.statement : '',
    subject: typeof safe.subject === 'string' ? safe.subject : '',
    predicate: typeof safe.predicate === 'string' ? safe.predicate : '',
    object: typeof safe.object === 'string' ? safe.object : '',
    source: typeof safe.source === 'string' ? safe.source : '',
    sourceType: SOURCE_TYPES.includes(safe.sourceType) ? safe.sourceType : 'UNKNOWN',
    evidence: Array.isArray(safe.evidence)
      ? safe.evidence
          .slice(0, 20)
          .map((e) => ({
            type: EVIDENCE_TYPES.includes(e?.type) ? e.type : 'NONE',
            value: e?.value,
            source: e?.source,
            timestamp: typeof e?.timestamp === 'string' ? e.timestamp : new Date().toISOString(),
            weight: typeof e?.weight === 'number' ? clamp01(e.weight) : 0.5,
          }))
      : [],
    confidence,
    confidenceLevel,
    createdAt: typeof safe.createdAt === 'string' ? safe.createdAt : new Date().toISOString(),
    updatedAt: typeof safe.updatedAt === 'string' ? safe.updatedAt : new Date().toISOString(),
    validFrom: typeof safe.validFrom === 'string' ? safe.validFrom : null,
    validUntil: typeof safe.validUntil === 'string' ? safe.validUntil : null,
    lastVerifiedAt: typeof safe.lastVerifiedAt === 'string' ? safe.lastVerifiedAt : null,
    contradictedBy: Array.isArray(safe.contradictedBy) ? safe.contradictedBy : [],
    supersedes: Array.isArray(safe.supersedes) ? safe.supersedes : [],
    supersededBy: Array.isArray(safe.supersededBy) ? safe.supersededBy : [],
    userId: typeof safe.userId === 'string' ? safe.userId : null,
    workspaceId: typeof safe.workspaceId === 'string' ? safe.workspaceId : null,
    conversationId: typeof safe.conversationId === 'string' ? safe.conversationId : null,
    turnId: typeof safe.turnId === 'string' ? safe.turnId : null,
    metadata: isPlainObject(safe.metadata) ? { ...safe.metadata } : {},
  };
}

// ----------
// Funções de validação
// ----------

export function validateKnowledgeContract(contract) {
  const errors = [];

  if (!isPlainObject(contract)) {
    return { valid: false, errors: ['CONTRACT_NOT_OBJECT'] };
  }

  if (typeof contract.version !== 'string') {
    errors.push('VERSION_INVALID');
  }

  if (!Array.isArray(contract.evidence)) {
    errors.push('EVIDENCE_INVALID');
  }

  if (contract.evidence.some((e) => !EVIDENCE_TYPES.includes(e?.type))) {
    errors.push('EVIDENCE_TYPE_INVALID');
  }

  if (typeof contract.confidence !== 'number' || !Number.isFinite(contract.confidence) || contract.confidence < 0 || contract.confidence > 1) {
    errors.push('CONFIDENCE_INVALID');
  }

  if (!isSerializableValue(contract) || findFunctionsInValue(contract).length > 0) {
    errors.push('NOT_SERIALIZABLE');
  }

  return { valid: errors.length === 0, errors };
}

export function validateKnowledgeStatusTransition(fromStatus, toStatus) {
  const validTransitions = {
    'UNVERIFIED': ['VERIFIED', 'CONTRADICTED', 'STALE', 'SUPERSEDED'],
    'VERIFIED': ['STALE', 'SUPERSEDED', 'CONTRADICTED'],
    'CONTRADICTED': ['SUPERSEDED'],
    'STALE': ['SUPERSEDED'],
    'SUPERSEDED': [],
  };

  if (!validTransitions[fromStatus]?.includes(toStatus)) {
    return { valid: false, error: `INVALID_TRANSITION: ${fromStatus} -> ${toStatus}` };
  }

  return { valid: true };
}

// ----------
// Snapshot do Motor Epistêmico
// ----------
export function createEpistemicSnapshot(seed = {}) {
  const safe = isPlainObject(seed) ? seed : {};

  return {
    version: EPISTEMIC_VERSION,
    enabled: Boolean(safe.enabled),
    shadowMode: Boolean(safe.shadowMode),
    fallbackUsed: Boolean(safe.fallbackUsed),
    fallbackReason: typeof safe.fallbackReason === 'string' ? safe.fallbackReason : null,
    errorCode: typeof safe.errorCode === 'string' ? safe.errorCode : null,
    reflectionTriggered: Boolean(safe.reflectionTriggered),
    outcome: ['UNKNOWN', 'SUCCESS', 'NEEDS_EVIDENCE', 'CONFLICT'].includes(safe.outcome) ? safe.outcome : 'UNKNOWN',
    knowledge: Array.isArray(safe.knowledge) ? safe.knowledge.map(createKnowledgeContract) : [],
    signals: Array.isArray(safe.signals)
      ? safe.signals.slice(0, 50).map((signal) => ({
          type: ['INTENT_MISMATCH', 'LOW_CONFIDENCE', 'CONTEXT_LOST', 'UNNECESSARY_QUESTION', 'USER_CORRECTION', 'PROVIDER_FAILURE', 'VOICE_FAILURE', 'SUCCESSFUL_PATTERN'].includes(signal?.type) ? signal.type : 'INTENT_MISMATCH',
          confidence: clamp01(typeof signal?.confidence === 'number' ? signal.confidence : 0),
          layer: ['classification', 'decision', 'planning', 'epistemic', 'memory', 'executor', 'pipeline'].includes(signal?.layer) ? signal.layer : 'classification',
          severity: ['critical', 'high', 'medium', 'low', 'ignore', 'undetermined'].includes(signal?.severity) ? signal.severity : 'medium',
          evidenceCount: Number.isInteger(signal?.evidenceCount) ? signal.evidenceCount : 1,
          reasonCode: typeof signal?.reasonCode === 'string' ? signal.reasonCode : null,
          subjectKey: typeof signal?.subjectKey === 'string' ? signal.subjectKey : null,
        }))
      : [],
    conflicts: Array.isArray(safe.conflicts) ? safe.conflicts : [],
    risks: Array.isArray(safe.risks) ? safe.risks : [],
    diagnostics: Array.isArray(safe.diagnostics)
      ? safe.diagnostics.filter((d) => typeof d === 'string')
      : ['EPISTEMIC_DISABLED'],
    suggestions: Array.isArray(safe.suggestions)
      ? safe.suggestions.filter((s) => ['NO_ACTION', 'REVIEW_CANDIDATES', 'CONFIRM_PREFERENCE', 'GATHER_MORE_EVIDENCE'].includes(s))
      : [],
    recommendedNextStep: ['NO_ACTION', 'REVIEW_CANDIDATES', 'CONFIRM_PREFERENCE', 'GATHER_MORE_EVIDENCE', 'ASK_BEFORE_LEARNING', 'RETRY_LATER'].includes(safe.recommendedNextStep)
      ? safe.recommendedNextStep
      : 'NO_ACTION',
    confidenceSummary: isPlainObject(safe.confidenceSummary) ? { ...safe.confidenceSummary } : { average: 0, max: 0 },
    prioritySummary: isPlainObject(safe.prioritySummary) ? { ...safe.prioritySummary } : { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, IGNORE: 0, UNDETERMINED: 0 },
    shadow: {
      shadowMode: Boolean(safe.shadow?.shadowMode ?? true),
      appliedToDecision: Boolean(safe.shadow?.appliedToDecision ?? false),
      appliedToResponse: Boolean(safe.shadow?.appliedToResponse ?? false),
      executed: Boolean(safe.shadow?.executed ?? false),
      persisted: Boolean(safe.shadow?.persisted ?? false),
      changedBehavior: Boolean(safe.shadow?.changedBehavior ?? false),
      voiceTouched: Boolean(safe.shadow?.voiceTouched ?? false),
      databaseCalled: Boolean(safe.shadow?.databaseCalled ?? false),
      memoryModified: Boolean(safe.shadow?.memoryModified ?? false),
    },
    latencyMs: finiteOrNull(safe.latencyMs) ?? 0,
    telemetry: safe.telemetry !== undefined ? safe.telemetry : null,
  };
}

// ----------
// Segurança: Garantias do Motor Epistêmico
// ----------
export function createEpistemicSecurity() {
  return {
    financialExecution: false,
    memoryWrite: false,
    learningApplied: false,
    confirmationSkipped: false,
    pendingActionModifiedUnsafely: false,
    databaseCalled: false,
    rpcCalled: false,
    freeTextGenerated: false,
    responseModified: false,
    pendingActionModified: false,
  };
}

// ----------
// Configuração de recursos do Epistemic Engine
// ----------
export const EPISTEMIC_RESOURCES = {
  memoryReadEnabled: false,
  memoryWriteEnabled: false,
  learningEnabled: false,
  learningCandidatesEnabled: false,
  epistemicEnabled: false,
  epistemicShadowMode: true,
  epistemicTelemetryEnabled: false,
};

export const EPISTEMIC_FEATURE_FLAGS = {
  enabled: 'VITE_UNI_ENGINE_EPISTEMIC_ENABLED',
  shadowMode: 'VITE_UNI_ENGINE_EPISTEMIC_SHADOW_MODE',
  telemetry: 'VITE_UNI_ENGINE_EPISTEMIC_TELEMETRY_ENABLED',
  memoryRead: 'VITE_UNI_ENGINE_MEMORY_READ_ENABLED',
  memoryWrite: 'VITE_UNI_ENGINE_MEMORY_WRITE_ENABLED',
  learning: 'VITE_UNI_ENGINE_REFLECTION_ENABLED',
  learningCandidates: 'VITE_UNI_ENGINE_LEARNING_CANDIDATES_ENABLED',
};

// Compatibilidade com API anterior (Fase 4) — mantida para buildEpistemicEvidence.js
// e outros consumidores legados.

// Chave de idempotência determinística: a MESMA combinação
// (tipo + fonte + sujeito + valor + instante) nunca conta duas vezes.
export function buildEvidenceKey({ type, source, subject, value, observedAt }) {
  const valueKey =
    typeof value === 'object' && value !== null
      ? JSON.stringify(value)
      : String(value ?? 'null');
  return [
    type ?? 'unknown',
    source ?? 'unknown',
    subject ?? 'unknown',
    valueKey,
    observedAt ?? 'no-time',
  ].join('::');
}

export function createEpistemicEvidence(seed = {}) {
  const safe = seed && typeof seed === 'object' ? seed : {};
  return {
    evidenceId: safe.evidenceId ?? null,
    source: safe.source ?? 'unknown',
    type: safe.type ?? null,
    value: safe.value ?? null,
    weight: typeof safe.weight === 'number' ? safe.weight : 0,
    confidence:
      typeof safe.confidence === 'number' ? Number(safe.confidence.toFixed(4)) : 0,
    observedAt: safe.observedAt ?? null,
    verifiedAt: safe.verifiedAt ?? null,
    expiresAt: safe.expiresAt ?? null,
    metadata: isPlainObject(safe.metadata) ? safe.metadata : {},
  };
}

export function validateEpistemicEvidence(evidence) {
  const errors = [];
  if (!isPlainObject(evidence)) {
    return { valid: false, errors: ['EVIDENCE_NOT_OBJECT'] };
  }
  if (!EPISTEMIC_EVIDENCE_TYPES.includes(evidence.type)) {
    errors.push('EVIDENCE_TYPE_INVALID');
  }
  if (!EPISTEMIC_SOURCES.includes(evidence.source)) {
    errors.push('EVIDENCE_SOURCE_INVALID');
  }
  if (
    typeof evidence.weight !== 'number'
    || !Number.isFinite(evidence.weight)
    || evidence.weight < -1
    || evidence.weight > 1
  ) {
    errors.push('EVIDENCE_WEIGHT_INVALID');
  }
  if (
    typeof evidence.confidence !== 'number'
    || evidence.confidence < 0
    || evidence.confidence > 1
  ) {
    errors.push('EVIDENCE_CONFIDENCE_INVALID');
  }
  if (evidence.value != null && !isSerializableValue(evidence.value)) {
    errors.push('EVIDENCE_VALUE_NOT_SERIALIZABLE');
  }
  if (evidence.metadata != null && !isPlainObject(evidence.metadata)) {
    errors.push('EVIDENCE_METADATA_INVALID');
  }
  return { valid: errors.length === 0, errors };
}

export function createEpistemicItem(seed = {}) {
  const safe = seed && typeof seed === 'object' ? seed : {};
  return {
    subject: safe.subject ?? null,
    value: safe.value ?? null,
    claimType: safe.claimType ?? null,
    epistemicStatus: safe.epistemicStatus ?? 'unknown',
    confidence: typeof safe.confidence === 'number' ? safe.confidence : 0,
    source: safe.source ?? 'unknown',
    sourcePriority: typeof safe.sourcePriority === 'number' ? safe.sourcePriority : null,
    evidence: Array.isArray(safe.evidence) ? safe.evidence : [],
    contradictions: Array.isArray(safe.contradictions) ? safe.contradictions : [],
    lastVerifiedAt: safe.lastVerifiedAt ?? null,
    expiresAt: safe.expiresAt ?? null,
    staleAfter: safe.staleAfter ?? null,
    requiresVerification: Boolean(safe.requiresVerification),
    usableFor: createUsableFor(safe.usableFor),
    restrictions: Array.isArray(safe.restrictions) ? safe.restrictions : [],
    diagnostics: isPlainObject(safe.diagnostics) ? safe.diagnostics : {},
    verifiedAt: safe.verifiedAt ?? null,
    expiresAt: safe.expiresAt ?? null,
    metadata: isPlainObject(safe.metadata) ? safe.metadata : {},
  };
}

function createUsableFor(overrides = {}) {
  const safe = overrides && typeof overrides === 'object' ? overrides : {};
  return {
    display: Boolean(safe.display),
    suggestion: Boolean(safe.suggestion),
    question: Boolean(safe.question),
    confirmation: Boolean(safe.confirmation),
    execution: false,
    memory_candidate: Boolean(safe.memory_candidate),
    none: true,
  };
}

export function validateEpistemicItem(item, policy = null) {
  const errors = [];
  if (!isPlainObject(item)) {
    return { valid: false, errors: ['ITEM_NOT_OBJECT'] };
  }
  if (!EPISTEMIC_STATUSES.includes(item.epistemicStatus)) {
    errors.push('ITEM_STATUS_INVALID');
  }
  if (!EPISTEMIC_SOURCES.includes(item.source)) {
    errors.push('ITEM_SOURCE_INVALID');
  }
  if (!EPISTEMIC_CLAIM_TYPES.includes(item.claimType)) {
    errors.push('ITEM_CLAIM_TYPE_INVALID');
  }
  if (!isValidEpistemicConfidence(item.confidence)) {
    errors.push('ITEM_CONFIDENCE_INVALID');
  }
  if (!Array.isArray(item.evidence) || item.evidence.length === 0) {
    errors.push('ITEM_EVIDENCE_REQUIRED');
  }
  for (const evidence of item.evidence) {
    const validation = validateEpistemicEvidence(evidence);
    if (!validation.valid) {
      errors.push('ITEM_EVIDENCE_INVALID');
      break;
    }
  }
  if (item.value != null && !isSerializableValue(item.value)) {
    errors.push('ITEM_VALUE_NOT_SERIALIZABLE');
  }
  if (item.usableFor != null) {
    const capabilities = item.usableFor;
    if (!isPlainObject(capabilities)) {
      errors.push('ITEM_USABLE_FOR_INVALID');
    } else if (capabilities.execution === true) {
      errors.push('ITEM_EXECUTION_BLOCKED');
    }
  }
  const maxEvidence = policy?.maxEvidencePerItem ?? 32;
  if (item.evidence.length > maxEvidence) {
    errors.push('ITEM_TOO_MANY_EVIDENCE');
  }
  return { valid: errors.length === 0, errors };
}

export function isValidEpistemicConfidence(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

export function confidenceBandOf(value) {
  const confidence = Number(value) || 0;
  for (const band of EPISTEMIC_CONFIDENCE_BANDS) {
    if (confidence >= band.min && confidence <= band.max) return band.label;
  }
  return 'insufficient';
}

export function createEpistemicModelSection(overrides = {}) {
  const safe = overrides && typeof overrides === 'object' ? overrides : {};
  return {
    items: Array.isArray(safe.items) ? safe.items : [],
    conflicts: Array.isArray(safe.conflicts) ? safe.conflicts : [],
    staleItems: Array.isArray(safe.staleItems) ? safe.staleItems : [],
    sufficiency: isPlainObject(safe.sufficiency) ? safe.sufficiency : {},
    recommendations: Array.isArray(safe.recommendations) ? safe.recommendations : [],
    appliedToDecision: false,
    latencyMs:
      typeof safe.latencyMs === 'number' && Number.isFinite(safe.latencyMs)
        ? Number(safe.latencyMs.toFixed(2))
        : null,
  };
}

export const EPISTEMIC_MODEL_VERSION = '1.0';

export const EPISTEMIC_CONFIDENCE_BANDS = Object.freeze([
  { label: 'insufficient', min: 0.0, max: 0.24 },
  { label: 'low', min: 0.25, max: 0.49 },
  { label: 'moderate', min: 0.5, max: 0.69 },
  { label: 'high', min: 0.7, max: 0.89 },
  { label: 'very_high', min: 0.9, max: 1.0 },
]);

export const EPISTEMIC_USABLE_FOR_CAPABILITIES = Object.freeze([
  'display',
  'suggestion',
  'question',
  'confirmation',
  'execution',
  'memory_candidate',
  'none',
]);

export function serializeEpistemicItem(item) {
  const safe = item && typeof item === 'object' ? item : {};
  const copy = createEpistemicItem({
    subject: safe.subject,
    value: isSerializableValue(safe.value) ? safe.value : null,
    claimType: safe.claimType,
    epistemicStatus: safe.epistemicStatus,
    confidence: Number(safe.confidence ?? 0),
    source: safe.source,
    sourcePriority: safe.sourcePriority,
    evidence: Array.isArray(safe.evidence)
      ? safe.evidence.map((evidence) => createEpistemicEvidence(evidence))
      : [],
    contradictions: Array.isArray(safe.contradictions)
      ? safe.contradictions.map((contradiction) => (
        isPlainObject(contradiction) ? { ...contradiction } : contradiction
      ))
      : [],
    lastVerifiedAt: safe.lastVerifiedAt,
    expiresAt: safe.expiresAt,
    staleAfter: safe.staleAfter,
    requiresVerification: Boolean(safe.requiresVerification),
    usableFor: safe.usableFor,
    restrictions: Array.isArray(safe.restrictions) ? [...safe.restrictions] : [],
    diagnostics: isPlainObject(safe.diagnostics) ? { ...safe.diagnostics } : {},
  });
  copy.confidence = Number(copy.confidence.toFixed(4));
  return copy;
}

export {
  findFunctionsInValue,
  isSerializableValue,
};
