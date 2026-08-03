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

// Helper para validar tipos
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
