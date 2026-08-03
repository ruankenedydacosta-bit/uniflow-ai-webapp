export const UNI_OS_REFLECTION_SCHEMA_VERSION = '1.0';

export const REFLECTION_RISKS = Object.freeze(['LOW', 'MEDIUM', 'HIGH']);
export const REFLECTION_RECOMMENDATIONS = Object.freeze([
  'ASK_CONFIRMATION',
  'REQUEST_ACCOUNT',
  'REQUEST_CATEGORY',
  'REQUEST_DATE',
  'REQUEST_AMOUNT',
  'REQUEST_DISAMBIGUATION',
  'PROCEED_AFTER_CONFIRMATION',
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [key, cloneValue(nestedValue)]),
  );
}

function safeConfidence(value) {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

export function createReflectionSnapshot(input = {}) {
  const risk = REFLECTION_RISKS.includes(input.overallRisk) ? input.overallRisk : 'HIGH';
  const recommendations = Array.isArray(input.recommendations)
    ? [...new Set(input.recommendations.filter((item) => REFLECTION_RECOMMENDATIONS.includes(item)))]
    : [];

  return deepFreeze({
    reflectionId: typeof input.reflectionId === 'string' ? input.reflectionId : '',
    timestamp: typeof input.timestamp === 'string' ? input.timestamp : '',
    overallRisk: risk,
    confidence: safeConfidence(input.confidence),
    confirmationRequired: input.confirmationRequired === true,
    ambiguityDetected: input.ambiguityDetected === true,
    inconsistencies: Array.isArray(input.inconsistencies)
      ? input.inconsistencies.map(cloneValue)
      : [],
    recommendations,
    executionAllowed: false,
    metadata: {
      version: UNI_OS_REFLECTION_SCHEMA_VERSION,
    },
  });
}
