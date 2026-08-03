// Uni Engine — Application (Parte 5, Bloco 3: primeira ativação controlada).
//
// Camada de APLICAÇÃO controlada. Consome o resultado do pipeline legado +
// o resultado da Uni Engine + as decisões da Activation Engine + a guidance
// observacional, e aplica RESPONSE_STYLE_GUIDANCE e RESPONSE_LENGTH_GUIDANCE
// (texto) e QUESTION_GUIDANCE / CLARIFICATION_GUIDANCE (apenas decisões
// observacionais questionDecision / clarificationDecision), exclusivamente em
// ambiente development, com Integration e Activation habilitadas e usuário
// autorizado. NUNCA gera texto de pergunta/esclarecimento, NUNCA executa,
// NUNCA substitui integralmente a resposta exibida e faz fallback imediato ao
// texto legado em qualquer falha. Tudo nasce desligado.
export {
  APPLICATION_VERSION,
  APPLICATION_MODES,
  ALLOWED_APPLICATION_CAPABILITIES,
  BLOCKED_APPLICATION_CAPABILITIES,
  APPLICATION_CAPABILITIES,
  APPLICATION_STATUSES,
  APPLICATION_FALLBACK_REASONS,
  APPLICATION_SAFETY_KEYS,
  QUESTION_PRIORITIES,
  QUESTION_REASONS,
  CLARIFICATION_PRIORITIES,
  CLARIFICATION_REASONS,
  isApplicationStatus,
  isApplicationMode,
  isApplicationCapability,
  isAllowedApplicationCapability,
  isBlockedApplicationCapability,
  isApplicationFallbackReason,
  isApplicationSafetyKey,
  isQuestionPriority,
  isQuestionReason,
  normalizeQuestionPriority,
  normalizeQuestionReason,
  isClarificationPriority,
  isClarificationReason,
  normalizeClarificationPriority,
  normalizeClarificationReason,
} from './applicationTypes.js';
export {
  APPLICATION_POLICY,
  getApplicationPolicy,
  isApplicationEnabledByPolicy,
  isCapabilityAllowedByPolicy,
  isCapabilityBlockedByPolicy,
  isEnvironmentAllowedByPolicy,
  isUserAuthorizedByPolicy,
  isConfidenceAllowedByPolicy,
  isRiskAllowedByPolicy,
  isQuestionCapabilityEnabledByConfig,
  isQuestionConfidenceAllowedByPolicy,
  isClarificationCapabilityEnabledByConfig,
  isClarificationConfidenceAllowedByPolicy,
  shouldUseApplicationFallback,
  shouldPreserveLegacyPipeline,
} from './applicationPolicy.js';
export {
  createEmptyApplicationResult,
  createApplicationResult,
  normalizeApplicationResult,
  validateApplicationResult,
  sanitizeCapabilityList,
  sanitizeDiagnostics,
  sanitizeQuestionDecision,
  sanitizeClarificationDecision,
  createApplicationSafety,
  createQuestionDecision,
  isQuestionDecisionSerializable,
  validateQuestionDecision,
  QUESTION_DECISION_FIELDS,
  createClarificationDecision,
  isClarificationDecisionSerializable,
  validateClarificationDecision,
  CLARIFICATION_DECISION_FIELDS,
  isSerializableApplicationResult,
} from './applicationContracts.js';
export {
  buildApplicationDiagnostics,
  createApplicationDiagnostic,
  normalizeApplicationDiagnostic,
  isSafeApplicationDiagnostic,
} from './buildApplicationDiagnostics.js';
export {
  APPLICATION_TELEMETRY_ALLOWED_FIELDS,
  redactApplicationTelemetry,
} from './telemetry/redactApplicationTelemetry.js';
export {
  runControlledGuidanceApplication,
  getApplicationVersion,
} from './runControlledGuidanceApplication.js';
export {
  VISIBLE_RESPONSE_CAPABILITIES,
  isSafetyIntegral,
  selectControlledVisibleResponse,
} from './selectControlledVisibleResponse.js';
export {
  CONTROLLED_QUESTION_VERSION,
  CONTROLLED_QUESTION_CAPABILITIES,
  CONTROLLED_QUESTION_DECISION_TYPES,
  CONTROLLED_QUESTION_TEMPLATE_KEYS,
  ALLOWED_REQUESTED_FIELDS,
  ALLOWED_AMBIGUITY_FIELDS,
  CONTROLLED_QUESTION_REASONS,
  CONTROLLED_QUESTION_SAFETY_KEYS,
  isControlledQuestionCapability,
  isControlledQuestionDecisionType,
  isControlledQuestionTemplateKey,
  isAllowedRequestedField,
  isAllowedAmbiguityField,
  isControlledQuestionReason,
  normalizeControlledQuestionReason,
  isControlledQuestionSafetyKey,
} from './controlledQuestionTypes.js';
export {
  CONTROLLED_QUESTION_POLICY,
  CONTROLLED_QUESTION_PRIORITY,
  CONTROLLED_QUESTION_TEMPLATES,
  getControlledQuestionPolicy,
  selectControlledQuestionTemplateKey,
  selectControlledQuestionTemplate,
  selectControlledQuestionTemplateKeyForDecisionType,
  selectControlledQuestionTemplateForDecisionType,
  getControlledQuestionPriority,
  isControlledQuestionsEnabledByConfig,
  isControlledQuestionCapabilityEnabledByConfig,
} from './controlledQuestionPolicy.js';
export {
  CONTROLLED_QUESTION_FIELDS,
  CONTROLLED_QUESTION_DIAGNOSTICS_KEYS,
  createControlledQuestionSafety,
  isControlledQuestionSafetyIntegral,
  sanitizeControlledQuestionDiagnostics,
  createControlledQuestionDiagnostic,
  createControlledQuestionResult,
  isControlledQuestionResultSerializable,
  validateControlledQuestionResult,
} from './controlledQuestionContracts.js';
export {
  buildControlledQuestionDiagnostics,
} from './buildControlledQuestionDiagnostics.js';
export {
  CONTROLLED_QUESTION_TELEMETRY_ALLOWED_FIELDS,
  redactControlledQuestionTelemetry,
} from './telemetry/redactControlledQuestionTelemetry.js';
export {
  selectControlledQuestionTemplateSafe,
} from './selectControlledQuestionTemplate.js';
export {
  buildControlledQuestion,
} from './buildControlledQuestion.js';
export {
  PENDING_ACTION_REGISTER_INTENTS,
  runControlledQuestionApplication,
  getControlledQuestionVersion,
} from './runControlledQuestionApplication.js';
