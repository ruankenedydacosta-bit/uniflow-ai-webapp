export const REASONING_DEPTHS = Object.freeze([
  'LOW',
  'MEDIUM',
  'HIGH',
  'VERY_HIGH',
]);

export const CONFIDENCE_TARGETS = Object.freeze({
  LOW: 0.7,
  MEDIUM: 0.8,
  HIGH: 0.9,
  VERY_HIGH: 0.95,
});

export function resolveReasoningDepth({
  analysisMode = 'CASUAL',
  riskLevel = 'LOW',
  ambiguityLevel = 'NONE',
} = {}) {
  if (riskLevel === 'CRITICAL' || ambiguityLevel === 'HIGH') return 'VERY_HIGH';
  if (['ANALYTICAL', 'PLANNING', 'SAFETY'].includes(analysisMode) || riskLevel === 'HIGH') {
    return 'HIGH';
  }
  if (['TRANSACTIONAL', 'CONFIGURATION'].includes(analysisMode) || ambiguityLevel === 'MEDIUM') {
    return 'MEDIUM';
  }
  return 'LOW';
}

export function confidenceTargetForDepth(depth) {
  return CONFIDENCE_TARGETS[depth] ?? CONFIDENCE_TARGETS.LOW;
}
