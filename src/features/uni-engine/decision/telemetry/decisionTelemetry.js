// Telemetria da Camada de Decisão (Fase 5 — Shadow Mode).
//
// Monta o registro de telemetria com APENAS agregados redigidos. A redação
// (redactDecisionTelemetry) é aplicada antes de qualquer registro/envio.
// Nesta fase a telemetria nunca sai para serviço externo — só é registrada
// em desenvolvimento ou por adapter injetável.
import { DECISION_LAYER_VERSION } from '../decisionContracts.js';
import { redactDecisionTelemetry } from './redactDecisionTelemetry.js';

export function buildDecisionTelemetry(options = {}) {
  const safe = options ?? {};
  const layer = safe.layer ?? null;

  return {
    correlationId: safe.correlationId ?? null,
    engineVersion: safe.engineVersion ?? null,
    decisionLayerVersion: DECISION_LAYER_VERSION,
    enabled: Boolean(safe.enabled),
    shadowMode: Boolean(layer?.shadow?.shadowMode ?? safe.shadowMode),
    appliedToDecision: Boolean(layer?.shadow?.appliedToDecision),
    decisionType: layer?.decisionType ?? safe.decisionType ?? 'UNKNOWN',
    confidence: typeof layer?.confidence === 'number'
      ? Number(layer.confidence.toFixed(3))
      : (typeof safe.confidence === 'number' ? safe.confidence : null),
    risk: layer?.risk ?? safe.risk ?? 'NONE',
    diagnosticsCount: Array.isArray(layer?.diagnostics) ? layer.diagnostics.length : 0,
    recommendationsCount: Array.isArray(layer?.recommendations) ? layer.recommendations.length : 0,
    missingCount: Array.isArray(layer?.missingInformation) ? layer.missingInformation.length : 0,
    sufficiency: layer?.contextEvaluation?.sufficiency ?? 'UNKNOWN',
    consistency: layer?.contextEvaluation?.consistency ?? 'UNKNOWN',
    requiresMemory: Boolean(layer?.dependencies?.requiresMemory),
    requiresDatabase: Boolean(layer?.dependencies?.requiresDatabase),
    requiresConfirmation: Boolean(layer?.dependencies?.requiresConfirmation),
    requiresConversation: Boolean(layer?.dependencies?.requiresConversation),
    requiresSnapshot: Boolean(layer?.dependencies?.requiresSnapshot),
    requiresHistory: Boolean(layer?.dependencies?.requiresHistory),
    requiresExecutor: Boolean(layer?.dependencies?.requiresExecutor),
    requiresUser: Boolean(layer?.dependencies?.requiresUser),
    executorCalled: Boolean(layer?.shadow?.executorCalled),
    databaseCalled: Boolean(layer?.shadow?.databaseCalled),
    memoryModified: Boolean(layer?.shadow?.memoryModified),
    responseModified: Boolean(layer?.shadow?.responseModified),
    pipelineAltered: Boolean(layer?.shadow?.pipelineAltered),
    flagDecisionEnabled: Boolean(safe.flagDecisionEnabled),
    flagDecisionShadow: Boolean(safe.flagDecisionShadow),
    flagDecisionTelemetry: Boolean(safe.flagDecisionTelemetry),
    latencyMs: typeof layer?.latency?.totalMs === 'number'
      ? Number(layer.latency.totalMs.toFixed(2))
      : (typeof safe.latencyMs === 'number' ? Number(safe.latencyMs.toFixed(2)) : null),
    errorCode: safe.errorCode ?? null,
  };
}

export function emitDecisionTelemetry(telemetry, adapter = null) {
  const redacted = redactDecisionTelemetry(telemetry);
  if (typeof adapter === 'function') {
    try {
      adapter(redacted);
    } catch {
      // Telemetria nunca quebra o motor nem o chat.
    }
    return redacted;
  }
  if (typeof console?.debug === 'function') {
    console.debug('[uni-engine] decision shadow', redacted);
  }
  return redacted;
}
