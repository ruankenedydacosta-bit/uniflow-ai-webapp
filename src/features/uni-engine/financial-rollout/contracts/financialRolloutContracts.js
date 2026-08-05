// Uni Engine — Fase 19: Rollout Control — contratos fechados e serializáveis.
// Contratos para o sistema de rollout controlado e determinístico.
//
// FINANCIAL_ROLLOUT_VERSION é canônico em ../types/financialRolloutTypes.js
// (responsabilidade: tipos, constantes e versão) -- reexportado aqui para
// não quebrar quem já importa a versão a partir de contracts/.
export { FINANCIAL_ROLLOUT_VERSION } from '../types/financialRolloutTypes.js';

export const FINANCIAL_ROLLOUT_STATUSES = Object.freeze([
  'rollout_disabled',
  'shadow_only',
  'control_group',
  'canary_ineligible',
  'canary_eligible',
  'blocked_environment',
  'blocked_identity',
  'blocked_conversation',
  'blocked_workspace',
  'blocked_pending_action',
  'blocked_confirmation',
  'blocked_confidence',
  'blocked_factual_validation',
  'blocked_eligibility',
  'blocked_intent',
  'emergency_rollback',
  'runtime_error',
  'visible_selected',
  'legacy_selected',
]);

export function isFinancialRolloutStatus(value) {
  return FINANCIAL_ROLLOUT_STATUSES.includes(value);
}

export const FINANCIAL_ROLLOUT_REASON_CODES = Object.freeze([
  'ROLLUP_DISABLED',
  'ENGINE_DISABLED',
  'RUNTIME_DISABLED',
  'SHADOW_MODE',
  'CANARY_ENVIRONMENT_BLOCKED',
  'CANARY_USER_NOT_IN_ALLOWLIST',
  'CANARY_INTEGRITY_CHECK_FAILED',
  'CANARY_ROLLOUT_QUOTA_EXCEEDED',
  'CANARY_FEATURE_FLAGS_INCONSISTENT',
  'CANARY_NOT_ELIGIBLE',
  'CANARY_INELIGIBLE',
  'BLOCKED_ENVIRONMENT',
  'BLOCKED_IDENTITY',
  'BLOCKED_CONVERSATION',
  'BLOCKED_WORKSPACE',
  'BLOCKED_PENDING_ACTION',
  'BLOCKED_CONFIRMATION',
  'BLOCKED_CONFIDENCE',
  'BLOCKED_FACTUAL_VALIDATION',
  'BLOCKED_ELIGIBILITY',
  'BLOCKED_INTENT',
  'EMERGENCY_ROLLBACK',
  'RUNTIME_ERROR',
  'ENABLED_VISIBLE',
  'LEGACY_FALLBACK',
]);

export function isFinancialRolloutReasonCode(value) {
  return FINANCIAL_ROLLOUT_REASON_CODES.includes(value);
}
