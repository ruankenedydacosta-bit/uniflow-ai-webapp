// Uni Engine — Inteligência Financeira Conversacional (Fase 16).
//
// Camada conversacional sobre o Motor de Raciocínio Financeiro (Fase 15).
// Permite responder perguntas financeiras em linguagem natural via Shadow Mode:
// intent detection → temporal resolution → context enrichment → query planning
// → shadow execution → period comparison → narrative generation
//
// Garantias: influenceApplied=false, discarded=true, serializável, sem efeitos.
export {
  FINANCIAL_CONVERSATIONAL_VERSION,
  FINANCIAL_CONVERSATIONAL_INTENTS,
  TEMPORAL_ENTITY_TYPES,
  TEMPORAL_GRANULARITY,
  TEMPORAL_COMPARISON_TYPES,
  TEMPORAL_RESOLVER_STATUS,
  FINANCIAL_QUERY_PLAN_TYPES,
  FINANCIAL_EXECUTOR_STATUS,
  FINANCIAL_NARRATIVE_TYPES,
  FINANCIAL_NARRATIVE_STYLES,
  NARRATIVE_INSIGHT_PRIORITIES,
  FINANCIAL_CONVERSATIONAL_STATUS,
  FINANCIAL_CONVERSATIONAL_STAGES,
  FINANCIAL_CONVERSATIONAL_SAFETY_KEYS,
  isFinancialConversationalIntent,
  isTemporalEntityType,
  isTemporalGranularity,
  isTemporalComparisonType,
  isTemporalResolverStatus,
  isFinancialQueryPlanType,
  isFinancialExecutorStatus,
  isFinancialNarrativeType,
  isFinancialNarrativeStyle,
  isNarrativeInsightPriority,
  isFinancialConversationalStatus,
  isFinancialConversationalStage,
} from './types/index.js';

export {
  createEmptyFinancialConversationalStageResults,
  createEmptyFinancialConversationalResult,
  isFinancialConversationalObjectSerializable,
  validateFinancialConversationalIntent,
  validateFinancialTemporalResolution,
  validateFinancialQueryPlan,
  validateFinancialExecutionResult,
  validateFinancialPeriodComparison,
  validateFinancialNarrative,
  validateFinancialConversationalResult,
} from './contracts/index.js';

export {
  resolveTemporalReferences,
  extractTemporalEntities,
  buildTemporalContext,
} from './temporal/index.js';

export {
  enrichFinancialContext,
  getContextualMetrics,
} from './context/index.js';

export {
  planFinancialQuery,
  getPlanSteps,
  getIntentPlanType,
} from './query-planner/index.js';

export {
  executeFinancialQuery,
} from './executor/index.js';

export {
  compareFinancialPeriods,
  compareMultiplePeriods,
} from './period-comparison/index.js';

export {
  generateFinancialNarrative,
  getAvailableStyles,
  getAvailableNarrativeTypes,
} from './narrator/index.js';

export {
  runFinancialConversationalShadow,
  getFinancialConversationalCapabilities,
} from './integration/index.js';

export {
  compareLegacyWithConversational,
  getComparisonSummary,
} from './comparison/index.js';