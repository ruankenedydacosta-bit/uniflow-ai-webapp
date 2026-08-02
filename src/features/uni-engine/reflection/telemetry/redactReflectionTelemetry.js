// Redação da telemetria do Reflection & Learning Engine (Fase 8).
//
// Permite SOMENTE dados estruturais. Nunca registra: mensagem original,
// nomes, e-mails, telefones, CPF, IDs reais, workspaceId, accountId,
// transactionId, valores financeiros, nomes de conta, descrições de
// transação, tokens, conteúdo de memória ou áudio.
export const REFLECTION_TELEMETRY_ALLOWED_FIELDS = Object.freeze([
  'correlationId',
  'engineVersion',
  'reflectionVersion',
  'enabled',
  'shadowMode',
  'triggered',
  'outcome',
  'signalCount',
  'signalTypes',
  'reviewCount',
  'candidateCount',
  'candidateTypes',
  'confidenceBand',
  'priorityBand',
  'riskBand',
  'conflictCount',
  'fallback',
  'errorCode',
  'latencyMs',
]);

export function redactReflectionTelemetry(input = {}) {
  const safe = input && typeof input === 'object' ? input : {};
  const result = {};
  for (const field of REFLECTION_TELEMETRY_ALLOWED_FIELDS) {
    if (!Object.hasOwn(safe, field)) continue;
    const value = safe[field];
    result[field] = value === null
      ? null
      : ['string', 'number', 'boolean'].includes(typeof value)
        ? value
        : '[redacted]';
  }
  return result;
}
