// Uni Engine — Runtime Conversacional Financeiro (Fase 17).
//
// Camada de runtime que conecta a conversa da Uni ao motor financeiro
// das Fases 15-16. Permite interpretar perguntas financeiras reais,
// consultar dados reais da aplicação e gerar respostas determinísticas
// em Shadow Mode.
//
// Pipeline: intent → temporal → query planning → execution → comparison → narrative
//
// Garantias: influenceApplied=false, executionAllowed=false, discarded=true,
// serializável, sem efeitos, sem escrita, sem rede.
export {
  FINANCIAL_RUNTIME_VERSION,
  FINANCIAL_RUNTIME_INTENTS,
  RUNTIME_TEMPORAL_ENTITIES,
  RUNTIME_QUERY_TYPES,
  RUNTIME_COMPARISON_TYPES,
  RUNTIME_STATUS,
  RUNTIME_STAGES,
  RUNTIME_SAFETY_KEYS,
} from './types/index.js';

export {
  isFinancialRuntimeIntent,
  isRuntimeTemporalEntity,
  isRuntimeQueryType,
  isRuntimeComparisonType,
  isRuntimeStatus,
  isRuntimeStage,
} from './types/index.js';

export {
  createEmptyRuntimeStageResults,
  createEmptyRuntimeResult,
  isRuntimeObjectSerializable,
} from './contracts/index.js';

export {
  resolveFinancialIntent,
  getSupportedIntents,
  isValidIntent,
} from './intent/index.js';

export {
  planFinancialQuery,
  getQueryConfig,
  getIntentQueryTypes,
  buildTemporalFiltersForRuntime,
} from './query/index.js';

export {
  executeFinancialQuery,
  getAvailableExecutors,
} from './executor/index.js';

export {
  resolveRuntimeTemporal,
  extractRuntimeTemporalEntities,
  getSupportedTemporalEntities,
  isValidTemporalEntity,
} from './temporal/index.js';

export {
  compareRuntimePeriods,
  compareMultipleRuntimePeriods,
  getSupportedComparisonTypes,
  isValidComparisonType,
} from './comparator/index.js';

export {
  generateRuntimeNarrative,
  getAvailableNarrativeStyles,
} from './narrator/index.js';

export {
  runFinancialRuntimeShadow,
  getFinancialRuntimeCapabilities,
} from './shadow/index.js';

export {
  compareLegacyWithRuntime,
  getComparisonSummary,
} from './comparison/index.js';

export { selectFinancialVisibleResponse } from './response-selection/index.js';