// Telemetria da Memória Inteligente Persistente (Fase 3).
//
// Métricas permitidas: candidatos detectados/descartados, memórias
// recuperadas/confirmadas, conflitos, superseded, expiradas, latência de
// leitura/escrita, falhas de repository, uso apenas em Shadow.
//
// NUNCA registra conteúdo sensível: a redação (redactMemoryTelemetry) é
// aplicada antes de qualquer saída — mesma política do Uni Engine.
import { UNI_ENGINE_VERSION } from '../../uniEngineContracts.js';
import { redactMemoryTelemetry } from './redactMemoryTelemetry.js';

export function buildMemoryTelemetry({
  correlationId,
  persistentMemory = null,
  latencyMs = null,
  writeError = null,
} = {}) {
  const section = persistentMemory && typeof persistentMemory === 'object'
    ? persistentMemory
    : {};
  const diagnostics = section.diagnostics ?? {};

  return {
    correlationId: correlationId ?? null,
    engineVersion: UNI_ENGINE_VERSION,
    memoryEnabled: Boolean(section.enabled),
    memoryReadEnabled: Boolean(diagnostics.readEnabled),
    memoryWriteEnabled: Boolean(diagnostics.writeEnabled),
    memoryAppliedToDecision: Boolean(section.appliedToDecision),
    memoryRetrievedCount: Array.isArray(section.retrieved) ? section.retrieved.length : 0,
    memoryCandidatesCount: Array.isArray(section.candidates) ? section.candidates.length : 0,
    memoryConflictsCount: Array.isArray(section.conflicts) ? section.conflicts.length : 0,
    memoryLatencyMs: typeof latencyMs === 'number' ? Number(latencyMs.toFixed(2)) : null,
    memoryErrorCode: diagnostics.errorCode ?? writeError?.code ?? null,
  };
}

export function emitMemoryTelemetry(telemetry, adapter = null) {
  const redacted = redactMemoryTelemetry(telemetry);
  if (typeof adapter === 'function') {
    try {
      adapter(redacted);
    } catch {
      // Telemetria nunca quebra o motor nem o chat.
    }
    return redacted;
  }
  if (typeof console?.debug === 'function') {
    console.debug('[uni-engine] memory', redacted);
  }
  return redacted;
}
