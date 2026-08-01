// Redator de telemetria da Camada de Decisão (Fase 5).
//
// NUNCA registra:
//   - texto da mensagem;
//   - nomes, contas, categorias;
//   - valores financeiros, saldos;
//   - descrição, PIX, telefone, e-mail, documento;
//   - IDs externos.
//
// Permite apenas agregados: tipo da decisão, latência, confiança, risco,
// quantidades de diagnósticos/recomendações, dependências booleanas,
// flags, shadow e versão. A redação é aplicada SEMPRE antes de qualquer
// registro/envio.

export const DECISION_TELEMETRY_ALLOWED_FIELDS = Object.freeze([
  'correlationId',
  'engineVersion',
  'decisionLayerVersion',
  'enabled',
  'shadowMode',
  'appliedToDecision',
  'decisionType',
  'confidence',
  'risk',
  'diagnosticsCount',
  'recommendationsCount',
  'missingCount',
  'sufficiency',
  'consistency',
  'requiresMemory',
  'requiresDatabase',
  'requiresConfirmation',
  'requiresConversation',
  'requiresSnapshot',
  'requiresHistory',
  'requiresExecutor',
  'requiresUser',
  'executorCalled',
  'databaseCalled',
  'memoryModified',
  'responseModified',
  'pipelineAltered',
  'flagDecisionEnabled',
  'flagDecisionShadow',
  'flagDecisionTelemetry',
  'latencyMs',
  'errorCode',
]);

const REDACTED = '[redacted]';

export function redactDecisionTelemetry(telemetry) {
  const source = telemetry && typeof telemetry === 'object' ? telemetry : {};
  const result = {};
  for (const field of DECISION_TELEMETRY_ALLOWED_FIELDS) {
    if (Object.hasOwn(source, field)) {
      const value = source[field];
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        result[field] = value;
      } else {
        result[field] = REDACTED;
      }
    }
  }
  return result;
}

export function redactDecisionText() {
  return REDACTED;
}

export function redactDecisionSensitiveValue() {
  return REDACTED;
}

// Garante que qualquer entrada arbitrária vira telemetria redigida —
// campos desconhecidos são descartados, nunca repassados.
export function buildRedactedDecisionTelemetryEntry(partial) {
  const source = partial && typeof partial === 'object' ? partial : {};
  return redactDecisionTelemetry({
    correlationId: source.correlationId,
    engineVersion: source.engineVersion,
    decisionLayerVersion: source.decisionLayerVersion,
    enabled: Boolean(source.enabled),
    shadowMode: Boolean(source.shadowMode),
    appliedToDecision: Boolean(source.appliedToDecision),
    decisionType: source.decisionType,
    confidence: typeof source.confidence === 'number' ? source.confidence : null,
    risk: source.risk,
    diagnosticsCount: typeof source.diagnosticsCount === 'number' ? source.diagnosticsCount : null,
    recommendationsCount: typeof source.recommendationsCount === 'number' ? source.recommendationsCount : null,
    missingCount: typeof source.missingCount === 'number' ? source.missingCount : null,
    sufficiency: source.sufficiency,
    consistency: source.consistency,
    requiresMemory: Boolean(source.requiresMemory),
    requiresDatabase: Boolean(source.requiresDatabase),
    requiresConfirmation: Boolean(source.requiresConfirmation),
    requiresConversation: Boolean(source.requiresConversation),
    requiresSnapshot: Boolean(source.requiresSnapshot),
    requiresHistory: Boolean(source.requiresHistory),
    requiresExecutor: Boolean(source.requiresExecutor),
    requiresUser: Boolean(source.requiresUser),
    executorCalled: Boolean(source.executorCalled),
    databaseCalled: Boolean(source.databaseCalled),
    memoryModified: Boolean(source.memoryModified),
    responseModified: Boolean(source.responseModified),
    pipelineAltered: Boolean(source.pipelineAltered),
    flagDecisionEnabled: Boolean(source.flagDecisionEnabled),
    flagDecisionShadow: Boolean(source.flagDecisionShadow),
    flagDecisionTelemetry: Boolean(source.flagDecisionTelemetry),
    latencyMs: typeof source.latencyMs === 'number' ? source.latencyMs : null,
    errorCode: source.errorCode ?? null,
  });
}
