// Uni Engine (Fase 1 — Shadow Mode + Fase 2 — Integração Cognitiva Assistida
// + Fase 3 — Memória Inteligente Persistente em Shadow + Fase 4 — Modelo
// Epistêmico completo em Shadow).
//
// Camada cognitiva analítica e descartável sobre o pipeline atual da Uni.
// O motor apenas observa, analisa, classifica, planeja, valida, compara,
// resolve referências implícitas, diagnostica e registra telemetria redigida
// — NUNCA executa, NUNCA altera a resposta entregue ao usuário e NUNCA chama
// executor/voz. A memória persistente (Fase 3) é recuperada e capturada
// apenas para Shadow (appliedToDecision = false). O modelo epistêmico
// (Fase 4) estrutura fontes, confiança, conflitos e staleness — também
// apenas para Shadow (appliedToDecision = false, execução sempre bloqueada).
export {
  UNI_ENGINE_VERSION,
  UNI_ENGINE_MESSAGE_TYPES,
  UNI_ENGINE_PLAN_DECISIONS,
  UNI_ENGINE_EPISTEMIC_STATUSES,
  UNI_ENGINE_COMPARISON_STATUSES,
  UNI_ENGINE_ACTION_INTENTS,
  UNI_ENGINE_QUERY_INTENTS,
  UNI_ENGINE_THEORETICAL_EXECUTORS,
  UNI_ENGINE_REFERENCE_TYPES,
  UNI_ENGINE_REFERENCE_SOURCES,
  UNI_ENGINE_DIVERGENCE_TYPES,
  createCorrelationId,
  createEmptyUniEngineResult,
  findFunctionsInValue,
  isSerializableValue,
  projectFinancialSnapshot,
  validateUniEngineInput,
} from './uniEngineContracts.js';
export {
  UNI_ENGINE_DEFAULT_CONFIG,
  createUniEngineConfig,
  getUniEngineVersion,
  isUniEngineShadowEnabled,
} from './uniEngineConfig.js';
export { normalizeUserMessage } from './normalizeUserMessage.js';
export { analyzeConversationContext } from './analyzeConversationContext.js';
export { classifyCognitiveIntent } from './classifyCognitiveIntent.js';
export { buildEpistemicState } from './buildEpistemicState.js';
export { createCognitivePlan } from './createCognitivePlan.js';
export { validateCognitivePlan } from './validateCognitivePlan.js';
export { compareShadowDecision } from './compareShadowDecision.js';
export { runUniEngineShadow } from './runUniEngineShadow.js';
export { createUniEngine } from './uniEngine.js';
// Fase 2 — Integração Cognitiva Assistida.
export {
  OPERATIONAL_MEMORY_FIELDS,
  buildMemoryPatch,
  createOperationalMemory,
  readOperationalMemory,
  resetOperationalMemory,
  updateOperationalMemory,
} from './operationalMemory.js';
export { buildCognitiveContext } from './buildCognitiveContext.js';
export {
  hasImplicitReference,
  resolveImplicitReference,
} from './resolveImplicitReference.js';
export { expandCognitivePlan } from './expandCognitivePlan.js';
export { buildEngineSuggestions } from './buildEngineSuggestions.js';
export { buildDivergenceDiagnostics } from './buildDivergenceDiagnostics.js';
export { computeAgreementMetrics } from './computeAgreementMetrics.js';
export {
  buildUniEngineTelemetry,
  emitUniEngineTelemetry,
} from './telemetry/uniEngineTelemetry.js';
export {
  TELEMETRY_ALLOWED_FIELDS,
  buildRedactedTelemetryEntry,
  redactSensitiveValue,
  redactTelemetry,
  redactText,
} from './telemetry/redactTelemetry.js';
// Fase 3 — Memória Inteligente Persistente (Shadow-only).
export * as uniMemory from './memory/index.js';
// Fase 4 — Modelo Epistêmico completo (Shadow-only).
export * as epistemic from './epistemic/index.js';
// Fase 5 — Camada de Decisão Cognitiva (Shadow-only).
export * as decision from './decision/index.js';
export { runDecisionLayer } from './decision/runDecisionLayer.js';
// Fase 6 — Planning Engine estruturado (Shadow-only).
export * as planning from './planning/index.js';
export { runPlanningEngine } from './planning/runPlanningEngine.js';
// Fase 7 — Goal Engine estruturado (Shadow-only).
export * as goals from './goals/index.js';
export { runGoalEngine } from './goals/runGoalEngine.js';
// Fase 8 — Reflection & Learning Engine (Shadow-only).
export * as reflection from './reflection/index.js';
export { runReflectionEngine } from './reflection/runReflectionEngine.js';
// Fase 9 — Activation Engine (ativação gradual, Shadow-first).
export * as activation from './activation/index.js';
export { runActivationEngine } from './activation/runActivationEngine.js';
