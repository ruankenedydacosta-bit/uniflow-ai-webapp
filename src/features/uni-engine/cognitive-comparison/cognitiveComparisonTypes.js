// Uni Engine — Cognitive Comparison (Fase 14, Bloco 3).
//
// Comparador observacional "legado × Engine": compara a interpretação e a
// decisão da Uni Engine com o resultado REAL do pipeline legado no MESMO
// turno. O comparador é PURAMENTE DIAGNÓSTICO — nunca altera resposta, nunca
// aplica rota, nunca executa, nunca persiste. Produz um objeto totalmente
// serializável (turnId, messageId, intents, rotas, ações, status de
// concordância, divergência, severidade, códigos de razão, timestamps) e
// registra explicitamente que nenhuma influência foi aplicada.
//
// Classificações finais de concordância/divergência (vocabulário fechado).
export const COGNITIVE_COMPARISON_VERSION = '1.0';

// Status final de concordância da comparação.
export const COGNITIVE_AGREEMENT_STATUSES = Object.freeze([
  'agreement',
  'partial_agreement',
  'divergence',
  'insufficient_data',
  'engine_error',
  'skipped',
]);

// Tipos de divergência suportados (somente quando deriváveis dos dados).
export const COGNITIVE_DIVERGENCE_TYPES = Object.freeze([
  'intent_mismatch',
  'route_mismatch',
  'action_mismatch',
  'confidence_mismatch',
  'epistemic_conflict',
  'missing_context',
  'legacy_fallback',
  'engine_fallback',
]);

// Severidade da divergência (vocabulário fechado).
export const COGNITIVE_DIVERGENCE_SEVERITIES = Object.freeze([
  'low',
  'medium',
  'high',
  'critical',
]);

// Códigos de razão fechados da comparação (nenhum texto livre).
export const COGNITIVE_COMPARISON_REASON_CODES = Object.freeze([
  'ENGINE_DISABLED',
  'ENGINE_ERROR',
  'ENGINE_CRASHED',
  'LEGACY_UNAVAILABLE',
  'INTENT_MATCH',
  'INTENT_MISMATCH',
  'ROUTE_MATCH',
  'ROUTE_MISMATCH',
  'ACTION_MATCH',
  'ACTION_MISMATCH',
  'CONFIDENCE_GAP',
  'EPISTEMIC_CONFLICT',
  'MISSING_CONTEXT',
  'LEGACY_FALLBACK',
  'ENGINE_FALLBACK',
  'LOW_CONFIDENCE',
  'NO_INFLUENCE',
  'UNKNOWN',
]);

export function isCognitiveAgreementStatus(value) {
  return COGNITIVE_AGREEMENT_STATUSES.includes(value);
}

export function isCognitiveDivergenceType(value) {
  return COGNITIVE_DIVERGENCE_TYPES.includes(value);
}

export function isCognitiveDivergenceSeverity(value) {
  return COGNITIVE_DIVERGENCE_SEVERITIES.includes(value);
}

export function isCognitiveComparisonReasonCode(value) {
  return COGNITIVE_COMPARISON_REASON_CODES.includes(value);
}