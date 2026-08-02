// Activation Engine — enums e validadores (Fase 9).
//
// Enum fechado de capacidades, status de ativação, modos de rollout,
// ambientes e gates. Nada aqui é ativável por padrão; o registro de
// capacidades (capabilityRegistry.js) decide o que pode ser elegível.
export const ACTIVATION_CAPABILITIES = Object.freeze([
  'METADATA_ONLY',
  'DIAGNOSTICS_ONLY',
  'QUESTION_GUIDANCE',
  'CLARIFICATION_GUIDANCE',
  'RESPONSE_STYLE_GUIDANCE',
  'RESPONSE_LENGTH_GUIDANCE',
  'CATEGORY_SUGGESTION',
  'ACCOUNT_SUGGESTION',
  'GOAL_SUGGESTION',
  'PLANNING_SUGGESTION',
  'RISK_WARNING',
  'CONFIDENCE_DISCLOSURE',
  'MEMORY_READ_GUIDANCE',
  'EPISTEMIC_CAUTION',
  'DECISION_RECOMMENDATION',
  'RESPONSE_CONTENT_INFLUENCE',
  'MEMORY_WRITE',
  'FINANCIAL_EXECUTION',
  'LEARNING_APPLICATION',
  'UNKNOWN',
]);

export const ACTIVATION_STATUSES = Object.freeze([
  'DISABLED',
  'SHADOW_ONLY',
  'ELIGIBLE',
  'ACTIVE_TEST',
  'ACTIVE_ROLLOUT',
  'BLOCKED_BY_ENVIRONMENT',
  'BLOCKED_BY_FLAG',
  'BLOCKED_BY_CONFIDENCE',
  'BLOCKED_BY_RISK',
  'BLOCKED_BY_WORKSPACE',
  'BLOCKED_BY_DATA',
  'BLOCKED_BY_POLICY',
  'BLOCKED_BY_CIRCUIT_BREAKER',
  'FALLBACK_LEGACY',
  'ERROR_SAFE',
  'UNKNOWN',
]);

export const ACTIVATION_ROLLOUT_MODES = Object.freeze([
  'OFF',
  'SHADOW',
  'TEST_USERS',
  'PERCENTAGE',
  'DEVELOPMENT_ONLY',
  'MANUAL_OVERRIDE',
  'FULL_ROLLOUT',
  'UNKNOWN',
]);

export const ACTIVATION_ENVIRONMENTS = Object.freeze([
  'development',
  'staging',
  'production',
  'test',
  'unknown',
]);

export const ACTIVATION_GATE_NAMES = Object.freeze([
  'ENGINE_ENABLED',
  'ACTIVATION_ENABLED',
  'CAPABILITY_ENABLED',
  'ENVIRONMENT_ALLOWED',
  'TEST_USER_ALLOWED',
  'PERCENTAGE_ROLLOUT',
  'CONFIDENCE_THRESHOLD',
  'RISK_THRESHOLD',
  'WORKSPACE_COMPATIBLE',
  'DATA_SUFFICIENCY',
  'CAPABILITY_POLICY',
  'CIRCUIT_BREAKER',
  'FALLBACK_AVAILABILITY',
]);

export function isValidActivationCapability(value) {
  return ACTIVATION_CAPABILITIES.includes(value);
}

export function isValidActivationStatus(value) {
  return ACTIVATION_STATUSES.includes(value);
}

export function isValidActivationRolloutMode(value) {
  return ACTIVATION_ROLLOUT_MODES.includes(value);
}

export function isValidActivationEnvironment(value) {
  return ACTIVATION_ENVIRONMENTS.includes(value);
}

export function isValidActivationGateName(value) {
  return ACTIVATION_GATE_NAMES.includes(value);
}
