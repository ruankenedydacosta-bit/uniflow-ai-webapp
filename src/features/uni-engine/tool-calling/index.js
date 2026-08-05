// Uni Engine — Fase 20: Tool Calling (base).
//
// Infraestrutura base isolada de Tool Calling. Não integra com OpenAI,
// Supabase, Asaas, voz ou autenticação — isso é responsabilidade da Fase
// 20.1. Tudo nasce desligado e nenhuma ferramenta real está registrada.
//
// Fluxo (único ponto de execução):
//   chamada → selection (gates) → idempotency → dispatcher → executor
//   → ToolResult padronizado → telemetria sanitizada → resposta segura.
//
// Garantias:
//   - enabled false por padrão;
//   - nenhuma ferramenta real registrada;
//   - autorização e executionAllowed obrigatórios;
//   - ferramentas writes=true exigem allowWrites explícito;
//   - timeout e AbortSignal;
//   - erro do handler nunca escapa;
//   - resultado padronizado e JSON-safe;
//   - idempotência por chave (rota);
//   - telemetria apenas com metadados sanitizados (sem args/retorno/IDs crus);
//   - nenhuma escrita financeira, nenhuma chamada de rede própria.
export * as types from './types/index.js';
export * as contracts from './contracts/index.js';
export * as registry from './registry/index.js';
export * as selection from './selection/index.js';
export * as executor from './executor/index.js';
export * as dispatcher from './dispatcher/index.js';
export * as idempotency from './idempotency/index.js';
export * as telemetry from './telemetry/index.js';
// Fase 20.1 — adaptador OpenAI (borda com o pipeline existente).
export * as adapters from './adapters/index.js';
export * as integration from './integration/index.js';
// Fase 20.2 — ferramentas financeiras reais de leitura.
export * as financialTools from './financial-tools/index.js';
// Fase 21/22 — narrativa e composição da resposta final.
export * as response from './response/index.js';
export { createToolCallingRegistry } from './registry/index.js';
export { selectToolCall } from './selection/index.js';
export { executeTool, executeToolSync } from './executor/index.js';
export { createToolCallingDispatcher } from './dispatcher/index.js';
export { createIdempotencyStore } from './idempotency/index.js';
export { createToolCallingTelemetryStore, hashToolCallId } from './telemetry/index.js';
export {
  createEmptyToolResult,
  createToolResult,
  validateToolCall,
  isSerializableValue,
  isToolResultSerializable,
} from './contracts/index.js';
export {
  TOOL_CALLING_VERSION,
  TOOL_CALLING_DEFAULT_CONFIG,
  TOOL_CALL_STATUSES,
  TOOL_CALL_SELECTION_DECISIONS,
  validateToolCallingConfig,
} from './types/index.js';
// Fase 20.1 — adaptador OpenAI + integração isolada (só fixtures seguras).
export {
  parseOpenAiToolCall,
  runOpenAiToolCallAdapter,
  toolResultToPipeline,
} from './adapters/index.js';
export {
  registerToolCallingFixtures,
  createToolCallingFixtureContext,
  runToolCallingIntegration,
} from './integration/index.js';
// Fase 20.2 — ferramentas financeiras reais de leitura (registro + context).
export {
  FINANCIAL_READ_TOOL_NAMES,
  FINANCIAL_READ_TOOL_META,
  createFinancialReadToolsRegistry,
  listFinancialToolDefinitions,
  createFinancialDataToolsContext,
  validateToolArguments,
  buildOpenAiToolsSchema,
} from './financial-tools/index.js';
// Fase 22 — composição da resposta final (LLM + narrativa do Tool Calling).
export { composeFinalResponseText } from './response/index.js';