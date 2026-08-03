export const ANALYSIS_MODES = Object.freeze([
  'CASUAL',
  'TRANSACTIONAL',
  'ANALYTICAL',
  'PLANNING',
  'CONFIGURATION',
  'SAFETY',
]);

export const DECISION_STRATEGIES = Object.freeze([
  'DIRECT',
  'REQUIRE_CONFIRMATION',
  'DATA_DRIVEN',
  'EVALUATE_OPTIONS',
  'CLARIFY_FIRST',
  'SAFETY_FIRST',
  'PRESERVE_PREFERENCE',
]);

export const RESPONSE_STRATEGIES = Object.freeze([
  'CONCISE',
  'CONFIRMATION_REQUEST',
  'STRUCTURED_EXPLANATION',
  'GUIDED_PLAN',
  'CLARIFYING_QUESTION',
  'CAREFUL_GUIDANCE',
  'CONFIGURATION_ACKNOWLEDGEMENT',
]);

export const CONVERSATION_MODES = Object.freeze([
  'CASUAL',
  'ACTION',
  'ADVISORY',
  'PLANNING',
  'CONFIGURATION',
  'EMERGENCY',
]);

export const RISK_LEVELS = Object.freeze(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export const AMBIGUITY_LEVELS = Object.freeze(['NONE', 'LOW', 'MEDIUM', 'HIGH']);
export const PRIORITY_FOCUS = Object.freeze([
  'USER_INTENT',
  'ACCURACY',
  'GOAL_ALIGNMENT',
  'CLARITY',
  'SAFETY',
  'PREFERENCE_INTEGRITY',
]);

const FINANCIAL_ACTIONS = new Set([
  'financial_action', 'register_income', 'register_expense', 'register_transfer',
]);
const FINANCIAL_QUESTIONS = new Set([
  'financial_question', 'check_balance', 'forecast',
]);
const PLANNING_INTENTS = new Set(['planning', 'create_goal', 'long_term_planning']);
const CONFIGURATION_INTENTS = new Set(['configuration', 'configure', 'update_preference']);
const EMERGENCY_INTENTS = new Set(['emergency', 'financial_emergency']);

export function normalizeIntent(value) {
  return typeof value === 'string' && value.trim()
    ? value.trim().toLowerCase()
    : 'question';
}

export function resolveAnalysisMode(intent) {
  const normalized = normalizeIntent(intent);
  if (EMERGENCY_INTENTS.has(normalized)) return 'SAFETY';
  if (CONFIGURATION_INTENTS.has(normalized)) return 'CONFIGURATION';
  if (PLANNING_INTENTS.has(normalized)) return 'PLANNING';
  if (FINANCIAL_ACTIONS.has(normalized)) return 'TRANSACTIONAL';
  if (FINANCIAL_QUESTIONS.has(normalized)) return 'ANALYTICAL';
  return 'CASUAL';
}

export function resolveStrategies({
  analysisMode,
  requiresConfirmation = false,
  ambiguityLevel = 'NONE',
} = {}) {
  if (analysisMode === 'SAFETY') {
    return strategy('SAFETY_FIRST', 'CAREFUL_GUIDANCE', 'EMERGENCY', 'SAFETY');
  }
  if (['MEDIUM', 'HIGH'].includes(ambiguityLevel)) {
    return strategy('CLARIFY_FIRST', 'CLARIFYING_QUESTION', modeFor(analysisMode), 'CLARITY');
  }
  if (analysisMode === 'TRANSACTIONAL') {
    return requiresConfirmation
      ? strategy('REQUIRE_CONFIRMATION', 'CONFIRMATION_REQUEST', 'ACTION', 'ACCURACY')
      : strategy('DATA_DRIVEN', 'STRUCTURED_EXPLANATION', 'ACTION', 'ACCURACY');
  }
  if (analysisMode === 'ANALYTICAL') {
    return strategy('DATA_DRIVEN', 'STRUCTURED_EXPLANATION', 'ADVISORY', 'ACCURACY');
  }
  if (analysisMode === 'PLANNING') {
    return strategy('EVALUATE_OPTIONS', 'GUIDED_PLAN', 'PLANNING', 'GOAL_ALIGNMENT');
  }
  if (analysisMode === 'CONFIGURATION') {
    return strategy(
      'PRESERVE_PREFERENCE',
      'CONFIGURATION_ACKNOWLEDGEMENT',
      'CONFIGURATION',
      'PREFERENCE_INTEGRITY',
    );
  }
  return strategy('DIRECT', 'CONCISE', 'CASUAL', 'USER_INTENT');
}

function modeFor(analysisMode) {
  return {
    TRANSACTIONAL: 'ACTION',
    ANALYTICAL: 'ADVISORY',
    PLANNING: 'PLANNING',
    CONFIGURATION: 'CONFIGURATION',
  }[analysisMode] ?? 'CASUAL';
}

function strategy(decisionStrategy, responseStrategy, conversationMode, priorityFocus) {
  return { decisionStrategy, responseStrategy, conversationMode, priorityFocus };
}
