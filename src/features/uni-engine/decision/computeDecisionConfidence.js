// Cálculo de Confiança de Decisão (Fase 5 — Shadow Mode).
//
// computeDecisionConfidence(context) produz uma confiança determinística
// entre 0 e 1. Jamais usa random, jamais usa IA — apenas política e
// contexto avaliado. Considera: intent, epistêmico, contexto, memória,
// snapshot, pendências, conflitos, recência e histórico.
//
// Bands: muito baixa / baixa / média / alta / muito alta.
import { DECISION_POLICY, clamp01, describeConfidence } from './decisionPolicy.js';

export function computeDecisionConfidence(context = {}) {
  const evidence = context.evidence && typeof context.evidence === 'object'
    ? context.evidence
    : {};
  const c = DECISION_POLICY.confidence;

  let confidence = c.base;

  // Intent.
  if (evidence.intentKnown) confidence += c.intentKnownBonus;
  if (evidence.intentConfirmed) confidence += c.intentConfirmedBonus;

  // Epistêmico.
  if (evidence.intentType && evidence.snapshotAvailable && evidence.snapshotFresh) {
    confidence += c.snapshotFreshBonus;
  }
  if (typeof evidence.epistemicConfidence === 'number') {
    if (evidence.epistemicConfidence >= c.epistemicHighThreshold) {
      confidence += c.epistemicConfidenceBonus;
    } else if (evidence.epistemicConfidence < c.epistemicLowThreshold) {
      confidence -= c.epistemicConfidencePenalty;
    }
  }
  if (evidence.snapshotAvailable && !evidence.snapshotFresh) {
    confidence -= c.stalePenalty;
  }

  // Memória (apoio, nunca verdade absoluta).
  if (evidence.memoryAvailable && !evidence.memoryConflict) {
    confidence += c.memorySupportBonus;
  }
  if (evidence.memoryConflict) {
    confidence -= c.memoryConflictPenalty;
  }

  // Contexto / sufficiency.
  if (context.sufficiency === 'SUFFICIENT') confidence += c.epistemicHighBonus;
  if (context.sufficiency === 'INSUFFICIENT') confidence -= c.missingFieldPenalty * 2;
  if (context.sufficiency === 'PARTIAL') confidence -= c.missingFieldPenalty;

  // Pendências.
  if (evidence.pendingActive) confidence -= c.pendingActionPenalty;
  if (evidence.pendingReady) confidence += c.confirmationBonus;

  // Conflitos.
  if (evidence.balanceConflict) confidence -= c.conflictPenalty;
  if (evidence.hasConflict) confidence -= c.conflictPenalty * 0.5;

  // Recência / histórico.
  if (evidence.historyAvailable) confidence += c.historyAvailableBonus;
  if (evidence.staleItemsCount > 0) confidence -= c.stalePenalty;

  // Referências ambíguas.
  if (evidence.referenceAmbiguous) confidence -= c.ambiguousReferencePenalty;

  // Consistência.
  if (context.consistency === 'CONFLICTING') confidence -= c.inconsistentPenalty;
  if (context.consistency === 'PARTIAL') confidence -= c.inconsistentPenalty * 0.5;

  // Executor.
  if (!evidence.executorAvailable) confidence -= c.executorUnavailablePenalty;

  const value = clamp01(confidence);

  return {
    confidence: Number(value.toFixed(4)),
    band: describeConfidence(value),
    factors: {
      intentKnown: evidence.intentKnown === true,
      intentConfirmed: evidence.intentConfirmed === true,
      memoryAvailable: evidence.memoryAvailable === true,
      memoryConflict: evidence.memoryConflict === true,
      snapshotFresh: evidence.snapshotFresh === true,
      balanceConflict: evidence.balanceConflict === true,
      hasConflict: evidence.hasConflict === true,
      staleItems: Number(evidence.staleItemsCount) || 0,
      epistemicConfidence: typeof evidence.epistemicConfidence === 'number'
        ? evidence.epistemicConfidence
        : null,
      missingFields: Number(evidence.missingFieldsCount) || 0,
      historyAvailable: evidence.historyAvailable === true,
      referenceAmbiguous: evidence.referenceAmbiguous === true,
      pendingActive: evidence.pendingActive === true,
      pendingReady: evidence.pendingReady === true,
      consistency: context.consistency ?? 'UNKNOWN',
    },
  };
}
