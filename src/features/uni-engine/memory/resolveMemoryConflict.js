// Resolução de conflito entre memória existente e novo candidato (Fase 3).
//
// resolveMemoryConflict(current, candidate):
//   - same                   → mesmo sujeito e mesmo valor normalizado;
//   - reinforce              → mesmo sujeito, valores compatíveis;
//   - contest                → mesmo sujeito, valor diferente, memória atual
//                              com confiança alta → marca contestada;
//   - supersede              → mesmo sujeito, valor diferente E o candidato
//                              veio de correção explícita do usuário;
//   - ignore                 → fora de escopo (sujeito diferente) ou candidato
//                              de confiança baixa sem confirmação;
//   - requires_confirmation  → mesmo sujeito, valor diferente, sem correção
//                              explícita e sem confiança alta → pede confirmação.
//
// Função pura — nunca altera dados nem executa nada.
import {
  areSameSubject,
} from './normalizeMemorySubject.js';
import { MEMORY_POLICY } from './memoryPolicy.js';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeComparisonValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.toLowerCase().trim();
  if (typeof value === 'number') return String(value);
  if (isPlainObject(value)) {
    return JSON.stringify(Object.fromEntries(
      Object.entries(value)
        .map(([key, item]) => [key, normalizeComparisonValue(item)])
        .sort(([a], [b]) => a.localeCompare(b)),
    ));
  }
  if (Array.isArray(value)) {
    return JSON.stringify(value.map((item) => normalizeComparisonValue(item)).sort());
  }
  return String(value);
}

function isCorrectionCandidate(candidate) {
  return candidate?.evidenceType === 'user_correction'
    || candidate?.memoryType === 'user_correction';
}

export function resolveMemoryConflict(current = null, candidate = null, policy = MEMORY_POLICY) {
  const safePolicy = isPlainObject(policy) ? policy : MEMORY_POLICY;
  if (!isPlainObject(current) || !isPlainObject(candidate)) {
    return { outcome: 'ignore', reason: 'missing_input' };
  }

  if (!current.subjectKey || !candidate.subjectKey || !areSameSubject(current.subjectKey, candidate.subjectKey)) {
    return { outcome: 'ignore', reason: 'different_subject' };
  }

  const currentValue = normalizeComparisonValue(current.value);
  const candidateValue = normalizeComparisonValue(candidate.value);

  if (currentValue === candidateValue) {
    return { outcome: 'same', reason: 'same_value' };
  }

  if (isCorrectionCandidate(candidate)) {
    return { outcome: 'supersede', reason: 'explicit_correction' };
  }

  const currentConfidence = Number(current.confidence) || 0;
  const candidateConfidence = Number(candidate.confidence) || 0;

  if (currentConfidence >= safePolicy.confidence.highMax && candidateConfidence < currentConfidence) {
    return { outcome: 'contest', reason: 'current_high_confidence' };
  }

  if (candidateConfidence < safePolicy.confidence.moderateMax) {
    return { outcome: 'requires_confirmation', reason: 'low_candidate_confidence' };
  }

  return { outcome: 'requires_confirmation', reason: 'different_value_without_correction' };
}
