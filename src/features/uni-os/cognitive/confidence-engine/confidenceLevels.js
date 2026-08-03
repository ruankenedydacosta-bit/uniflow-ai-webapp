export const CONFIDENCE_LEVELS = Object.freeze([
  'VERY_LOW',
  'LOW',
  'MEDIUM',
  'HIGH',
  'VERY_HIGH',
]);

export const CONFIDENCE_THRESHOLDS = Object.freeze({
  VERY_LOW: 0,
  LOW: 0.2,
  MEDIUM: 0.4,
  HIGH: 0.6,
  VERY_HIGH: 0.8,
});

export function resolveConfidenceLevel(score) {
  const safeScore = Number.isFinite(score) ? Math.min(1, Math.max(0, score)) : 0;
  if (safeScore >= CONFIDENCE_THRESHOLDS.VERY_HIGH) return 'VERY_HIGH';
  if (safeScore >= CONFIDENCE_THRESHOLDS.HIGH) return 'HIGH';
  if (safeScore >= CONFIDENCE_THRESHOLDS.MEDIUM) return 'MEDIUM';
  if (safeScore >= CONFIDENCE_THRESHOLDS.LOW) return 'LOW';
  return 'VERY_LOW';
}
