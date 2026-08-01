// Confiança determinística do Modelo Epistêmico (Fase 4 — seção 8).
//
// Fórmula centralizada na política:
//   conf = clamp01(base + scale * score + sourceFactor + bônus + penalidades)
// onde:
//   - score = clamp(-1, 1, soma(pesos) / sqrt(n)) após deduplicação;
//   - sourceFactor cresce com a prioridade da fonte do item;
//   - confirmação e correção explícitas adicionam bônus;
//   - contradições, staleness e memória candidata aplicam penalidades.
//
// Regras absolutas:
//   - nenhuma confiança sem evidência;
//   - evidências idênticas contam uma única vez;
//   - inferência isolada nunca confirma fato.
import { dedupeEvidence } from './buildEpistemicEvidence.js';
import {
  EPISTEMIC_POLICY,
  clamp01,
  clampMinusOneOne,
  getSourcePriority,
} from './epistemicPolicy.js';

export function computeEpistemicConfidence(options = {}) {
  const policy = options.policy ?? EPISTEMIC_POLICY;
  const source = options.source ?? 'unknown';
  const rawEvidence = Array.isArray(options.evidence) ? options.evidence : [];
  const contradictions = Array.isArray(options.contradictions)
    ? options.contradictions.length
    : (Number(options.contradictions) || 0);
  const stale = Boolean(options.stale);
  const confirmed = Boolean(options.confirmed);
  const corrected = Boolean(options.corrected);
  const memoryCandidate = Boolean(options.memoryCandidate);

  const evidence = dedupeEvidence(rawEvidence);
  if (evidence.length === 0) return 0;

  const weights = evidence
    .map((entry) => entry?.weight)
    .filter((weight) => typeof weight === 'number' && Number.isFinite(weight));
  if (weights.length === 0) return 0;

  const sum = weights.reduce((acc, weight) => acc + weight, 0);
  const score = clampMinusOneOne(sum / Math.sqrt(weights.length));

  const priority = getSourcePriority(source, policy);
  const sourceFactor = Math.max(0, (10 - priority) * policy.confidence.sourcePriorityFactorStep);

  let confidence =
    policy.confidence.base
    + policy.confidence.scale * score
    + sourceFactor;

  if (confirmed) confidence += policy.confidence.confirmationBonus;
  if (corrected) confidence += policy.confidence.correctionBonus;
  confidence -= Math.min(contradictions, 3) * policy.confidence.conflictPenaltyPerContradiction;
  if (stale) confidence -= policy.confidence.stalePenalty;
  if (memoryCandidate) confidence -= policy.confidence.memoryCandidatePenalty;

  return clamp01(confidence);
}
