// Sumarização da reflexão (Fase 8).
//
// Agrega sinais, revisões e candidatos em resumos redigidos e serializáveis:
// evidenceSummary, confidenceSummary e prioritySummary.
import { describeConfidence } from './reflectionPolicy.js';

export function buildReflectionSummary(options = {}) {
  const safe = options && typeof options === 'object' ? options : {};
  const signals = Array.isArray(safe.signals) ? safe.signals : [];
  const reviews = Array.isArray(safe.reviews) ? safe.reviews : [];
  const candidates = Array.isArray(safe.candidates) ? safe.candidates : [];

  const evidenceBySignal = {};
  for (const signal of signals) {
    const type = signal?.type ?? 'UNKNOWN';
    evidenceBySignal[type] = (evidenceBySignal[type] ?? 0) + (signal?.evidenceCount ?? 1);
  }

  const totalEvidence = Object.values(evidenceBySignal).reduce((sum, count) => sum + count, 0);
  const confidenceValues = reviews
    .map((review) => review?.confidence)
    .filter((value) => typeof value === 'number' && Number.isFinite(value));
  const averageConfidence = confidenceValues.length > 0
    ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
    : 0;
  const maxConfidence = confidenceValues.length > 0
    ? Math.max(...confidenceValues)
    : 0;

  const prioritySummary = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, IGNORE: 0, UNDETERMINED: 0 };
  for (const candidate of candidates) {
    const priority = candidate?.priority ?? 'UNDETERMINED';
    if (Object.hasOwn(prioritySummary, priority)) prioritySummary[priority] += 1;
  }

  return {
    evidenceSummary: {
      totalSignals: signals.length,
      totalEvidence,
      signalsByType: evidenceBySignal,
    },
    confidenceSummary: {
      average: Math.round(averageConfidence * 1000) / 1000,
      max: Math.round(maxConfidence * 1000) / 1000,
      band: describeConfidence(averageConfidence),
    },
    prioritySummary,
  };
}
