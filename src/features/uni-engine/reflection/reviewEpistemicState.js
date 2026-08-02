// Revisão do modelo epistêmico (Fase 8).
//
// Avalia se a Fase 4 estruturou evidência, confiança, conflitos e staleness
// de forma adequada. Produz diagnóstico — NUNCA altera o modelo epistêmico.
import { createReflectionReview } from './reflectionContracts.js';
import { REFLECTION_POLICY } from './reflectionPolicy.js';

export function reviewEpistemicState(options = {}) {
  const safe = options && typeof options === 'object' ? options : {};
  const model = safe.epistemicModel ?? null;
  const conflicts = Array.isArray(model?.conflicts) ? model.conflicts : [];
  const stale = Array.isArray(model?.staleItems) ? model.staleItems : [];
  const items = Array.isArray(model?.items) ? model.items : [];
  const sufficiency = model?.sufficiency ?? null;
  const confidence = typeof safe.epistemicState?.confidence === 'number'
    ? safe.epistemicState.confidence
    : 1;

  const expected = ['evidência suficiente', 'confiança adequada', 'conflitos tratados', 'informação fresca'];
  const observed = [];
  const divergence = [];
  const blockers = [];
  const diagnostics = [];

  if (!model) {
    return createReflectionReview({
      targetLayer: 'epistemic',
      status: 'NOT_APPLICABLE',
      confidence: 0,
      expected,
      observed: ['modelo epistêmico desligado'],
      divergence: [],
      blockers: ['EPISTEMIC_DISABLED'],
      diagnostics: ['SHADOW_ONLY'],
    });
  }

  const overallSufficient = sufficiency?.overall === true || sufficiency?.isSufficient === true;
  observed.push(overallSufficient ? 'evidência suficiente' : 'evidência insuficiente');
  observed.push(conflicts.length === 0 ? 'sem conflitos' : `${conflicts.length} conflito(s)`);
  observed.push(stale.length === 0 ? 'sem itens stale' : `${stale.length} item(ns) stale`);
  observed.push(confidence >= REFLECTION_POLICY.lowConfidenceThreshold ? 'confiança adequada' : 'confiança baixa');

  if (stale.length > 0) {
    divergence.push('STALE_INFORMATION_USED');
    diagnostics.push('STALE_INFORMATION');
  }
  if (conflicts.length > 0) {
    divergence.push('EPISTEMIC_CONFLICT_UNRESOLVED');
    diagnostics.push('EPISTEMIC_CONFLICT');
  }
  if (!overallSufficient && sufficiency != null) {
    divergence.push('INSUFFICIENT_EVIDENCE');
    diagnostics.push('MISSING_INFORMATION');
  }
  if (confidence < REFLECTION_POLICY.lowConfidenceThreshold) {
    divergence.push('LOW_CONFIDENCE');
    diagnostics.push('LOW_CONFIDENCE');
  }

  // Hipótese tratada como fato: itens inferred_low/inferred_high usados como
  // se fossem confirmados.
  const hypothesisAsFact = items.some((item) => {
    const status = item?.status ?? item?.epistemicStatus ?? null;
    return status === 'inferred_low' || status === 'hypothesis';
  });
  if (hypothesisAsFact) {
    divergence.push('HYPOTHESIS_AS_FACT');
    blockers.push('HYPOTHESIS_AS_FACT');
  }

  const status = blockers.length > 0
    ? 'BLOCKED'
    : divergence.length > 0
      ? 'DIVERGENT'
      : 'ALIGNED';

  return createReflectionReview({
    targetLayer: 'epistemic',
    status,
    confidence: clampStatusConfidence(divergence.length),
    expected,
    observed,
    divergence,
    blockers,
    diagnostics,
  });
}

function clampStatusConfidence(divergences) {
  const value = Math.max(0, Math.min(1, 1 - divergences * 0.25));
  return Math.round(value * 1000) / 1000;
}
