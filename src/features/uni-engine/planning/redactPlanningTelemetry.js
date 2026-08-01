export const PLANNING_TELEMETRY_ALLOWED_FIELDS = Object.freeze([
  'correlationId',
  'engineVersion',
  'planningVersion',
  'enabled',
  'shadowMode',
  'appliedToDecision',
  'goalType',
  'status',
  'complexity',
  'confidence',
  'risk',
  'stepsCount',
  'dependenciesCount',
  'missingDependenciesCount',
  'diagnosticsCount',
  'recommendationsCount',
  'flagPlanningEnabled',
  'flagPlanningShadow',
  'flagPlanningTelemetry',
  'latencyMs',
  'errorCode',
]);

export function redactPlanningTelemetry(input = {}) {
  const result = {};
  for (const field of PLANNING_TELEMETRY_ALLOWED_FIELDS) {
    if (!Object.hasOwn(input, field)) continue;
    const value = input[field];
    result[field] = ['string', 'number', 'boolean'].includes(typeof value) ? value : '[redacted]';
  }
  return result;
}
