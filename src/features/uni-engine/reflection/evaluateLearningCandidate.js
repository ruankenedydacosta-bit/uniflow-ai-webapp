// Avaliação final de um candidato de aprendizado (Fase 8).
//
// Aplica status, expiração, deduplicação e bloqueio por risco. Nenhum
// candidato chega a "applied" nesta fase — `shadow.applied`, `persisted` e
// `changedBehavior` permanecem falsos.
import { REFLECTION_POLICY, isEphemeralCandidateType } from './reflectionPolicy.js';
import { detectLearningConflict } from './detectLearningConflict.js';
import { isLearningBlockedByRisk } from './detectLearningRisk.js';

export function evaluateLearningCandidate(options = {}) {
  const safe = options && typeof options === 'object' ? options : {};
  const candidate = safe.candidate ?? null;
  const now = Number.isFinite(safe.now) ? safe.now : Date.now();
  const existingCandidates = Array.isArray(safe.existingCandidates) ? safe.existingCandidates : [];

  if (!candidate) return null;

  const copy = { ...candidate };

  // 1. Bloqueio por risco alto/crítico.
  if (isLearningBlockedByRisk(copy.risk)) {
    copy.status = 'REJECTED';
    copy.restrictions = [...(copy.restrictions ?? []), 'RISK_BLOCKED'];
    copy.shadow = { ...copy.shadow, applied: false, persisted: false, changedBehavior: false };
    return copy;
  }

  // 2. Expiração.
  const expiresAt = typeof copy.expiresAt === 'string' ? Date.parse(copy.expiresAt) : NaN;
  if (Number.isFinite(expiresAt) && expiresAt <= now) {
    copy.status = 'EXPIRED';
    copy.shadow = { ...copy.shadow, applied: false, persisted: false, changedBehavior: false };
    return copy;
  }

  // 3. Conflito com candidatos existentes.
  const conflicts = detectLearningConflict({
    candidates: [...existingCandidates, copy],
  });
  if (conflicts.length > 0) {
    copy.status = 'CONFLICTING';
    copy.conflicts = conflicts;
    copy.shadow = { ...copy.shadow, applied: false, persisted: false, changedBehavior: false };
    return copy;
  }

  // 4. Superseded: candidato existente com mesma subjectKey e valor
  //    diferente e mais recente.
  const existingSameKey = existingCandidates.filter((item) => item?.subjectKey === copy.subjectKey);
  if (existingSameKey.some((item) => item?.normalizedValue !== copy.normalizedValue)) {
    copy.status = 'SUPERSEDED';
    copy.shadow = { ...copy.shadow, applied: false, persisted: false, changedBehavior: false };
    return copy;
  }

  // 5. Status por confiança.
  const confidence = typeof copy.confidence === 'number' ? copy.confidence : 0;
  if (confidence >= REFLECTION_POLICY.highConfidence) {
    copy.status = 'HIGH_CONFIDENCE';
  } else if (confidence >= REFLECTION_POLICY.supportedConfidence) {
    copy.status = 'SUPPORTED';
  } else if (confidence >= REFLECTION_POLICY.minCandidateConfidence) {
    copy.status = 'CANDIDATE';
  } else {
    copy.status = 'NEEDS_EVIDENCE';
  }

  // Candidatos efêmeros nunca alcançam status estável alto.
  if (isEphemeralCandidateType(copy.type) && copy.status === 'HIGH_CONFIDENCE') {
    copy.status = 'SUPPORTED';
  }

  copy.shadow = { ...copy.shadow, applied: false, persisted: false, changedBehavior: false };
  return copy;
}
