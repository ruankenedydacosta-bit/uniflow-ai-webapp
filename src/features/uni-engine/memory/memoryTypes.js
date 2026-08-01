// Tipos fechados e validados da Memória Inteligente Persistente (Fase 3).
//
// Nenhum valor fora destes enums é aceito pelos contratos. Os enums espelham
// exatamente os checks da migration 028 (uni_engine_memory_items e
// uni_engine_memory_evidence) — nunca uma lista paralela divergente.
//
// FORBIDDEN_MEMORY_KEYS é reutilizado do módulo de memória financeira já
// validado (src/features/uni-memory) — mesma política de redação, sem duplicar
// a lista.
import {
  FORBIDDEN_MEMORY_KEYS,
  normalizeMemoryText,
} from '../../uni-memory/memoryTypes.js';

export {
  FORBIDDEN_MEMORY_KEYS,
  normalizeMemoryText,
};

// Tipos mínimos da Fase 3 (especificação, seção 2).
export const MEMORY_TYPES = Object.freeze([
  'user_preference',
  'conversation_preference',
  'account_preference',
  'category_preference',
  'merchant_category_association',
  'merchant_account_association',
  'user_correction',
  'recurring_pattern',
  'user_declared_fact',
  'episodic_context',
  'procedure_preference',
]);

// Estados explícitos de cada item de memória (especificação, seção 3).
export const MEMORY_STATUSES = Object.freeze([
  'candidate',
  'confirmed',
  'active',
  'contested',
  'superseded',
  'expired',
  'deleted',
  'rejected',
]);

// Tipos de evidência suportados (especificação, seção 5).
export const EVIDENCE_TYPES = Object.freeze([
  'explicit_user_statement',
  'user_confirmation',
  'user_correction',
  'repeated_selection',
  'accepted_suggestion',
  'rejected_suggestion',
  'behavior_pattern',
  'system_observation',
]);

// Origem do item de memória (quem observou/afirmou).
export const MEMORY_SOURCES = Object.freeze([
  'user',
  'conversation',
  'engine',
  'financial',
  'system',
]);

// Tipos de sujeito usados na normalização de subjectKey (`kind::entity`).
export const SUBJECT_KINDS = Object.freeze([
  'merchant_category',
  'merchant_account',
  'account',
  'category',
  'merchant',
  'fact',
  'procedure',
  'style',
]);

export function isValidMemoryType(value) {
  return MEMORY_TYPES.includes(value);
}

export function isValidMemoryStatus(value) {
  return MEMORY_STATUSES.includes(value);
}

export function isValidEvidenceType(value) {
  return EVIDENCE_TYPES.includes(value);
}

export function isValidMemorySource(value) {
  return MEMORY_SOURCES.includes(value);
}

export function isValidSubjectKind(value) {
  return SUBJECT_KINDS.includes(value);
}

// Verifica se um texto contém chave/palavra proibida (reuso da política da
// memória financeira: token, secret, password, credential, audio, transcript,
// health, religion, politics...).
export function containsForbiddenKey(value) {
  if (typeof value !== 'string') return false;
  const normalized = value.toLowerCase();
  return FORBIDDEN_MEMORY_KEYS.some((key) => normalized.includes(key));
}
