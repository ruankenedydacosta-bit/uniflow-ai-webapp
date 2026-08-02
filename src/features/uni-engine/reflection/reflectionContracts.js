// Contratos puros do Reflection & Learning Engine (Fase 8).
//
// Definem as formas de dados de TODA a entrada e saída da reflexão. Nenhum
// contrato contém funções, áudio, cliente Supabase ou segredos — a reflexão
// é uma camada analítica pura, serializável e descartável.
//
// Regra absoluta da Fase 8: candidatos NUNCA são aplicados. `shadow.applied`,
// `shadow.persisted` e `shadow.changedBehavior` permanecem SEMPRE falsos.
import {
  findFunctionsInValue,
  isSerializableValue,
} from '../uniEngineContracts.js';
import { REFLECTION_POLICY, clamp01 } from './reflectionPolicy.js';
import {
  isValidReflectionOutcome,
  isValidReflectionSignalType,
  isValidLearningCandidateType,
  isValidLearningCandidateStatus,
  isValidLearningPriority,
  isValidLearningRiskLevel,
  isValidReflectionLayer,
  isValidReviewStatus,
  isValidRecommendedNextStep,
  isValidLearningSuggestion,
  isValidReflectionDiagnostic,
} from './reflectionTypes.js';

export const REFLECTION_VERSION = '1.0';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finiteOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

// Hash determinístico simples (djb2) — garante candidateId estável e
// reproduzível entre execuções sem depender de aleatoriedade.
function djb2(value) {
  let hash = 5381;
  const text = String(value);
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

export function createCandidateId({ type, subjectKey, normalizedValue }) {
  const base = [type ?? 'UNKNOWN', subjectKey ?? '', normalizedValue ?? ''].join('::');
  return `cand_${djb2(base).slice(0, 12)}`;
}

// -----------------------------------------------
// ReflectionReview — revisão de uma camada
// -----------------------------------------------
export function createReflectionReview(seed = {}) {
  const safe = isPlainObject(seed) ? seed : {};
  return {
    targetLayer: isValidReflectionLayer(safe.targetLayer) ? safe.targetLayer : 'unknown',
    status: isValidReviewStatus(safe.status) ? safe.status : 'UNKNOWN',
    confidence: clamp01(safe.confidence),
    expected: Array.isArray(safe.expected) ? safe.expected.map(String) : [],
    observed: Array.isArray(safe.observed) ? safe.observed.map(String) : [],
    divergence: Array.isArray(safe.divergence) ? safe.divergence.map(String) : [],
    blockers: Array.isArray(safe.blockers) ? safe.blockers.map(String) : [],
    diagnostics: Array.isArray(safe.diagnostics)
      ? safe.diagnostics.filter(isValidReflectionDiagnostic)
      : [],
  };
}

// -----------------------------------------------
// ReflectionSignal — sinal detectado na interação
// -----------------------------------------------
export function createReflectionSignal(seed = {}) {
  const safe = isPlainObject(seed) ? seed : {};
  return {
    type: isValidReflectionSignalType(safe.type) ? safe.type : 'UNKNOWN',
    layer: isValidReflectionLayer(safe.layer) ? safe.layer : 'unknown',
    severity: ['low', 'medium', 'high', 'critical'].includes(safe.severity)
      ? safe.severity
      : 'low',
    evidenceCount: Number.isInteger(safe.evidenceCount) && safe.evidenceCount > 0
      ? Math.min(safe.evidenceCount, REFLECTION_POLICY.maxEvidencePerSignal)
      : 1,
    reasonCode: typeof safe.reasonCode === 'string' ? safe.reasonCode : null,
    subjectKey: typeof safe.subjectKey === 'string' ? safe.subjectKey : null,
  };
}

// -----------------------------------------------
// LearningCandidate — candidato de aprendizado
// -----------------------------------------------
export function createCandidateShadow(overrides = {}) {
  const safe = isPlainObject(overrides) ? overrides : {};
  return {
    shadowMode: Boolean(safe.shadowMode ?? true),
    applied: false,
    persisted: false,
    changedBehavior: false,
  };
}

export function createLearningCandidate(seed = {}) {
  const safe = isPlainObject(seed) ? seed : {};
  const type = isValidLearningCandidateType(safe.type) ? safe.type : 'UNKNOWN';
  const subjectKey = typeof safe.subjectKey === 'string' ? safe.subjectKey : '';
  const normalizedValue = typeof safe.normalizedValue === 'string'
    ? safe.normalizedValue
    : '';
  const candidateId = typeof safe.candidateId === 'string' && safe.candidateId.trim()
    ? safe.candidateId
    : createCandidateId({ type, subjectKey, normalizedValue });
  return {
    candidateId,
    type,
    subjectKey,
    proposedValue: typeof safe.proposedValue === 'string' ? safe.proposedValue : null,
    normalizedValue,
    status: isValidLearningCandidateStatus(safe.status) ? safe.status : 'DETECTED',
    confidence: clamp01(safe.confidence),
    priority: isValidLearningPriority(safe.priority) ? safe.priority : 'UNDETERMINED',
    risk: isValidLearningRiskLevel(safe.risk) ? safe.risk : 'UNKNOWN',
    evidence: Array.isArray(safe.evidence)
      ? safe.evidence.slice(0, REFLECTION_POLICY.maxEvidencePerCandidate)
      : [],
    conflicts: Array.isArray(safe.conflicts) ? safe.conflicts : [],
    expiresAt: typeof safe.expiresAt === 'string' ? safe.expiresAt : null,
    sourceLayer: isValidReflectionLayer(safe.sourceLayer) ? safe.sourceLayer : 'unknown',
    reasonCode: typeof safe.reasonCode === 'string' ? safe.reasonCode : null,
    restrictions: Array.isArray(safe.restrictions) ? safe.restrictions.map(String) : [],
    shadow: createCandidateShadow(safe.shadow),
  };
}

// -----------------------------------------------
// ReflectionResult — contrato de saída do engine
// -----------------------------------------------
export function createReflectionShadow(overrides = {}) {
  const safe = isPlainObject(overrides) ? overrides : {};
  return {
    shadowMode: Boolean(safe.shadowMode ?? true),
    appliedToDecision: false,
    appliedToResponse: false,
    executed: false,
    persisted: false,
    changedBehavior: false,
    voiceTouched: false,
    databaseCalled: false,
    memoryModified: false,
  };
}

export function createReflectionResult(seed = {}) {
  const safe = isPlainObject(seed) ? seed : {};
  const signals = Array.isArray(safe.signals)
    ? safe.signals.slice(0, REFLECTION_POLICY.maxSignals)
    : [];
  const candidates = Array.isArray(safe.learningCandidates)
    ? safe.learningCandidates.slice(0, REFLECTION_POLICY.maxCandidates)
    : [];
  return {
    version: REFLECTION_VERSION,
    enabled: Boolean(safe.enabled),
    shadowMode: Boolean(safe.shadowMode),
    fallbackUsed: Boolean(safe.fallbackUsed),
    fallbackReason: typeof safe.fallbackReason === 'string' ? safe.fallbackReason : null,
    errorCode: typeof safe.errorCode === 'string' ? safe.errorCode : null,
    reflectionTriggered: Boolean(safe.reflectionTriggered),
    outcome: isValidReflectionOutcome(safe.outcome) ? safe.outcome : 'UNKNOWN',
    signals: signals.map((signal) => createReflectionSignal(signal)),
    reviews: Array.isArray(safe.reviews)
      ? safe.reviews.slice(0, REFLECTION_POLICY.maxReviews).map((review) => createReflectionReview(review))
      : [],
    learningCandidates: candidates.map((candidate) => createLearningCandidate(candidate)),
    conflicts: Array.isArray(safe.conflicts) ? safe.conflicts : [],
    risks: Array.isArray(safe.risks) ? safe.risks : [],
    diagnostics: Array.isArray(safe.diagnostics)
      ? safe.diagnostics.filter(isValidReflectionDiagnostic)
      : [],
    suggestions: Array.isArray(safe.suggestions)
      ? safe.suggestions.filter(isValidLearningSuggestion)
      : [],
    recommendedNextStep: isValidRecommendedNextStep(safe.recommendedNextStep)
      ? safe.recommendedNextStep
      : 'NO_ACTION',
    evidenceSummary: isPlainObject(safe.evidenceSummary) ? { ...safe.evidenceSummary } : {},
    confidenceSummary: isPlainObject(safe.confidenceSummary) ? { ...safe.confidenceSummary } : {},
    prioritySummary: isPlainObject(safe.prioritySummary) ? { ...safe.prioritySummary } : {},
    shadow: createReflectionShadow(safe.shadow),
    latencyMs: finiteOrNull(safe.latencyMs) ?? 0,
    telemetry: safe.telemetry !== undefined ? safe.telemetry : null,
  };
}

// -----------------------------------------------
// Validação
// -----------------------------------------------
export function validateReflectionResult(result) {
  const errors = [];
  if (!isPlainObject(result)) return { valid: false, errors: ['RESULT_NOT_OBJECT'] };
  if (typeof result.version !== 'string') errors.push('VERSION_INVALID');
  if (!isValidReflectionOutcome(result.outcome)) errors.push('OUTCOME_INVALID');
  if (!Array.isArray(result.signals)) errors.push('SIGNALS_INVALID');
  if (!Array.isArray(result.reviews)) errors.push('REVIEWS_INVALID');
  if (!Array.isArray(result.learningCandidates)) errors.push('LEARNING_CANDIDATES_INVALID');
  if (result.signals.some((signal) => !isValidReflectionSignalType(signal?.type))) {
    errors.push('SIGNAL_TYPE_INVALID');
  }
  if (!isPlainObject(result.shadow)
    || result.shadow.appliedToDecision !== false
    || result.shadow.appliedToResponse !== false
    || result.shadow.executed !== false
    || result.shadow.persisted !== false
    || result.shadow.changedBehavior !== false) {
    errors.push('SHADOW_INVALID');
  }
  if (typeof result.fallbackUsed !== 'boolean') errors.push('FALLBACK_USED_INVALID');
  if (result.fallbackReason != null && typeof result.fallbackReason !== 'string') errors.push('FALLBACK_REASON_INVALID');
  if (result.errorCode != null && typeof result.errorCode !== 'string') errors.push('ERROR_CODE_INVALID');
  if (!isSerializableValue(result) || findFunctionsInValue(result).length > 0) {
    errors.push('NOT_SERIALIZABLE');
  }
  return { valid: errors.length === 0, errors };
}

export function validateLearningCandidate(candidate) {
  const errors = [];
  if (!isPlainObject(candidate)) return { valid: false, errors: ['CANDIDATE_NOT_OBJECT'] };
  if (!isValidLearningCandidateType(candidate.type)) errors.push('TYPE_INVALID');
  if (!isValidLearningCandidateStatus(candidate.status)) errors.push('STATUS_INVALID');
  if (!isValidLearningPriority(candidate.priority)) errors.push('PRIORITY_INVALID');
  if (!isValidLearningRiskLevel(candidate.risk)) errors.push('RISK_INVALID');
  if (typeof candidate.confidence !== 'number'
    || !Number.isFinite(candidate.confidence)
    || candidate.confidence < 0
    || candidate.confidence > 1) {
    errors.push('CONFIDENCE_INVALID');
  }
  if (!isPlainObject(candidate.shadow)
    || candidate.shadow.applied !== false
    || candidate.shadow.persisted !== false
    || candidate.shadow.changedBehavior !== false) {
    errors.push('SHADOW_INVALID');
  }
  if (!isSerializableValue(candidate) || findFunctionsInValue(candidate).length > 0) {
    errors.push('NOT_SERIALIZABLE');
  }
  return { valid: errors.length === 0, errors };
}

export function createEmptyReflectionResult(overrides = {}) {
  const safe = isPlainObject(overrides) ? overrides : {};
  return createReflectionResult({
    version: REFLECTION_VERSION,
    enabled: false,
    shadowMode: safe.shadowMode ?? true,
    fallbackUsed: Boolean(safe.fallbackUsed),
    fallbackReason: safe.fallbackReason ?? null,
    errorCode: safe.errorCode ?? null,
    reflectionTriggered: false,
    outcome: 'UNKNOWN',
    signals: [],
    reviews: [],
    learningCandidates: [],
    conflicts: [],
    risks: [],
    diagnostics: ['SHADOW_ONLY'],
    suggestions: ['NO_ACTION'],
    recommendedNextStep: 'NO_ACTION',
    evidenceSummary: { totalSignals: 0, totalEvidence: 0 },
    confidenceSummary: { average: 0, max: 0 },
    prioritySummary: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, IGNORE: 0, UNDETERMINED: 0 },
    shadow: { shadowMode: safe.shadowMode ?? true },
    latencyMs: 0,
    telemetry: null,
  });
}
