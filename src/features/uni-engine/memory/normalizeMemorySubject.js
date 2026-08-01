// Normalização de subjectKey da Memória Inteligente Persistente (Fase 3).
//
// subjectKey é a identidade canônica de um sujeito de memória — SÓ é aceita a
// forma `kind::entidade_normalizada`. A normalização é determinística:
// minúsculas, sem acentos, sem pontuação, entidade única.
//
// Kinds aceitos (SUBJECT_KINDS): merchant_category, merchant_account, account,
// category, merchant, fact, procedure, style.
import {
  isValidSubjectKind,
  normalizeMemoryText,
  SUBJECT_KINDS,
} from './memoryTypes.js';
import { MEMORY_POLICY } from './memoryPolicy.js';

const KIND_PREFIX_PATTERN = /^(merchant_category|merchant_account|account|category|merchant|fact|procedure|style)::(.+)$/;

// Normaliza uma entidade (ex.: "Padaria São José" → "padaria sao jose").
export function normalizeMemoryEntity(entity) {
  const normalized = normalizeMemoryText(entity);
  return normalized.slice(0, MEMORY_POLICY.maxSubjectKeyLength - 16);
}

// Constroi a subjectKey canônica a partir de kind + entidade.
export function normalizeMemorySubject({ kind, entity } = {}) {
  if (!isValidSubjectKind(kind)) return null;
  const normalizedEntity = normalizeMemoryEntity(entity);
  if (!normalizedEntity) return null;
  return `${kind}::${normalizedEntity}`;
}

// Interpreta uma subjectKey de volta em { kind, entity } (null se inválida).
export function parseMemorySubject(subjectKey) {
  if (typeof subjectKey !== 'string' || !subjectKey.trim()) return null;
  const match = subjectKey.trim().toLowerCase().match(KIND_PREFIX_PATTERN);
  if (!match) return null;
  return { kind: match[1], entity: match[2] };
}

// Compara duas subjectKeys de forma leniente (mesmo kind + entidade).
export function areSameSubject(left, right) {
  if (!left || !right) return false;
  const leftParsed = parseMemorySubject(left);
  const rightParsed = parseMemorySubject(right);
  if (!leftParsed || !rightParsed) return false;
  return leftParsed.kind === rightParsed.kind
    && leftParsed.entity === rightParsed.entity;
}

export { SUBJECT_KINDS };
