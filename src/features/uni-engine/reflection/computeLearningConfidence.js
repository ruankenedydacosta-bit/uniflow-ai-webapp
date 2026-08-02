// Confiança de um candidato de aprendizado (Fase 8).
//
// Escala 0–1, determinística, sem aleatoriedade. Todos os pesos e thresholds
// ficam em reflectionPolicy.js. Considera: correção explícita, confirmação,
// repetição, consistência, conflito, risco, origem, recência, número de
// evidências e status epistêmico.
import {
  REFLECTION_POLICY,
  clamp01,
} from './reflectionPolicy.js';

export function computeLearningConfidence(options = {}) {
  const safe = options && typeof options === 'object' ? options : {};
  const weights = REFLECTION_POLICY.confidenceWeights;
  const evidence = Array.isArray(safe.evidence) ? safe.evidence : [];

  let confidence = weights.base;

  // Correção explícita do usuário — sinal mais forte.
  if (safe.explicitCorrection) confidence += weights.explicitCorrection;

  // Confirmação explícita.
  if (safe.userConfirmation) confidence += weights.userConfirmation;

  // Repetição consistente.
  const repetitions = Number.isFinite(safe.repetitionCount) ? safe.repetitionCount : 0;
  if (repetitions >= REFLECTION_POLICY.repetitionThreshold) {
    confidence += weights.repetition;
  }

  // Consistência: quanto mais evidências independentes, mais confiança
  // (limitado para evitar supervalorização).
  const consistency = Math.min(evidence.length, 3);
  confidence += weights.consistency * consistency;

  // Conflitos reduzem.
  if (safe.conflictCount > 0) confidence += weights.conflictPenalty;

  // Evidência fraca (ocorrência única sem correção) penaliza.
  if (safe.weakEvidence) confidence += weights.weakEvidencePenalty;

  // Informação stale reduz.
  if (safe.stale) confidence += weights.stalePenalty;

  // Falha de provider nunca vira aprendizado.
  if (safe.providerFailure) confidence += weights.providerFailurePenalty;

  // Outro workspace nunca vira aprendizado.
  if (safe.otherWorkspace) confidence += weights.otherWorkspacePenalty;

  // Status epistêmico.
  if (safe.epistemicStatus === 'confirmed_database' || safe.epistemicStatus === 'confirmed_user') {
    confidence += 0.1;
  } else if (safe.epistemicStatus === 'inferred_low') {
    confidence -= 0.1;
  }

  const clamped = clamp01(confidence);
  return Math.round(clamped * 1000) / 1000;
}
