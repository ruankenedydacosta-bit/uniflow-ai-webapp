// Uni Engine — Motor de Raciocínio Financeiro (Fase 15).
//
// Camada analítica e descartável (Shadow Mode) sobre os dados financeiros da
// Uni. O motor observa, consolida snapshot, diagnostica, infere, planeja,
// compara com o pipeline legado e registra telemetria sanitizada em memória
// — NUNCA executa, NUNCA escreve, NUNCA chama serviços externos e NUNCA
// altera a resposta visível (`influenceApplied` SEMPRE false, `discarded`
// SEMPRE true).
export {
  FINANCIAL_REASONING_VERSION,
  FINANCIAL_DIAGNOSTIC_TYPES,
  FINANCIAL_DIAGNOSTIC_PRIORITIES,
  FINANCIAL_INFERENCE_TYPES,
  FINANCIAL_PLANNER_OBJECTIVES,
  FINANCIAL_PLANNER_ACTIONS,
  FINANCIAL_COMPARISON_STATUSES,
  FINANCIAL_REASONING_STATUSES,
  FINANCIAL_REASONING_STAGES,
  isFinancialDiagnosticType,
  isFinancialDiagnosticPriority,
  isFinancialInferenceType,
  isFinancialPlannerObjective,
  isFinancialPlannerAction,
  isFinancialComparisonStatus,
  isFinancialReasoningStatus,
  isFinancialReasoningStage,
} from './types/index.js';
export {
  FINANCIAL_REASONING_SAFETY_KEYS,
  createEmptyFinancialStageResults,
  createEmptyFinancialReasoningResult,
  isFinancialObjectSerializable,
  validateFinancialSnapshot,
  validateFinancialDiagnostics,
  validateFinancialInferences,
  validateFinancialReasoningResult,
} from './contracts/index.js';
export {
  buildFinancialReasoningSnapshot,
  FINANCIAL_REASONING_SNAPSHOT_VERSION,
  FINANCIAL_REASONING_DEFAULT_RESERVE_MONTHS,
  FINANCIAL_REASONING_FLOW_MONTHS,
  FINANCIAL_REASONING_MAX_LATEST_EVENTS,
} from './snapshot/index.js';
export { buildFinancialDiagnostics } from './diagnostics/index.js';
export { buildFinancialInference } from './inference/index.js';
export { buildFinancialPlanner } from './planner/index.js';
export { compareFinancialPipelines } from './comparison/index.js';
export { runFinancialReasoningShadow } from './engine/index.js';
export {
  getGlobalFinancialReasoningTelemetryStore,
  setGlobalFinancialReasoningTelemetryStore,
  resetGlobalFinancialReasoningTelemetryStore,
} from './engine/index.js';
export {
  FINANCIAL_TELEMETRY_VERSION,
  FINANCIAL_TELEMETRY_DEFAULT_MAX_ENTRIES,
  FINANCIAL_TELEMETRY_MAX_ENTRIES_LIMIT,
  createFinancialTelemetryStore,
  buildFinancialTelemetryEntry,
  recordFinancialTelemetry,
  getFinancialTelemetrySnapshot,
  resetFinancialTelemetry,
} from './telemetry/index.js';