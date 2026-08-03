export {
  DecisionEngineValidationError,
  createDecisionPlan,
  decisionEngine,
  logDecisionSummary,
  runDecisionEngineShadow,
} from './decisionEngine.js';
export { evaluateDecision, normalizeInput } from './decisionEvaluator.js';
export {
  COMMUNICATION_OBJECTIVES,
  DECISION_TYPES,
  EXECUTION_INTENTS,
  EXPLANATION_LEVELS,
  FALLBACK_STRATEGIES,
  PRIMARY_DECISIONS,
  communicationObjectiveForType,
  executionIntentForType,
  explanationLevelForDepth,
  fallbackForDecision,
  primaryDecisionForType,
  resolveDecisionType,
} from './decisionPolicies.js';
export { DECISION_STRATEGIES, resolveDecisionStrategy } from './decisionStrategies.js';
export {
  DECISION_AMBIGUITY_LEVELS,
  DECISION_ENGINE_VERSION,
  DECISION_RISK_LEVELS,
  createDecisionPlanSnapshot,
  deepClone,
  deepFreeze,
} from './decisionSchema.js';
export { validateDecisionPlan } from './decisionValidator.js';
