// Redator de telemetria epistêmica (Fase 4).
//
// NUNCA registra:
//   - valores financeiros;
//   - texto completo da mensagem;
//   - nomes de contas, categorias, pessoas;
//   - e-mail, IDs externos;
//   - conteúdo sensível.
//
// Permite apenas agregados: quantidades, contagens, confiança média,
// recomendações redigidas por tipo, latência e divergência com o plano.
// A redação é aplicada SEMPRE antes de qualquer registro/envio.

export const EPISTEMIC_TELEMETRY_ALLOWED_FIELDS = Object.freeze([
  'correlationId',
  'engineVersion',
  'epistemicModelVersion',
  'enabled',
  'shadowMode',
  'appliedToDecision',
  'itemCount',
  'conflictCount',
  'staleItemCount',
  'missingItemCount',
  'memoryCount',
  'memoryScopeFiltered',
  'meanConfidence',
  'minConfidence',
  'maxConfidence',
  'confidenceBands',
  'evidenceTotal',
  'evidenceDeduped',
  'evidenceByType',
  'sufficientDisplay',
  'sufficientSuggest',
  'sufficientConfirm',
  'sufficientStoreMemory',
  'executeBlocked',
  'recommendationCount',
  'recommendationTypes',
  'planDivergence',
  'fallbackUsed',
  'latencyMs',
  'errorCode',
  'truncatedItems',
  'truncatedConflicts',
]);

const REDACTED = '[redacted]';

export function redactEpistemicTelemetry(telemetry) {
  const source = telemetry && typeof telemetry === 'object' ? telemetry : {};
  const result = {};
  for (const field of EPISTEMIC_TELEMETRY_ALLOWED_FIELDS) {
    if (Object.hasOwn(source, field)) {
      result[field] = redactField(field, source[field]);
    }
  }
  return result;
}

function redactField(field, value) {
  if (['recommendationTypes', 'evidenceByType', 'confidenceBands'].includes(field)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const copy = {};
      for (const [key, count] of Object.entries(value)) {
        if (typeof count === 'number' && Number.isFinite(count)) copy[key] = count;
      }
      return copy;
    }
    return {};
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return REDACTED;
}

export function redactEpistemicText() {
  return REDACTED;
}

export function redactEpistemicSensitiveValue() {
  return REDACTED;
}

// Garante que qualquer entrada arbitrária vira telemetria epistêmica
// redigida — campos desconhecidos são descartados.
export function buildRedactedEpistemicTelemetryEntry(partial) {
  const source = partial && typeof partial === 'object' ? partial : {};
  return redactEpistemicTelemetry({
    correlationId: source.correlationId,
    engineVersion: source.engineVersion,
    epistemicModelVersion: source.epistemicModelVersion,
    enabled: Boolean(source.enabled),
    shadowMode: Boolean(source.shadowMode),
    appliedToDecision: Boolean(source.appliedToDecision),
    itemCount: typeof source.itemCount === 'number' ? source.itemCount : null,
    conflictCount: typeof source.conflictCount === 'number' ? source.conflictCount : null,
    staleItemCount: typeof source.staleItemCount === 'number' ? source.staleItemCount : null,
    missingItemCount: typeof source.missingItemCount === 'number' ? source.missingItemCount : null,
    memoryCount: typeof source.memoryCount === 'number' ? source.memoryCount : null,
    memoryScopeFiltered: typeof source.memoryScopeFiltered === 'number' ? source.memoryScopeFiltered : null,
    meanConfidence: typeof source.meanConfidence === 'number' ? source.meanConfidence : null,
    minConfidence: typeof source.minConfidence === 'number' ? source.minConfidence : null,
    maxConfidence: typeof source.maxConfidence === 'number' ? source.maxConfidence : null,
    confidenceBands: source.confidenceBands ?? {},
    evidenceTotal: typeof source.evidenceTotal === 'number' ? source.evidenceTotal : null,
    evidenceDeduped: typeof source.evidenceDeduped === 'number' ? source.evidenceDeduped : null,
    evidenceByType: source.evidenceByType ?? {},
    sufficientDisplay: typeof source.sufficientDisplay === 'number' ? source.sufficientDisplay : null,
    sufficientSuggest: typeof source.sufficientSuggest === 'number' ? source.sufficientSuggest : null,
    sufficientConfirm: typeof source.sufficientConfirm === 'number' ? source.sufficientConfirm : null,
    sufficientStoreMemory: typeof source.sufficientStoreMemory === 'number' ? source.sufficientStoreMemory : null,
    executeBlocked: Boolean(source.executeBlocked),
    recommendationCount: typeof source.recommendationCount === 'number' ? source.recommendationCount : null,
    recommendationTypes: source.recommendationTypes ?? {},
    planDivergence: source.planDivergence ?? null,
    fallbackUsed: Boolean(source.fallbackUsed),
    latencyMs: typeof source.latencyMs === 'number' ? source.latencyMs : null,
    errorCode: source.errorCode ?? null,
    truncatedItems: Boolean(source.truncatedItems),
    truncatedConflicts: Boolean(source.truncatedConflicts),
  });
}
