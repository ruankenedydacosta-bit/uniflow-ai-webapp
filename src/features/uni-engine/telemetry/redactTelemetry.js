// Redator de telemetria do Uni Engine (Fase 1).
//
// NUNCA registra em produção (e nem em dev quando desnecessário):
//   - texto completo da mensagem
//   - e-mail, nome de usuário
//   - IDs externos (userId, workspaceId, conversationId, messageId)
//   - valores financeiros completos
//   - nomes de contas/categorias
//   - tokens, credenciais, payloads sensíveis
//
// A redação é aplicada SEMPRE antes de qualquer registro/envio — inclusive
// antes do logger de desenvolvimento.

export const TELEMETRY_ALLOWED_FIELDS = Object.freeze([
  'correlationId',
  'engineVersion',
  'messageType',
  'engineIntent',
  'pipelineIntent',
  'confidence',
  'decision',
  'missingFields',
  'comparisonStatus',
  'fallbackUsed',
  'latencyMs',
  'errorCode',
  // Fase 2 — métricas de concordância e diagnóstico (apenas agregados,
  // nenhum dado sensível).
  'agreement',
  'falsePositive',
  'falseNegative',
  'contextRecovered',
  'ambiguityDetected',
  'implicitReferenceResolved',
  'contextSwitch',
  'divergenceCount',
  // Fase 3 — métricas da memória persistente (apenas agregados redigidos;
  // nenhum conteúdo de memória, nenhum valor, nenhum ID externo).
  'memoryEnabled',
  'memoryReadEnabled',
  'memoryWriteEnabled',
  'memoryAppliedToDecision',
  'memoryRetrievedCount',
  'memoryCandidatesCount',
  'memoryConflictsCount',
  'memoryErrorCode',
]);

const REDACTED = '[redacted]';

export function redactTelemetry(telemetry) {
  const source = telemetry && typeof telemetry === 'object' ? telemetry : {};
  const result = {};
  for (const field of TELEMETRY_ALLOWED_FIELDS) {
    if (Object.hasOwn(source, field)) {
      result[field] = redactTelemetryField(field, source[field]);
    }
  }
  return result;
}

function redactTelemetryField(field, value) {
  if (field === 'missingFields') {
    return Array.isArray(value)
      ? value.map((item) => (typeof item === 'string' ? item : REDACTED))
      : [];
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return REDACTED;
}

export function redactText(text) {
  return typeof text === 'string' && text.trim() ? REDACTED : null;
}

export function redactSensitiveValue() {
  return REDACTED;
}

// Garante que qualquer objeto arbitrário vira telemetria redigida — campos
// desconhecidos são descartados, nunca repassados.
export function buildRedactedTelemetryEntry(partial) {
  const source = partial && typeof partial === 'object' ? partial : {};
  return redactTelemetry({
    correlationId: source.correlationId,
    engineVersion: source.engineVersion,
    messageType: source.messageType,
    engineIntent: source.engineIntent,
    pipelineIntent: source.pipelineIntent,
    confidence: typeof source.confidence === 'number' ? source.confidence : null,
    decision: source.decision,
    missingFields: Array.isArray(source.missingFields) ? source.missingFields : [],
    comparisonStatus: source.comparisonStatus,
    fallbackUsed: Boolean(source.fallbackUsed),
    latencyMs: typeof source.latencyMs === 'number' ? source.latencyMs : null,
    errorCode: source.errorCode ?? null,
  });
}
