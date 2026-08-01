// Telemetria do Uni Engine (Fase 1 — Shadow Mode).
//
// Monta o registro de telemetria com APENAS campos permitidos (allowlist).
// A redação (redactTelemetry) é aplicada antes de qualquer registro/envio.
// Nesta fase a telemetria NUNCA é enviada para serviço externo — só
// registrada em desenvolvimento ou por adapter injetável.
import { UNI_ENGINE_VERSION } from '../uniEngineContracts.js';
import { redactTelemetry } from './redactTelemetry.js';

export function buildUniEngineTelemetry({
  correlationId,
  classification = null,
  plan = null,
  validation = null,
  comparison = null,
  diagnostics = null,
  latencyMs = null,
  metrics = null,
} = {}) {
  const safeClassification = classification ?? {};
  const safePlan = plan ?? {};
  const safeComparison = comparison ?? {};
  const safeDiagnostics = diagnostics ?? {};
  const safeValidation = validation ?? {};
  const safeMetrics = metrics ?? {};

  return {
    correlationId: correlationId ?? null,
    engineVersion: UNI_ENGINE_VERSION,
    messageType: safeClassification.messageType ?? null,
    engineIntent: safeClassification.primaryIntent ?? null,
    pipelineIntent: safeComparison.pipelineIntent ?? null,
    confidence:
      typeof safeClassification.confidence === 'number'
        ? Number(safeClassification.confidence.toFixed(3))
        : null,
    decision: safePlan.decision ?? null,
    missingFields: Array.isArray(safePlan.missingFields) ? safePlan.missingFields : [],
    comparisonStatus: safeComparison.status ?? null,
    fallbackUsed: Boolean(safeDiagnostics.fallbackUsed),
    latencyMs: typeof latencyMs === 'number' ? Number(latencyMs.toFixed(2)) : null,
    errorCode: safeValidation?.errors?.[0] ?? safeDiagnostics.errorCode ?? null,
    // Fase 2 — métricas de concordância (agregados redigidos).
    agreement: safeMetrics.agreement ?? null,
    falsePositive: safeMetrics.falsePositive ?? null,
    falseNegative: safeMetrics.falseNegative ?? null,
    contextRecovered: safeMetrics.contextRecovered ?? null,
    ambiguityDetected: safeMetrics.ambiguityDetected ?? null,
    implicitReferenceResolved: safeMetrics.implicitReferenceResolved ?? null,
    contextSwitch: safeMetrics.contextSwitch ?? null,
    divergenceCount: safeMetrics.divergenceCount ?? 0,
  };
}

export function emitUniEngineTelemetry(telemetry, adapter = null) {
  const redacted = redactTelemetry(telemetry);
  if (typeof adapter === 'function') {
    try {
      adapter(redacted);
    } catch {
      // Telemetria nunca quebra o motor nem o chat.
    }
    return redacted;
  }
  if (typeof console?.debug === 'function') {
    console.debug('[uni-engine] shadow', redacted);
  }
  return redacted;
}
