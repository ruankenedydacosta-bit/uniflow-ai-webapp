// Redação da telemetria do Goal Engine (Fase 7).
//
// Permite SOMENTE dados estruturais do objetivo. Nunca registra: mensagem
// original, nomes, e-mails, IDs de usuário/workspace/conta, valores
// financeiros brutos, descrições livres, nomes de contas ou detalhes de
// transações.
export const GOAL_TELEMETRY_ALLOWED_FIELDS = Object.freeze([
  'correlationId',
  'engineVersion',
  'goalsVersion',
  'enabled',
  'shadowMode',
  'appliedToDecision',
  'goalDetected',
  'type',
  'status',
  'horizon',
  'priority',
  'confidenceBand',
  'feasibility',
  'progressBand',
  'dependenciesCount',
  'missingDependenciesCount',
  'conflictsCount',
  'risksCount',
  'missingInformationCount',
  'flagGoalsEnabled',
  'flagGoalsShadow',
  'flagGoalsTelemetry',
  'latencyMs',
  'errorCode',
]);

export function redactGoalTelemetry(input = {}) {
  const result = {};
  for (const field of GOAL_TELEMETRY_ALLOWED_FIELDS) {
    if (!Object.hasOwn(input, field)) continue;
    const value = input[field];
    result[field] = value === null
      ? null
      : ['string', 'number', 'boolean'].includes(typeof value)
        ? value
        : '[redacted]';
  }
  return result;
}
