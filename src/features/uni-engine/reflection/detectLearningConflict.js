// Detecção de conflitos entre candidatos de aprendizado (Fase 8).
//
// Conflito explícito: mesmo subjectKey com valores normalizados diferentes.
// Exemplo:
//   Candidato antigo: "Mercado → Nubank"
//   Nova correção:    "Use Caixa para mercado"
// Resultado: conflito registrado; candidato anterior pode ser superseded no
// diagnóstico; o novo candidato NUNCA é aplicado.
import { isValidLearningConflictType } from './reflectionTypes.js';

export function detectLearningConflict(options = {}) {
  const safe = options && typeof options === 'object' ? options : {};
  const candidates = Array.isArray(safe.candidates) ? safe.candidates : [];
  const conflicts = [];

  for (let i = 0; i < candidates.length; i += 1) {
    const left = candidates[i];
    if (!left?.subjectKey) continue;
    for (let j = i + 1; j < candidates.length; j += 1) {
      const right = candidates[j];
      if (right?.subjectKey !== left.subjectKey) continue;
      if (left.normalizedValue === right.normalizedValue) continue;

      const older = left.createdAt && right.createdAt && left.createdAt < right.createdAt
        ? left
        : right;
      const newer = older === left ? right : left;
      conflicts.push({
        type: 'VALUE_CONFLICT',
        candidateId: newer.candidateId,
        subjectKey: left.subjectKey,
        oldValue: older.normalizedValue,
        newValue: newer.normalizedValue,
        supersededCandidateId: older.candidateId,
        recommendedAction: 'CONFIRM_PREFERENCE_WITH_USER',
      });
    }
  }

  const uniqueConflicts = [];
  const seen = new Set();
  for (const conflict of conflicts) {
    const key = `${conflict.subjectKey}::${conflict.oldValue}::${conflict.newValue}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueConflicts.push(conflict);
  }

  return uniqueConflicts;
}

export function isValidConflictType(type) {
  return isValidLearningConflictType(type);
}
