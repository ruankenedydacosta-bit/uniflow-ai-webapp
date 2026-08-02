// Uni Engine — Integration (Parte 1: integração segura e controlada).
//
// Camada adaptadora isolada entre a Uni Engine e o pipeline real. Recebe o
// resultado do pipeline legado + o resultado da Uni Engine + as decisões da
// Activation Engine, valida capacidades autorizadas e transforma SOMENTE
// orientações seguras (pergunta, esclarecimento, estilo, comprimento,
// metadata e diagnóstico). NUNCA executa ações, NUNCA substitui
// integralmente a resposta e aplica fallback imediato ao legado em qualquer
// erro. Tudo nasce desligado (flags de integração false por padrão).
export {
  INTEGRATION_VERSION,
  INTEGRATION_AUTHORIZED_CAPABILITIES,
  INTEGRATION_STATUSES,
  INTEGRATION_RESPONSE_TYPES,
  INTEGRATION_STYLE_KEYS,
  INTEGRATION_LENGTH_BANDS,
  INTEGRATION_QUESTION_KEYS,
  INTEGRATION_CLARIFICATION_KEYS,
  INTEGRATION_FALLBACK_REASONS,
  isAuthorizedIntegrationCapability,
} from './integrationTypes.js';
export {
  INTEGRATION_POLICY,
  QUESTION_TEMPLATES,
  CLARIFICATION_TEMPLATES,
  mapEngineLengthBand,
  mapEngineStyleKey,
  mapLegacyAmbiguityToClarificationKey,
  mapLegacyIssueToQuestionKey,
  mapMissingFieldToQuestionKey,
} from './integrationPolicy.js';
export {
  createEmptyIntegrationResult,
  createIntegrationResult,
  validateIntegrationResult,
} from './integrationContracts.js';
export { buildLegacyPipelineAdapter } from './legacyPipelineAdapter.js';
export {
  evaluateEngineInfluence,
  isActivationDecisionActive,
  normalizeActivationDecisions,
  resolveIntegrationStatus,
} from './evaluateEngineInfluence.js';
export { applyQuestionGuidance } from './applyQuestionGuidance.js';
export { applyClarificationGuidance } from './applyClarificationGuidance.js';
export { applyResponseStyleGuidance } from './applyResponseStyleGuidance.js';
export { applyResponseLengthGuidance } from './applyResponseLengthGuidance.js';
export { buildIntegrationDiagnostics } from './buildIntegrationDiagnostics.js';
export {
  buildIntegrationSuggested,
  runUniEngineIntegration,
} from './runUniEngineIntegration.js';
export {
  buildIntegrationTelemetry,
  emitIntegrationTelemetry,
} from './telemetry/integrationTelemetry.js';
export {
  INTEGRATION_TELEMETRY_ALLOWED_FIELDS,
  redactIntegrationTelemetry,
} from './telemetry/redactIntegrationTelemetry.js';
