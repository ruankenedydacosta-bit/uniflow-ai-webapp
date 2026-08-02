// Integration — enums e validadores (Parte 1: integração segura e controlada).
//
// Enum FECHADO de capacidades autorizadas nesta parte. A camada de integração
// NUNCA influencia fora desta lista, mesmo que a Activation Engine considere
// outra capacidade ativa. Estados, tipos de resposta, chaves de pergunta e de
// esclarecimento são fechados — nada de texto livre, IDs ou valores aqui.
export const INTEGRATION_VERSION = '1.0';

// ÚNICAS capacidades autorizadas na Parte 1. Qualquer outra capacidade
// (CATEGORY_SUGGESTION, DECISION_RECOMMENDATION, etc.) é rejeitada pela
// política de integração, independentemente da Activation Engine.
export const ALLOWED_INTEGRATION_CAPABILITIES = Object.freeze([
  'QUESTION_GUIDANCE',
  'CLARIFICATION_GUIDANCE',
  'RESPONSE_STYLE_GUIDANCE',
  'RESPONSE_LENGTH_GUIDANCE',
  'METADATA_ONLY',
  'DIAGNOSTICS_ONLY',
]);

// Keep this name for legacy compatibility
export const INTEGRATION_AUTHORIZED_CAPABILITIES = ALLOWED_INTEGRATION_CAPABILITIES;

// Capacidades proibidas na Parte 1.
export const BLOCKED_INTEGRATION_CAPABILITIES = Object.freeze([
  'RESPONSE_CONTENT_INFLUENCE',
  'MEMORY_WRITE',
  'FINANCIAL_EXECUTION',
  'LEARNING_APPLICATION',
]);

export const INTEGRATION_CAPABILITIES = Object.freeze([
  ...ALLOWED_INTEGRATION_CAPABILITIES,
  ...BLOCKED_INTEGRATION_CAPABILITIES,
]);

export const INTEGRATION_STATUSES = Object.freeze([
  'DISABLED',
  'SHADOW_ONLY',
  'APPLIED',
  'PARTIALLY_APPLIED',
  'FALLBACK',
  'BLOCKED',
  'ERROR_SAFE',
  'UNKNOWN',
  // Legacy support to preserve 100% compatibility:
  'disabled',
  'shadow',
  'active',
  'fallback',
]);

export const INTEGRATION_RESPONSE_TYPES = Object.freeze([
  'clarification',
  'confirmation',
  'query',
  'recommendation',
  'success',
  'error',
  'generic',
]);

export const INTEGRATION_STYLE_KEYS = Object.freeze([
  'simple',
  'normal',
  'detailed',
]);

export const INTEGRATION_LENGTH_BANDS = Object.freeze([
  'short',
  'normal',
  'detailed',
]);

export const INTEGRATION_QUESTION_KEYS = Object.freeze([
  'amount_required',
  'account_receipt',
  'account_payment',
  'transfer_origin',
  'transfer_destination',
  'adjustment_account',
  'category_required',
  'description_required',
  'date_required',
  'generic_account',
]);

export const INTEGRATION_CLARIFICATION_KEYS = Object.freeze([
  'balance_vs_income',
  'ambiguous_account',
  'ambiguous_category',
  'amount_missing',
  'unknown_intent',
  'generic',
]);

export const INTEGRATION_FALLBACK_REASONS = Object.freeze([
  // Required by prompt:
  'INTEGRATION_DISABLED',
  'ACTIVATION_DISABLED',
  'CAPABILITY_DISABLED',
  'CAPABILITY_NOT_ALLOWED',
  'INVALID_ENGINE_RESULT',
  'INVALID_ACTIVATION_RESULT',
  'INVALID_LEGACY_RESULT',
  'LOW_CONFIDENCE',
  'HIGH_RISK',
  'INSUFFICIENT_DATA',
  'CIRCUIT_BREAKER_OPEN',
  'ADAPTER_ERROR',
  'CONTRACT_ERROR',
  'UNKNOWN',

  // Legacy fallback reasons for compatibility:
  'ENGINE_DISABLED',
  'ACTIVATION_DECISIONS_MISSING',
  'CAPABILITY_NOT_AUTHORIZED',
  'CAPABILITY_NOT_ACTIVE',
  'CAPABILITY_DECISION_INVALID',
  'CONFIDENCE_INSUFFICIENT',
  'RISK_EXCESSIVE',
  'CONTEXT_INSUFFICIENT',
  'LEGACY_INVALID',
  'CONTRACT_INVALID',
  'ENGINE_ERROR',
  'INTEGRATION_INTERNAL_ERROR',
  'SHADOW_ONLY',
]);

export const INTEGRATION_GUIDANCE_TYPES = Object.freeze([
  'QUESTION',
  'CLARIFICATION',
  'STYLE',
  'LENGTH',
  'METADATA',
  'DIAGNOSTICS',
  'NONE',
  'UNKNOWN',
]);

// Validators
export function isIntegrationStatus(value) {
  return INTEGRATION_STATUSES.includes(value);
}

export function isIntegrationCapability(value) {
  return INTEGRATION_CAPABILITIES.includes(value);
}

export function isAllowedIntegrationCapability(value) {
  return ALLOWED_INTEGRATION_CAPABILITIES.includes(value);
}

export function isBlockedIntegrationCapability(value) {
  return BLOCKED_INTEGRATION_CAPABILITIES.includes(value);
}

export function isIntegrationFallbackReason(value) {
  return INTEGRATION_FALLBACK_REASONS.includes(value);
}

export function isIntegrationGuidanceType(value) {
  return INTEGRATION_GUIDANCE_TYPES.includes(value);
}

// Keep legacy validator for compatibility
export function isAuthorizedIntegrationCapability(value) {
  return ALLOWED_INTEGRATION_CAPABILITIES.includes(value);
}

// Existing legacy validators
export function isIntegrationResponseType(value) {
  return INTEGRATION_RESPONSE_TYPES.includes(value);
}

export function isIntegrationStyleKey(value) {
  return INTEGRATION_STYLE_KEYS.includes(value);
}

export function isIntegrationLengthBand(value) {
  return INTEGRATION_LENGTH_BANDS.includes(value);
}

export function isIntegrationQuestionKey(value) {
  return INTEGRATION_QUESTION_KEYS.includes(value);
}

export function isIntegrationClarificationKey(value) {
  return INTEGRATION_CLARIFICATION_KEYS.includes(value);
}

// Normalizers
export function normalizeIntegrationStatus(value) {
  if (typeof value !== 'string') return 'UNKNOWN';
  const upper = value.toUpperCase();
  if (upper === 'DISABLED' || value === 'disabled') return 'DISABLED';
  if (upper === 'SHADOW_ONLY' || upper === 'SHADOW' || value === 'shadow') return 'SHADOW_ONLY';
  if (upper === 'APPLIED' || upper === 'ACTIVE' || value === 'active') return 'APPLIED';
  if (upper === 'PARTIALLY_APPLIED') return 'PARTIALLY_APPLIED';
  if (upper === 'FALLBACK' || value === 'fallback') return 'FALLBACK';
  if (upper === 'BLOCKED') return 'BLOCKED';
  if (upper === 'ERROR_SAFE') return 'ERROR_SAFE';
  if (upper === 'UNKNOWN') return 'UNKNOWN';

  if (INTEGRATION_STATUSES.includes(upper)) return upper;
  return 'UNKNOWN';
}

export function normalizeIntegrationCapability(value) {
  if (typeof value !== 'string') return 'UNKNOWN';
  if (INTEGRATION_CAPABILITIES.includes(value)) return value;
  const upper = value.toUpperCase();
  if (INTEGRATION_CAPABILITIES.includes(upper)) return upper;
  return 'UNKNOWN';
}

export function normalizeIntegrationFallbackReason(value) {
  if (typeof value !== 'string') return 'UNKNOWN';
  if (INTEGRATION_FALLBACK_REASONS.includes(value)) return value;
  const upper = value.toUpperCase();
  if (INTEGRATION_FALLBACK_REASONS.includes(upper)) return upper;
  return 'UNKNOWN';
}

export function normalizeIntegrationGuidanceType(value) {
  if (typeof value !== 'string') return 'UNKNOWN';
  if (INTEGRATION_GUIDANCE_TYPES.includes(value)) return value;
  const upper = value.toUpperCase();
  if (INTEGRATION_GUIDANCE_TYPES.includes(upper)) return upper;
  return 'UNKNOWN';
}
