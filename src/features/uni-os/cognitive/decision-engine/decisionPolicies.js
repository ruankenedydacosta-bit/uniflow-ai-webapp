export const DECISION_TYPES = Object.freeze([
  'DIRECT_RESPONSE',
  'FINANCIAL_ACTION_CONFIRMATION',
  'FINANCIAL_ANALYSIS',
  'GOAL_GUIDANCE',
  'CONFIGURATION_CHANGE',
  'SAFETY_GUIDANCE',
  'CLARIFICATION_REQUEST',
]);

export const PRIMARY_DECISIONS = Object.freeze([
  'RESPOND',
  'WAIT_FOR_CONFIRMATION',
  'ANALYZE',
  'GUIDE',
  'APPLY_PREFERENCE',
  'PRIORITIZE_SAFETY',
  'REQUEST_CLARIFICATION',
]);

export const EXECUTION_INTENTS = Object.freeze([
  'NONE',
  'PROPOSE_ONLY',
  'AWAIT_CONFIRMATION',
]);

export const FALLBACK_STRATEGIES = Object.freeze([
  'SAFE_DEFAULT',
  'REQUEST_CLARIFICATION',
  'REQUIRE_CONFIRMATION',
  'DEFER_DECISION',
]);

export const EXPLANATION_LEVELS = Object.freeze([
  'MINIMAL',
  'STANDARD',
  'DETAILED',
  'COMPREHENSIVE',
]);

export const COMMUNICATION_OBJECTIVES = Object.freeze([
  'INFORM',
  'CONFIRM',
  'EXPLAIN',
  'GUIDE',
  'ACKNOWLEDGE',
  'REASSURE',
  'CLARIFY',
]);

const TYPE_BY_MODE = Object.freeze({
  CASUAL: 'DIRECT_RESPONSE',
  TRANSACTIONAL: 'FINANCIAL_ACTION_CONFIRMATION',
  ANALYTICAL: 'FINANCIAL_ANALYSIS',
  PLANNING: 'GOAL_GUIDANCE',
  CONFIGURATION: 'CONFIGURATION_CHANGE',
  SAFETY: 'SAFETY_GUIDANCE',
});

const PRIMARY_BY_TYPE = Object.freeze({
  DIRECT_RESPONSE: 'RESPOND',
  FINANCIAL_ACTION_CONFIRMATION: 'WAIT_FOR_CONFIRMATION',
  FINANCIAL_ANALYSIS: 'ANALYZE',
  GOAL_GUIDANCE: 'GUIDE',
  CONFIGURATION_CHANGE: 'APPLY_PREFERENCE',
  SAFETY_GUIDANCE: 'PRIORITIZE_SAFETY',
  CLARIFICATION_REQUEST: 'REQUEST_CLARIFICATION',
});

const OBJECTIVE_BY_TYPE = Object.freeze({
  DIRECT_RESPONSE: 'INFORM',
  FINANCIAL_ACTION_CONFIRMATION: 'CONFIRM',
  FINANCIAL_ANALYSIS: 'EXPLAIN',
  GOAL_GUIDANCE: 'GUIDE',
  CONFIGURATION_CHANGE: 'ACKNOWLEDGE',
  SAFETY_GUIDANCE: 'REASSURE',
  CLARIFICATION_REQUEST: 'CLARIFY',
});

export function resolveDecisionType(reasoningPlan = {}, hasPlanner = true) {
  if (!hasPlanner || ['MEDIUM', 'HIGH'].includes(reasoningPlan.ambiguityLevel)) {
    return 'CLARIFICATION_REQUEST';
  }
  return TYPE_BY_MODE[reasoningPlan.analysisMode] ?? 'DIRECT_RESPONSE';
}

export function primaryDecisionForType(decisionType) {
  return PRIMARY_BY_TYPE[decisionType] ?? 'REQUEST_CLARIFICATION';
}

export function communicationObjectiveForType(decisionType) {
  return OBJECTIVE_BY_TYPE[decisionType] ?? 'CLARIFY';
}

export function executionIntentForType(decisionType) {
  if (decisionType === 'FINANCIAL_ACTION_CONFIRMATION') return 'AWAIT_CONFIRMATION';
  if (decisionType === 'CONFIGURATION_CHANGE') return 'PROPOSE_ONLY';
  return 'NONE';
}

export function fallbackForDecision({ decisionType, riskLevel = 'LOW' } = {}) {
  if (decisionType === 'CLARIFICATION_REQUEST') return 'REQUEST_CLARIFICATION';
  if (['HIGH', 'CRITICAL'].includes(riskLevel)) return 'DEFER_DECISION';
  if (decisionType === 'FINANCIAL_ACTION_CONFIRMATION') return 'REQUIRE_CONFIRMATION';
  return 'SAFE_DEFAULT';
}

export function explanationLevelForDepth(reasoningDepth) {
  return {
    LOW: 'MINIMAL',
    MEDIUM: 'STANDARD',
    HIGH: 'DETAILED',
    VERY_HIGH: 'COMPREHENSIVE',
  }[reasoningDepth] ?? 'MINIMAL';
}
