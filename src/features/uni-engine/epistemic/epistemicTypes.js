// Knowledge types for the Epistemic Engine
// Estados fechados e imutáveis para o motor epistemológico

// Tipos de conhecimento
export const KNOWLEDGE_TYPES = Object.freeze([
  'FACT',
  'USER_REPORTED_FACT',
  'SYSTEM_CONFIRMED_FACT',
  'FINANCIAL_CONFIRMED_FACT',
  'INFERENCE',
  'HYPOTHESIS',
  'INTERPRETATION',
  'OPINION',
  'UNKNOWN',
]);

// Estados do conhecimento
export const KNOWLEDGE_STATUSES = Object.freeze([
  'ACTIVE',
  'UNVERIFIED',
  'VERIFIED',
  'CONTRADICTED',
  'STALE',
  'INVALIDATED',
  'SUPERSEDED',
  'UNKNOWN',
]);

// Tipos de evidência
export const EVIDENCE_TYPES = Object.freeze([
  'USER_STATEMENT',
  'FINANCIAL_RECORD',
  'SYSTEM_RECORD',
  'TOOL_RESULT',
  'MEMORY_RECORD',
  'DERIVED_CALCULATION',
  'EXTERNAL_PROVIDER',
  'NONE',
]);

// Fontes do conhecimento
export const SOURCE_TYPES = Object.freeze([
  'USER',
  'APPLICATION',
  'SUPABASE',
  'FINANCIAL_ENGINE',
  'OPENAI',
  'TOOL',
  'MEMORY',
  'SYSTEM',
  'UNKNOWN',
]);

// Níveis de confiança normalizados 0-1
export const CONFIDENCE_LEVELS = Object.freeze([
  'NONE',
  'LOW',
  'MEDIUM',
  'HIGH',
  'VERIFIED',
]);

// EPISTEMIC_VERSION para compatibilidade API
export const EPISTEMIC_VERSION = '1.0';

// ---- Compatibilidade com API Fase 4 (testes legados) ----

export const EPISTEMIC_SOURCES = Object.freeze([
  'database_record',
  'financial_snapshot',
  'user_explicit_statement',
  'user_confirmation',
  'user_correction',
  'conversation_context',
  'persistent_memory',
  'operational_memory',
  'deterministic_inference',
  'system_rule',
  'external_source',
  'unknown',
]);

export const EPISTEMIC_CLAIM_TYPES = Object.freeze([
  'fact',
  'user_claim',
  'inference',
  'hypothesis',
  'preference',
  'correction',
  'absence',
  'conflict',
  'temporal_state',
]);

export const EPISTEMIC_STATUSES = Object.freeze([
  'confirmed',
  'supported',
  'probable',
  'possible',
  'hypothesis',
  'missing',
  'ambiguous',
  'conflicting',
  'stale',
  'invalid',
  'unknown',
]);

export const EPISTEMIC_EVIDENCE_TYPES = Object.freeze([
  'direct_database',
  'direct_user_statement',
  'user_confirmation',
  'user_correction',
  'repeated_observation',
  'memory_retrieval',
  'context_reference',
  'deterministic_rule',
  'contradicting_evidence',
]);

export const LEGACY_EPISTEMIC_STATUSES = Object.freeze([
  'confirmed_database',
  'confirmed_user',
  'inferred_high',
  'inferred_low',
  'ambiguous',
  'missing',
  'stale',
  'conflicting',
]);

export const LEGACY_STATUS_MIGRATION = Object.freeze({
  confirmed_database: 'confirmed',
  confirmed_user: 'supported',
  inferred_high: 'probable',
  inferred_low: 'possible',
  missing: 'missing',
  conflicting: 'conflicting',
  stale: 'stale',
  ambiguous: 'ambiguous',
});

export function mapLegacyEpistemicStatus(status) {
  return LEGACY_STATUS_MIGRATION[status] ?? null;
}

export function isValidEpistemicSource(value) {
  return EPISTEMIC_SOURCES.includes(value);
}

export function isValidEpistemicStatus(value) {
  return EPISTEMIC_STATUSES.includes(value);
}

export function isValidEpistemicClaimType(value) {
  return EPISTEMIC_CLAIM_TYPES.includes(value);
}

export function isValidEpistemicEvidenceType(value) {
  return EPISTEMIC_EVIDENCE_TYPES.includes(value);
}

// ---- Tipos EPISTEMIC relacionados usados pelo Cognitive Orchestrator e outros ----

export const EPISTEMIC_CONFLICT_TYPES = Object.freeze([
  'AMBIGUOUS',
  'MULTIPLE_SOURCES',
  'WEIGHTED_INCORRECT',
  'INSUFFICIENT_EVIDENCE',
  'STALE',
]);

export const EPISTEMIC_STALENESS_STATES = Object.freeze([
  'ACTIVE',
  'OBSOLETE',
  'STALE',
  'SUPERSEDED',
]);

export const EPISTEMIC_SUFFICIENCY_PURPOSES = Object.freeze([
  'DECISION_MAKING',
  'RESPONSE_GENERATION',
  'MEMORY_UPDATING',
  'ACTION_TRIGGERING',
]);

export const EPISTEMIC_USAGE_RESULTS = Object.freeze([
  'ACCEPT',
  'REJECT',
  'MODIFY',
  'NO_DECISION',
]);

export function isValidEpistemicConflictType(value) {
  return EPISTEMIC_CONFLICT_TYPES.includes(value);
}

export function isValidEpistemicStalenessState(value) {
  return EPISTEMIC_STALENESS_STATES.includes(value);
}

export function isValidEpistemicSufficiencyPurpose(value) {
  return EPISTEMIC_SUFFICIENCY_PURPOSES.includes(value);
}

export function isValidEpistemicUsageResult(value) {
  return EPISTEMIC_USAGE_RESULTS.includes(value);
}

export function describeEpistemicConfidence(confidence) {
  if (typeof confidence !== 'number' || !Number.isFinite(confidence)) return 'UNKNOWN';
  for (const band of EPISTEMIC_CONFIDENCE_BANDS) {
    if (confidence >= band.min && confidence <= band.max) return band.label;
  }
  return 'UNKNOWN';
}

// Helper para validar tipos (novos)
export function isValidKnowledgeType(value) {
  return KNOWLEDGE_TYPES.includes(value);
}

export function isValidKnowledgeStatus(value) {
  return KNOWLEDGE_STATUSES.includes(value);
}

export function isValidEvidenceType(value) {
  return EVIDENCE_TYPES.includes(value);
}

export function isValidSourceType(value) {
  return SOURCE_TYPES.includes(value);
}

export function isValidConfidenceLevel(value) {
  return CONFIDENCE_LEVELS.includes(value);
}

export const EPISTEMIC_USABLE_FOR_CAPABILITIES = Object.freeze([
  'display',
  'suggestion',
  'question',
  'confirmation',
  'execution',
  'memory_candidate',
  'none',
]);

export const EPISTEMIC_CONFIDENCE_BANDS = Object.freeze([
  { label: 'insufficient', min: 0.0, max: 0.24 },
  { label: 'low', min: 0.25, max: 0.49 },
  { label: 'moderate', min: 0.5, max: 0.69 },
  { label: 'high', min: 0.7, max: 0.89 },
  { label: 'very_high', min: 0.9, max: 1.0 },
]);
