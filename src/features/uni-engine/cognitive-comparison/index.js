// Uni Engine — Cognitive Comparison (Fase 14, Bloco 3).
// Comparador observacional "legado × Engine" — puramente diagnóstico.
export { COGNITIVE_COMPARISON_VERSION } from './cognitiveComparisonTypes.js';
export {
  COGNITIVE_AGREEMENT_STATUSES,
  COGNITIVE_DIVERGENCE_TYPES,
  COGNITIVE_DIVERGENCE_SEVERITIES,
  COGNITIVE_COMPARISON_REASON_CODES,
  isCognitiveAgreementStatus,
  isCognitiveDivergenceType,
  isCognitiveDivergenceSeverity,
  isCognitiveComparisonReasonCode,
} from './cognitiveComparisonTypes.js';
export {
  createCognitiveComparison,
  createEmptyCognitiveComparison,
  validateCognitiveComparison,
  isCognitiveComparisonSerializable,
} from './cognitiveComparisonContracts.js';
export { engineRouteFromPlan, isValidEngineRoute } from './mapEngineRouteFromPlan.js';
export { legacyRouteFromResponse } from './mapLegacyRoute.js';
export { compareLegacyWithEngine, buildEmptyCognitiveComparison } from './compareLegacyWithEngine.js';
export { buildCognitiveComparisonDiagnostics } from './buildCognitiveComparisonDiagnostics.js';