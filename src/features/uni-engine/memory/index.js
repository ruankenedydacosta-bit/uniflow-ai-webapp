// Memória Inteligente Persistente do Uni Engine (Fase 3).
//
// Subsistema de memória seletiva, auditável, reversível e isolada por
// usuário/workspace. Nesta fase ela apenas:
//   - registra candidatos;
//   - consolida evidências determinísticas;
//   - recupera memórias relevantes (ranking limitado);
//   - disponibiliza contexto ao Uni Engine em Shadow Mode.
//
// NUNCA altera conta, categoria, transação, saldo, intenção, resposta final,
// execução, confirmação ou o comportamento do pipeline atual.
export {
  MEMORY_TYPES,
  MEMORY_STATUSES,
  EVIDENCE_TYPES,
  MEMORY_SOURCES,
  SUBJECT_KINDS,
  FORBIDDEN_MEMORY_KEYS,
  isValidMemoryType,
  isValidMemoryStatus,
  isValidEvidenceType,
  isValidMemorySource,
  isValidSubjectKind,
  containsForbiddenKey,
  normalizeMemoryText,
} from './memoryTypes.js';
export {
  MEMORY_POLICY,
  clamp01,
  clampMinusOneOne,
  computeConfidence,
  describeConfidence,
  getEvidenceWeight,
  getRetentionForType,
  initialStatusForEvidence,
} from './memoryPolicy.js';
export {
  createEvidence,
  createMemoryItem,
  validateEvidence,
  validateMemoryItem,
  serializeMemoryItem,
  projectMemoryForEngine,
  buildItemFromCandidate,
  buildEvidenceKey,
  computeExpiresAt,
  isValidUuid,
} from './memoryContracts.js';
export {
  normalizeMemoryEntity,
  normalizeMemorySubject,
  parseMemorySubject,
  areSameSubject,
} from './normalizeMemorySubject.js';
export { evaluateMemoryCandidate } from './evaluateMemoryCandidate.js';
export { consolidateMemoryEvidence } from './consolidateMemoryEvidence.js';
export { resolveMemoryConflict } from './resolveMemoryConflict.js';
export { retrieveRelevantMemories } from './retrieveRelevantMemories.js';
export { createMemoryCache } from './memoryCache.js';
export {
  MEMORY_REPOSITORY_METHODS,
  createRepoResult,
  createRepoError,
  normalizeRepoError,
  validateMemoryScope,
} from './repositories/memoryRepository.js';
export { createInMemoryMemoryRepository } from './repositories/inMemoryMemoryRepository.js';
export { createSupabaseMemoryRepository } from './repositories/supabaseMemoryRepository.js';
export { createUniMemoryService } from './uniMemoryService.js';
export {
  buildMemoryTelemetry,
  emitMemoryTelemetry,
} from './telemetry/memoryTelemetry.js';
export {
  MEMORY_TELEMETRY_ALLOWED_FIELDS,
  redactMemoryTelemetry,
  buildRedactedMemoryTelemetryEntry,
} from './telemetry/redactMemoryTelemetry.js';
