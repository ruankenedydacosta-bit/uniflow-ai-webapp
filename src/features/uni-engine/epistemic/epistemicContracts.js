// Contratos do Motor Epistêmico
// Definição pura e serializável dos contratos do conhecimento

import {
  findFunctionsInValue,
  isSerializableValue,
  deepFreeze,
} from '../uniEngineContracts.js';
import { KNOWLEDGE_TYPES, KNOWLEDGE_STATUSES, EVIDENCE_TYPES, SOURCE_TYPES, CONFIDENCE_LEVELS } from './epistemicTypes.js';

export const EPISTEMIC_VERSION = '1.0';

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
