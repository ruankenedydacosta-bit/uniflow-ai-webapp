// Telemetria do Modelo Epistêmico (Fase 4 — Shadow Mode).
//
// Monta o registro de telemetria com APENAS agregados redigidos. A redação
// (redactEpistemicTelemetry) é aplicada antes de qualquer registro/envio.
// Nesta fase a telemetria nunca sai para serviço externo — só é registrada
// em desenvolvimento ou por adapter injetável.
import { EPISTEMIC_MODEL_VERSION } from '../epistemicContracts.js';
import { redactEpistemicTelemetry } from './redactEpistemicTelemetry.js';

export function buildEpistemicTelemetry(options = {}) {
  const safe = options ?? {};
  const verifier = safe.verifier ?? null;
  const model = safe.model ?? null;

  const items = Array.isArray(verifier?.items) ? verifier.items : [];
  const conflicts = Array.isArray(verifier?.conflicts) ? verifier.conflicts : [];
  const staleItems = Array.isArray(verifier?.staleItems) ? verifier.staleItems : [];
  const missingItems = Array.isArray(verifier?.missingItems) ? verifier.missingItems : [];
  const confidence = verifier?.confidenceSummary ?? {};
  const evidence = verifier?.evidenceSummary ?? {};
  const sufficiency = verifier?.sufficiency ?? {};
  const recommendations = Array.isArray(verifier?.recommendations) ? verifier.recommendations : [];

  const recommendationTypes = {};
  for (const recommendation of recommendations) {
    const type = String(recommendation).split(':')[0] ?? 'unknown';
    recommendationTypes[type] = (recommendationTypes[type] ?? 0) + 1;
  }

  const itemMeanConfidence = typeof confidence.mean === 'number' ? Number(confidence.mean.toFixed(3)) : null;

  return {
    correlationId: safe.correlationId ?? null,
    engineVersion: safe.engineVersion ?? null,
    epistemicModelVersion: EPISTEMIC_MODEL_VERSION,
    enabled: Boolean(safe.enabled),
    shadowMode: Boolean(safe.shadowMode),
    appliedToDecision: Boolean(model?.appliedToDecision),
    itemCount: items.length,
    conflictCount: conflicts.length,
    staleItemCount: staleItems.length,
    missingItemCount: missingItems.length,
    memoryCount: Number(verifier?.diagnostics?.memoryCount) || 0,
    memoryScopeFiltered: Number(verifier?.diagnostics?.memoryScopeFiltered) || 0,
    meanConfidence: itemMeanConfidence,
    minConfidence: typeof confidence.min === 'number' ? Number(confidence.min.toFixed(3)) : null,
    maxConfidence: typeof confidence.max === 'number' ? Number(confidence.max.toFixed(3)) : null,
    confidenceBands: confidence.bands ?? {},
    evidenceTotal: Number(evidence.totalRaw) || 0,
    evidenceDeduped: Number(evidence.totalDeduped) || 0,
    evidenceByType: evidence.byType ?? {},
    sufficientDisplay: Number(sufficiency.display?.sufficientCount) || 0,
    sufficientSuggest: Number(sufficiency.suggest?.sufficientCount) || 0,
    sufficientConfirm: Number(sufficiency.confirm?.sufficientCount) || 0,
    sufficientStoreMemory: Number(sufficiency.store_memory?.sufficientCount) || 0,
    executeBlocked: Boolean(sufficiency.execute?.shadowMode),
    recommendationCount: recommendations.length,
    recommendationTypes,
    planDivergence: safe.planDivergence ?? null,
    fallbackUsed: Boolean(safe.fallbackUsed),
    latencyMs: typeof safe.latencyMs === 'number' ? Number(safe.latencyMs.toFixed(2)) : null,
    errorCode: safe.errorCode ?? null,
    truncatedItems: Boolean(verifier?.diagnostics?.truncated?.items),
    truncatedConflicts: Boolean(verifier?.diagnostics?.truncated?.conflicts),
  };
}

export function emitEpistemicTelemetry(telemetry, adapter = null) {
  const redacted = redactEpistemicTelemetry(telemetry);
  if (typeof adapter === 'function') {
    try {
      adapter(redacted);
    } catch {
      // Telemetria nunca quebra o motor nem o chat.
    }
    return redacted;
  }
  if (typeof console?.debug === 'function') {
    console.debug('[uni-engine] epistemic shadow', redacted);
  }
  return redacted;
}
