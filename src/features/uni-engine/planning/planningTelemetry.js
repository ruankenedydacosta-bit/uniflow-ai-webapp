import { PLANNING_ENGINE_VERSION } from './planningContracts.js';
import { redactPlanningTelemetry } from './redactPlanningTelemetry.js';

export function buildPlanningTelemetry(input = {}) {
  const planning = input.planning ?? {};
  return redactPlanningTelemetry({
    correlationId: input.correlationId ?? null,
    engineVersion: input.engineVersion ?? null,
    planningVersion: PLANNING_ENGINE_VERSION,
    enabled: Boolean(input.enabled),
    shadowMode: Boolean(planning.shadow?.shadowMode ?? input.shadowMode),
    appliedToDecision: false,
    goalType: planning.goalType ?? 'UNKNOWN',
    status: planning.status ?? 'UNKNOWN',
    complexity: planning.complexity ?? 'LOW',
    confidence: typeof planning.confidence === 'number' ? Number(planning.confidence.toFixed(3)) : 0,
    risk: planning.risk ?? 'NONE',
    stepsCount: planning.suggestedSteps?.length ?? 0,
    dependenciesCount: planning.dependencies?.length ?? 0,
    missingDependenciesCount: planning.dependencies?.filter((entry) => entry.required && !entry.satisfied).length ?? 0,
    diagnosticsCount: planning.diagnostics?.length ?? 0,
    recommendationsCount: planning.recommendations?.length ?? 0,
    flagPlanningEnabled: Boolean(input.flagPlanningEnabled),
    flagPlanningShadow: Boolean(input.flagPlanningShadow),
    flagPlanningTelemetry: Boolean(input.flagPlanningTelemetry),
    latencyMs: typeof planning.latency?.totalMs === 'number' ? Number(planning.latency.totalMs.toFixed(2)) : 0,
    errorCode: input.errorCode ?? null,
  });
}

export function emitPlanningTelemetry(telemetry, adapter = null) {
  const redacted = redactPlanningTelemetry(telemetry);
  if (typeof adapter === 'function') {
    try {
      adapter(redacted);
    } catch {
      // Telemetria nunca interfere no Shadow Mode.
    }
  }
  return redacted;
}
