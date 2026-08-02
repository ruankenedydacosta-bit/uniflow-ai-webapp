// Telemetria do Goal Engine (Fase 7, Shadow-only).
//
// Registra apenas dados estruturais do resultado — bandas de confiança e
// progresso, contagens e flags — jamais conteúdo livre ou valores brutos.
import { GOAL_ENGINE_VERSION } from '../goalContracts.js';
import { redactGoalTelemetry } from './redactGoalTelemetry.js';

export function buildGoalTelemetry(input = {}) {
  const result = input.result ?? {};
  return redactGoalTelemetry({
    correlationId: input.correlationId ?? null,
    engineVersion: input.engineVersion ?? null,
    goalsVersion: GOAL_ENGINE_VERSION,
    enabled: Boolean(input.enabled),
    shadowMode: Boolean(result.shadow?.shadowMode ?? input.shadowMode),
    appliedToDecision: false,
    goalDetected: Boolean(result.goalDetected),
    type: result.type ?? 'UNKNOWN',
    status: result.status ?? 'UNKNOWN',
    horizon: result.horizon ?? 'UNKNOWN',
    priority: result.priority ?? 'UNDETERMINED',
    confidenceBand: result.confidenceBand ?? 'insufficient',
    feasibility: result.feasibility ?? 'UNKNOWN',
    progressBand: result.progressBand ?? null,
    dependenciesCount: result.dependencies?.length ?? 0,
    missingDependenciesCount: result.dependencies?.filter((entry) => !entry.satisfied).length ?? 0,
    conflictsCount: result.conflicts?.length ?? 0,
    risksCount: result.risks?.length ?? 0,
    missingInformationCount: result.missingInformation?.length ?? 0,
    flagGoalsEnabled: Boolean(input.flagGoalsEnabled),
    flagGoalsShadow: Boolean(input.flagGoalsShadow),
    flagGoalsTelemetry: Boolean(input.flagGoalsTelemetry),
    latencyMs: typeof result.latencyMs === 'number' ? Number(result.latencyMs.toFixed(2)) : 0,
    errorCode: input.errorCode ?? null,
  });
}

export function emitGoalTelemetry(telemetry, adapter = null) {
  const redacted = redactGoalTelemetry(telemetry);
  if (typeof adapter === 'function') {
    try {
      adapter(redacted);
    } catch {
      // Telemetria nunca interfere no Shadow Mode.
    }
  }
  return redacted;
}
