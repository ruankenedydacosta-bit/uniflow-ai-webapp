// Integration — telemetria (Parte 1).
//
// Métricas redigidas da integração. Falha de telemetria nunca quebra o
// pipeline (try/catch interno). Nenhum campo sensível chega aqui.
import { INTEGRATION_VERSION } from '../integrationTypes.js';
import { redactIntegrationTelemetry } from './redactIntegrationTelemetry.js';

export function buildIntegrationTelemetry(options = {}) {
  const safe = options ?? {};
  return {
    version: INTEGRATION_VERSION,
    enabled: Boolean(safe.enabled),
    shadowMode: Boolean(safe.shadowMode),
    status: safe.status ?? 'disabled',
    applied: Boolean(safe.applied),
    capabilitiesRequested: Array.isArray(safe.capabilitiesRequested)
      ? safe.capabilitiesRequested.slice(0, 6)
      : [],
    capabilitiesApplied: Array.isArray(safe.capabilitiesApplied)
      ? safe.capabilitiesApplied.slice(0, 6)
      : [],
    responseType: safe.responseType ?? 'generic',
    legacyPreserved: Boolean(safe.legacyPreserved),
    fallbackUsed: Boolean(safe.fallbackUsed),
    fallbackReason: safe.fallbackReason ?? null,
    questionApplied: Boolean(safe.questionApplied),
    clarificationApplied: Boolean(safe.clarificationApplied),
    styleApplied: Boolean(safe.styleApplied),
    lengthApplied: Boolean(safe.lengthApplied),
    styleKey: safe.styleKey ?? null,
    lengthBand: safe.lengthBand ?? null,
    latencyMs:
      typeof safe.latencyMs === 'number' ? Number(safe.latencyMs.toFixed(2)) : null,
    errorCode: safe.errorCode ?? null,
  };
}

export function emitIntegrationTelemetry(telemetry, adapter = null) {
  const redacted = redactIntegrationTelemetry(telemetry);
  if (typeof adapter === 'function') {
    try {
      adapter(redacted);
    } catch {
      // Telemetria nunca quebra a integração nem o chat.
    }
  }
  return redacted;
}
