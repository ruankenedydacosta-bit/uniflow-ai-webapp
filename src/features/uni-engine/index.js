// Uni Engine (Fase 1 — Shadow Mode + Fase 2 — Integração Cognitiva Assistida
// + Fase 3 — Memória Inteligente Persistente em Shadow + Fase 4 — Modelo
// Epistêmico completo em Shadow + Fases 5–9 — Decisão, Planning, Goals,
// Reflection e Activation em Shadow + Fase 10 — Production Readiness).
//
// Camada cognitiva analítica e descartável sobre o pipeline atual da Uni.
// O motor apenas observa, analisa, classifica, planeja, valida, compara,
// resolve referências implícitas, diagnostica e registra telemetria redigida
// — NUNCA executa, NUNCA altera a resposta entregue ao usuário e NUNCA chama
// executor/voz. A memória persistente (Fase 3) é recuperada e capturada
// apenas para Shadow (appliedToDecision = false). O modelo epistêmico
// (Fase 4) estrutura fontes, confiança, conflitos e staleness — também
// apenas para Shadow (appliedToDecision = false, execução sempre bloqueada).
// A Fase 10 adiciona health check e observability (leitura pura do config +
// resultado) sem alterar nenhum contrato existente de forma destrutiva.
export {
  UNI_ENGINE_VERSION,
  UNI_ENGINE_REVISION,
  UNI_ENGINE_MODULE_NAMES,
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
// Fase 10 — Health Check e Observability (Production Readiness). Leitura
// pura do config + resultado; nunca executa, nunca registra dados sensíveis.
export * as health from './health/index.js';
export { runEngineHealthCheck } from './health/buildEngineHealth.js';
export * as observability from './observability/index.js';
export { buildObservabilitySnapshot } from './observability/buildObservabilitySnapshot.js';
// Parte 1 — Integration (integração segura e controlada ao pipeline real).
// Camada adaptadora isolada: valida capacidades autorizadas e transforma
// SOMENTE orientações seguras; pipeline legado continua a fonte final da
// resposta e da execução. Tudo nasce desligado.
export * as integration from './integration/index.js';
export { runUniEngineIntegration } from './integration/runUniEngineIntegration.js';
// Gateway único de entrada (BLOCO 1) — camada de borda observacional que
// normaliza um turno, builda o contexto, roda a integração e consolida os
// snapshots (Observation, Rollout, Decision Readiness, Capability Readiness,
// Execution Readiness e Cognitive Orchestrator) em um único resultado
// serializável. Nunca executa nada, nunca altera a resposta entregue e
// qualquer falha → resultado falha-seguro (fallback) sem escapar.
export * as gateway from './gateway/index.js';
export { runUniEngineGateway } from './gateway/index.js';
// Parte 2 — Guidance observacional (Bloco 2). Módulo que calcula e
// consolida as quatro guidances (Question, Clarification, Style, Length) em
// um snapshot SOMENTE em memória — nunca aplica, nunca altera a resposta.
// Reutiliza o cálculo da Parte 1; a integração existente fica intacta.
export * as guidance from './guidance/index.js';
export { buildGuidanceSnapshot } from './guidance/buildGuidanceSnapshot.js';
// Parte 2 — Observação da conversa (Bloco 3). Camada que consolida os
// snapshots da integração, do guidance e da activation em um único estado
// TÉCNICO da conversa — sempre em memória, redigido, congelado e sem efeitos.
export * as observation from './observation/index.js';
export { buildObservationSnapshot } from './observation/buildObservationSnapshot.js';
// Parte 3 — Decision Readiness. Camada estritamente observacional que
// consome o Observation Snapshot e responde tecnicamente se o sistema
// ESTARIA pronto para uma aplicação futura — nunca aplica, nunca altera a
// resposta. Reutiliza Decision Layer e Activation Engine existentes.
export * as readiness from './readiness/index.js';
export { buildDecisionReadinessSnapshot } from './readiness/buildDecisionReadinessSnapshot.js';
// Parte 4 — Capability Activation Readiness (Bloco 1). Camada estritamente
// observacional que determina, a partir das decisões de Activation JÁ
// produzidas, quais capabilities poderiam ser ativadas no futuro — nunca
// ativa nada, nunca altera a resposta, nunca persiste.
export * as capabilityReadiness from './capability-readiness/index.js';
export { buildCapabilityReadinessSnapshot } from './capability-readiness/buildCapabilityReadinessSnapshot.js';
// Parte 4 — Execution Readiness (Bloco 2). Camada estritamente observacional
// que avalia se uma FUTURA execução seria segura — nunca executa nada, nunca
// altera a resposta, nunca persiste. Lê apenas resultados já produzidos.
export * as executionReadiness from './execution-readiness/index.js';
export { buildExecutionReadinessSnapshot } from './execution-readiness/buildExecutionReadinessSnapshot.js';
// Parte 5 — Application (primeira ativação controlada). Camada de APLICAÇÃO
// que consome o pipeline legado + a Uni Engine + a Activation + a guidance
// observacional e aplica SOMENTE RESPONSE_STYLE_GUIDANCE e
// RESPONSE_LENGTH_GUIDANCE, em DEV, com Integration e Activation habilitadas
// e usuário autorizado. NUNCA aplica Question/Clarification nesta parte,
// NUNCA executa e faz fallback imediato ao texto legado em qualquer falha.
export * as application from './application/index.js';
export { runControlledGuidanceApplication } from './application/runControlledGuidanceApplication.js';
export { selectControlledVisibleResponse } from './application/selectControlledVisibleResponse.js';
export { runControlledQuestionApplication } from './application/runControlledQuestionApplication.js';
// Parte 7 — Conversation Planner. Camada estritamente observacional que
// determina QUAL deve ser o próximo passo lógico da conversa (NEXT_STEP_*),
// consumindo SOMENTE os snapshots já existentes (Observation, Guidance, Decision,
// Capability Readiness, Execution Readiness e Application). Nunca gera texto,
// nunca responde, nunca executa e nunca altera o pipeline legado — o plano
// fica em memória para a FUTURA camada de ativação.
export * as conversationPlanner from './conversation-planner/index.js';
export { buildConversationPlanSnapshot } from './conversation-planner/buildConversationPlanSnapshot.js';
// Parte 8 — Conversation Routing (roteamento conversacional controlado em DEV).
// O pipeline legado consulta o Conversation Planner do MESMO turno para
// selecionar, de forma controlada, qual caminho conversacional JÁ autorizado
// deve prevalecer. Nunca cria texto, nunca executa, nunca escreve memória e
// nunca substitui a máquina de estados legada — qualquer falha → rota legada
// integral (confirmação obrigatória com precedência máxima).
export * as conversationRouting from './conversation-routing/index.js';
export { selectControlledConversationRoute } from './conversation-routing/selectControlledConversationRoute.js';
// Parte 9 — Cognitive Orchestrator (consolidação final do Uni Engine).
// Orquestra todas as camadas já produzidas em um único snapshot observacional.
// Nunca reexecuta nenhuma camada. Qualquer falha → vazio fail-safe (FALLBACK).
export * as cognitiveOrchestrator from './cognitive-orchestrator/index.js';
export { buildCognitiveOrchestratorSnapshot } from './cognitive-orchestrator/buildCognitiveOrchestratorSnapshot.js';
export { createEmptyCognitiveOrchestratorSnapshot } from './cognitive-orchestrator/cognitiveOrchestratorContracts.js';
// Parte 11 — Context Bridge (Fase 11, Bloco 2). Adaptador puro que
// transforma snapshots JÁ produzidos no MESMO turno (Gateway, Integration,
// Cognitive Orchestrator, Rollout, Readiness, resposta legada, Pending Action
// e confirmação) em um contexto mínimo, serializável e imutável para o único
// ponto de construção da resposta. Nunca reexecuta nenhuma camada, nunca gera
// texto, nunca executa e nunca persiste — qualquer falha → legado integral.
export * as contextBridge from './context-bridge/index.js';
export { buildEngineResponseContext } from './context-bridge/buildEngineResponseContext.js';
