// Uni Engine — Fase 20.2: Tool Calling — ferramentas financeiras de leitura.
//
// Primeiras ferramentas reais da Uni: seis ferramentas seguras e somente de
// leitura que consomem o snapshot canônico já construído no turno. Nenhuma
// escrita, nenhuma rede, nenhuma segunda chamada LLM. Integram-se ao fluxo da
// Fase 20.1 via registry + dispatcher.
export {
  validateToolArguments,
  MAX_STRING_LENGTH,
  MAX_OBJECT_KEYS,
} from './argsValidation.js';
export {
  FINANCIAL_READ_TOOL_NAMES,
  FINANCIAL_READ_TOOL_META,
  createFinancialReadToolsRegistry,
  listFinancialToolDefinitions,
  createFinancialDataToolsContext,
} from './registry.js';
export {
  buildFinancialToolHandlers,
  buildGetFinancialSummaryHandler,
  buildGetExpenseBreakdownHandler,
  buildCompareFinancialPeriodsHandler,
  buildGetGoalProgressHandler,
  buildGetAccountSummaryHandler,
  buildGetRecurringExpensesHandler,
  toolOk,
  toolError,
} from './handlers.js';
// Sprint 1 (IA Conversacional) — conversor para o formato `tools` da OpenAI.
export { buildOpenAiToolsSchema } from './openAiToolsSchema.js';