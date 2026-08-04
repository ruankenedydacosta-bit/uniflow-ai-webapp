// Uni Engine — Cognitive Comparison (Fase 14, Bloco 3). Diagnósticos.
//
// Diagnóstico técnico da comparação legado × Engine: erros, campos ausentes,
// divergências e tempos — tudo em vocabulário fechado e sem dados sensíveis.
export function buildCognitiveComparisonDiagnostics(options = {}) {
  const safe = options && typeof options === 'object' ? options : {};
  const comparison = safe.comparison && typeof safe.comparison === 'object'
    ? safe.comparison
    : null;

  const errorCodes = [];
  if (comparison?.engineErrorCode) errorCodes.push(comparison.engineErrorCode);
  if (comparison?.agreementStatus === 'insufficient_data') {
    errorCodes.push('COMPARISON_INSUFFICIENT_DATA');
  }
  if (comparison?.agreementStatus === 'engine_error') {
    errorCodes.push('COMPARISON_ENGINE_ERROR');
  }

  const missingFields = [];
  if (comparison?.legacyIntent == null) missingFields.push('legacyIntent');
  if (comparison?.engineIntent == null) missingFields.push('engineIntent');
  if (comparison?.legacyRoute == null) missingFields.push('legacyRoute');
  if (comparison?.engineRoute == null) missingFields.push('engineRoute');

  return Object.freeze({
    errorCodes,
    missingFields,
    divergenceCount:
      comparison?.agreementStatus === 'agreement'
        ? 0
        : comparison?.agreementStatus === 'skipped'
          ? 0
          : comparison?.divergenceType
            ? 1
            : 0,
    influenceApplied: false,
    legacyPreserved: comparison?.legacyPreserved !== false,
    serializable: true,
  });
}