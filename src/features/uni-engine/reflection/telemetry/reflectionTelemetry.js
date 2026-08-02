// Telemetria do Reflection & Learning Engine (Fase 8).
//
// Monta o registro de telemetria com APENAS campos permitidos (allowlist).
// A redação (redactReflectionTelemetry) é aplicada antes de qualquer
// registro/envio. NUNCA inclui texto integral, nomes, IDs, valores
// financeiros, contas, descrições, tokens ou conteúdo de memória.
import { REFLECTION_VERSION } from '../reflectionContracts.js';
import { redactReflectionTelemetry } from './redactReflectionTelemetry.js';

export function buildReflectionTelemetry(options = {}) {
  const safe = options && typeof options === 'object' ? options : {};
  const signals = Array.isArray(safe.signals) ? safe.signals : [];
  const candidates = Array.isArray(safe.candidates) ? safe.candidates : [];
  const outcome = safe.outcome ?? 'UNKNOWN';

  return {
    correlationId: safe.correlationId ?? null,
    engineVersion: safe.engineVersion ?? null,
    reflectionVersion: REFLECTION_VERSION,
    enabled: Boolean(safe.enabled),
    shadowMode: Boolean(safe.shadowMode),
    triggered: Boolean(safe.reflectionTriggered),
    outcome,
    signalCount: signals.length,
    signalTypes: Array.from(new Set(signals.map((signal) => signal?.type).filter(Boolean))).slice(0, 12),
    reviewCount: Array.isArray(safe.reviews) ? safe.reviews.length : 0,
    candidateCount: candidates.length,
    candidateTypes: Array.from(new Set(candidates.map((candidate) => candidate?.type).filter(Boolean))).slice(0, 12),
    confidenceBand: safe.confidenceBand ?? null,
    priorityBand: safe.priorityBand ?? null,
    riskBand: safe.riskBand ?? null,
    conflictCount: Array.isArray(safe.conflicts) ? safe.conflicts.length : 0,
    fallback: Boolean(safe.fallback),
    errorCode: safe.errorCode ?? null,
    latencyMs: typeof safe.latencyMs === 'number' ? Number(safe.latencyMs.toFixed(2)) : null,
  };
}

export function emitReflectionTelemetry(telemetry, adapter = null) {
  const redacted = redactReflectionTelemetry(telemetry);
  if (typeof adapter === 'function') {
    try {
      adapter(redacted);
    } catch {
      // Telemetria nunca quebra o motor nem o chat.
    }
    return redacted;
  }
  if (typeof console?.debug === 'function') {
    console.debug('[uni-engine] reflection', redacted);
  }
  return redacted;
}
