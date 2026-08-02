// Sugestões de aprendizado futuro (Fase 8).
//
// Produz sugestões NÃO executáveis e o próximo passo recomendado. Nada aqui
// pode ser executado automaticamente — apenas informa a direção segura.
import { isValidLearningSuggestion } from './reflectionTypes.js';

export function buildLearningSuggestions(options = {}) {
  const safe = options && typeof options === 'object' ? options : {};
  const candidates = Array.isArray(safe.candidates) ? safe.candidates : [];
  const conflicts = Array.isArray(safe.conflicts) ? safe.conflicts : [];
  const outcome = safe.outcome ?? 'UNKNOWN';
  const suggestions = [];

  if (conflicts.length > 0) {
    suggestions.push('CONFIRM_PREFERENCE_WITH_USER');
  }
  if (candidates.some((candidate) => candidate?.status === 'NEEDS_EVIDENCE')) {
    suggestions.push('GATHER_MORE_EVIDENCE');
  }
  if (candidates.some((candidate) => candidate?.restrictions?.includes('RISK_BLOCKED'))) {
    suggestions.push('ASK_BEFORE_LEARNING');
  }
  if (candidates.some((candidate) => candidate?.type === 'QUESTION_STRATEGY')) {
    suggestions.push('REVIEW_QUESTION_STRATEGY');
  }
  if (outcome === 'PROVIDER_ERROR' || outcome === 'SYSTEM_ERROR') {
    suggestions.push('AVOID_LEARNING_FROM_FAILURE');
  }
  if (suggestions.length === 0) {
    suggestions.push('NO_ACTION');
  }

  return suggestions.filter(isValidLearningSuggestion);
}

export function recommendNextStep(options = {}) {
  const safe = options && typeof options === 'object' ? options : {};
  const candidates = Array.isArray(safe.candidates) ? safe.candidates : [];
  const conflicts = Array.isArray(safe.conflicts) ? safe.conflicts : [];
  const outcome = safe.outcome ?? 'UNKNOWN';

  if (conflicts.length > 0) return 'CONFIRM_PREFERENCE';
  if (candidates.some((candidate) => candidate?.status === 'CONFLICTING')) {
    return 'CONFIRM_PREFERENCE';
  }
  if (candidates.length > 0) return 'REVIEW_CANDIDATES';
  if (outcome === 'PROVIDER_ERROR') return 'RETRY_LATER';
  if (candidates.some((candidate) => candidate?.status === 'NEEDS_EVIDENCE')) {
    return 'GATHER_EVIDENCE';
  }
  return 'NO_ACTION';
}
