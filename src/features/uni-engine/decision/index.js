// Camada de Decisão Cognitiva do Uni Engine (Fase 5 — Shadow Mode).
//
// A camada calcula a MELHOR decisão possível (responder, perguntar,
// confirmar, esperar, consultar memória/banco, rejeitar, cancelar, adiar)
// — e NUNCA executa. `shadow.appliedToDecision` permanece SEMPRE falso;
// nenhum módulo do pipeline atual é substituído nesta fase.
export {
  DECISION_TYPES,
  DECISION_RISKS,
  DECISION_REASONS,
  DECISION_CONTEXT_SUFFICIENCY,
  DECISION_CONSISTENCY_STATES,
  DECISION_DIAGNOSTICS,
  DECISION_SUGGESTIONS,
  DECISION_CONFIDENCE_BANDS,
  DECISION_RISK_TYPES,
  DECISION_DEPENDENCY_KEYS,
  isValidDecisionType,
  isValidDecisionRisk,
  isValidDecisionReason,
  isValidDecisionContextSufficiency,
  isValidDecisionConsistency,
  isValidDecisionDiagnostic,
  isValidDecisionSuggestion,
  isValidDecisionRiskType,
  describeDecisionConfidence,
} from './decisionTypes.js';
export {
  DECISION_LAYER_VERSION,
  createDecisionDependencies,
  validateDecisionDependencies,
  createDecisionShadow,
  createDecisionResult,
  validateDecisionResult,
  createEmptyDecisionResult,
  createDecisionContext,
} from './decisionContracts.js';
export {
  DECISION_POLICY,
  clamp01,
  describeConfidence,
  whenAnswerPolicy,
  whenAskPolicy,
  whenRejectPolicy,
  whenWaitPolicy,
  whenConfirmPolicy,
} from './decisionPolicy.js';
export {
  evaluateDecisionContext,
  evaluateContextSufficiency,
  buildMissingInformation,
  evaluateDecisionDependencies,
  evaluateDecisionConsistency,
  isKnownSufficiency,
  isKnownConsistency,
} from './evaluateDecisionContext.js';
export { computeDecisionConfidence } from './computeDecisionConfidence.js';
export { detectDecisionRisk } from './detectDecisionRisk.js';
export { chooseNextDecision, isValidDecision } from './chooseNextDecision.js';
export { buildDecisionReason } from './buildDecisionReason.js';
export { buildDecisionSuggestions } from './buildDecisionSuggestions.js';
export { runDecisionLayer } from './runDecisionLayer.js';
export {
  buildDecisionTelemetry,
  emitDecisionTelemetry,
} from './telemetry/decisionTelemetry.js';
export {
  DECISION_TELEMETRY_ALLOWED_FIELDS,
  redactDecisionTelemetry,
  buildRedactedDecisionTelemetryEntry,
  redactDecisionText,
  redactDecisionSensitiveValue,
} from './telemetry/redactDecisionTelemetry.js';
