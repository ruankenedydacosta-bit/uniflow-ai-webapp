// Redator de telemetria da memória (Fase 3).
//
// Allowlist rígida: somente métricas agregadas e flags — nenhum conteúdo de
// memória, texto de mensagem, ID externo, valor financeiro ou nome de
// conta/categoria sai daqui.

export const MEMORY_TELEMETRY_ALLOWED_FIELDS = Object.freeze([
  'correlationId',
  'engineVersion',
  'memoryEnabled',
  'memoryReadEnabled',
  'memoryWriteEnabled',
  'memoryAppliedToDecision',
  'memoryRetrievedCount',
  'memoryCandidatesCount',
  'memoryConflictsCount',
  'memoryLatencyMs',
  'memoryErrorCode',
]);

const REDACTED = '[redacted]';

export function redactMemoryTelemetry(telemetry) {
  const source = telemetry && typeof telemetry === 'object' ? telemetry : {};
  const result = {};
  for (const field of MEMORY_TELEMETRY_ALLOWED_FIELDS) {
    if (Object.hasOwn(source, field)) {
      const value = source[field];
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        result[field] = value;
      } else if (value === null || value === undefined) {
        result[field] = null;
      } else {
        result[field] = REDACTED;
      }
    }
  }
  return result;
}

export function buildRedactedMemoryTelemetryEntry(partial) {
  return redactMemoryTelemetry({
    correlationId: partial?.correlationId,
    engineVersion: partial?.engineVersion,
    memoryEnabled: Boolean(partial?.memoryEnabled),
    memoryReadEnabled: Boolean(partial?.memoryReadEnabled),
    memoryWriteEnabled: Boolean(partial?.memoryWriteEnabled),
    memoryAppliedToDecision: Boolean(partial?.memoryAppliedToDecision),
    memoryRetrievedCount: Number(partial?.memoryRetrievedCount) || 0,
    memoryCandidatesCount: Number(partial?.memoryCandidatesCount) || 0,
    memoryConflictsCount: Number(partial?.memoryConflictsCount) || 0,
    memoryLatencyMs: typeof partial?.memoryLatencyMs === 'number' ? partial.memoryLatencyMs : null,
    memoryErrorCode: partial?.memoryErrorCode ?? null,
  });
}
