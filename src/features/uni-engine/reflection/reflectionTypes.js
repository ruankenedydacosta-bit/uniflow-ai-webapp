// Tipos fechados e validados do Reflection & Learning Engine (Fase 8).
//
// Nenhum valor fora destes enums é aceito pelos contratos. A Fase 8 apenas
// REFLETE e GERA candidatos em Shadow Mode — nada aqui autoriza aplicar,
// persistir ou mudar comportamento.
//
// Os enums espelham a especificação da Fase 8 — nunca uma lista paralela
// divergente das demais fases.

export const REFLECTION_OUTCOMES = Object.freeze([
  'SUCCESS_CONFIRMED',
  'SUCCESS_INFERRED',
  'PARTIAL_SUCCESS',
  'USER_CORRECTED',
  'USER_REJECTED',
  'USER_CANCELLED',
  'SYSTEM_ERROR',
  'PROVIDER_ERROR',
  'AMBIGUOUS_RESULT',
  'UNRESOLVED',
  'ABANDONED',
  'UNKNOWN',
]);

export const REFLECTION_SIGNAL_TYPES = Object.freeze([
  'INTENT_MISMATCH',
  'ENTITY_MISMATCH',
  'ACCOUNT_MISMATCH',
  'CATEGORY_MISMATCH',
  'AMOUNT_MISMATCH',
  'DATE_MISMATCH',
  'CONTEXT_LOST',
  'MEMORY_CONFLICT',
  'EPISTEMIC_CONFLICT',
  'DECISION_MISMATCH',
  'PLANNING_MISMATCH',
  'GOAL_MISMATCH',
  'EXECUTOR_MISMATCH',
  'USER_CORRECTION',
  'USER_REJECTION',
  'USER_REPETITION',
  'LOW_CONFIDENCE',
  'STALE_INFORMATION',
  'MISSING_INFORMATION',
  'UNNECESSARY_QUESTION',
  'MISSING_QUESTION',
  'DUPLICATED_RESPONSE',
  'VOICE_FAILURE',
  'PROVIDER_FAILURE',
  'SUCCESSFUL_PATTERN',
  'UNKNOWN',
]);

export const LEARNING_CANDIDATE_TYPES = Object.freeze([
  'INTENT_PATTERN',
  'ENTITY_EXTRACTION_PATTERN',
  'ACCOUNT_PREFERENCE',
  'CATEGORY_PREFERENCE',
  'MERCHANT_CATEGORY_ASSOCIATION',
  'MERCHANT_ACCOUNT_ASSOCIATION',
  'CONVERSATION_PREFERENCE',
  'RESPONSE_STYLE_PREFERENCE',
  'USER_CORRECTION_PATTERN',
  'CONTEXT_RESOLUTION_PATTERN',
  'QUESTION_STRATEGY',
  'DECISION_POLICY_SIGNAL',
  'PLANNING_POLICY_SIGNAL',
  'GOAL_POLICY_SIGNAL',
  'EPISTEMIC_POLICY_SIGNAL',
  'ERROR_PREVENTION_PATTERN',
  'SUCCESS_REINFORCEMENT',
  'DO_NOT_LEARN',
  'UNKNOWN',
]);

export const LEARNING_CANDIDATE_STATUSES = Object.freeze([
  'DETECTED',
  'CANDIDATE',
  'NEEDS_EVIDENCE',
  'SUPPORTED',
  'HIGH_CONFIDENCE',
  'CONFLICTING',
  'REJECTED',
  'EXPIRED',
  'SUPERSEDED',
  'SHADOW_APPROVED',
  'UNKNOWN',
]);

export const LEARNING_PRIORITIES = Object.freeze([
  'CRITICAL',
  'HIGH',
  'MEDIUM',
  'LOW',
  'IGNORE',
  'UNDETERMINED',
]);

export const LEARNING_RISK_LEVELS = Object.freeze([
  'NONE',
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
  'UNKNOWN',
]);

export const REFLECTION_LAYERS = Object.freeze([
  'classification',
  'epistemic',
  'decision',
  'planning',
  'goals',
  'memory',
  'executor',
  'pipeline',
  'unknown',
]);

export const REVIEW_STATUSES = Object.freeze([
  'ALIGNED',
  'DIVERGENT',
  'BLOCKED',
  'NOT_APPLICABLE',
  'UNKNOWN',
]);

export const RECOMMENDED_NEXT_STEPS = Object.freeze([
  'NO_ACTION',
  'REVIEW_CANDIDATES',
  'CONFIRM_PREFERENCE',
  'GATHER_EVIDENCE',
  'ASK_USER',
  'RETRY_LATER',
  'INVESTIGATE',
  'UNKNOWN',
]);

export const LEARNING_RISK_CODES = Object.freeze([
  'SENSITIVE_DATA',
  'OTHER_WORKSPACE',
  'EXCEPTION_AS_RULE',
  'SINGLE_WEAK_EVIDENCE',
  'REINFORCE_INCORRECT',
  'PREFERENCE_OVERRIDES_FACT',
  'HYPOTHESIS_AS_FACT',
  'EXTERNAL_FAILURE_AS_PREFERENCE',
  'CONTEXT_CORRECTION_AS_PERMANENT',
  'NONE',
]);

export const LEARNING_CONFLICT_TYPES = Object.freeze([
  'VALUE_CONFLICT',
  'CONTRACT_CONFLICT',
  'NONE',
]);

export const LEARNING_SUGGESTIONS = Object.freeze([
  'CONFIRM_PREFERENCE_WITH_USER',
  'ASK_BEFORE_LEARNING',
  'GATHER_MORE_EVIDENCE',
  'REVIEW_QUESTION_STRATEGY',
  'EXPECT_CORRECTION_RECURRENCE',
  'AVOID_LEARNING_FROM_FAILURE',
  'NO_ACTION',
]);

export const REFLECTION_DIAGNOSTICS = Object.freeze([
  'REFLECTION_TRIGGERED',
  'OUTCOME_CLASSIFIED',
  'CORRECTION_DETECTED',
  'NO_CORRECTION_DETECTED',
  'SIGNALS_LIMITED',
  'CANDIDATES_LIMITED',
  'PROVIDER_FAILURE_IGNORED',
  'SENSITIVE_CONTENT_BLOCKED',
  'SHADOW_ONLY',
  'CANDIDATES_DISABLED',
  'FALLBACK_USED',
  'SUCCESSFUL_PATTERN_DETECTED',
  'NO_LEARNING_APPLIED',
]);

function includes(list, value) {
  return list.includes(value);
}

export function isValidReflectionOutcome(value) {
  return includes(REFLECTION_OUTCOMES, value);
}

export function isValidReflectionSignalType(value) {
  return includes(REFLECTION_SIGNAL_TYPES, value);
}

export function isValidLearningCandidateType(value) {
  return includes(LEARNING_CANDIDATE_TYPES, value);
}

export function isValidLearningCandidateStatus(value) {
  return includes(LEARNING_CANDIDATE_STATUSES, value);
}

export function isValidLearningPriority(value) {
  return includes(LEARNING_PRIORITIES, value);
}

export function isValidLearningRiskLevel(value) {
  return includes(LEARNING_RISK_LEVELS, value);
}

export function isValidReflectionLayer(value) {
  return includes(REFLECTION_LAYERS, value);
}

export function isValidReviewStatus(value) {
  return includes(REVIEW_STATUSES, value);
}

export function isValidRecommendedNextStep(value) {
  return includes(RECOMMENDED_NEXT_STEPS, value);
}

export function isValidLearningRiskCode(value) {
  return includes(LEARNING_RISK_CODES, value);
}

export function isValidLearningConflictType(value) {
  return includes(LEARNING_CONFLICT_TYPES, value);
}

export function isValidLearningSuggestion(value) {
  return includes(LEARNING_SUGGESTIONS, value);
}

export function isValidReflectionDiagnostic(value) {
  return includes(REFLECTION_DIAGNOSTICS, value);
}
