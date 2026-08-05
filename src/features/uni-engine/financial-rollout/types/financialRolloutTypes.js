// Uni Engine — Fase 19: Rollout Control — tipos básicos.
export const FINANCIAL_ROLLOUT_VERSION = '1.0';

export const FINANCIAL_ROLLOUT_CONFIG = Object.freeze({
  enabled: false,
  shadowMode: true,
  visibleEnabled: false,
  productionEnabled: false,
  canaryEnabled: false,
  canaryPercentage: 0,
  minimumConfidence: 0.9,
  requireEligibility: true,
  requireFactualValidation: true,
  requireIdentityMatch: true,
  requireConversationMatch: true,
  requireWorkspaceMatch: true,
  // FASE 19.1: turnId/messageId são strings simples e reais (nunca objetos)
  // no contrato do runtime -- estes gates comparam identity.turnId/messageId
  // (turno atual) contra runtimeResult.turnId/messageId (turno em que o
  // resultado foi produzido), detectando resultado stale ou de outro turno.
  requireTurnMatch: true,
  requireMessageMatch: true,
  telemetryEnabled: false,
  emergencyRollback: false,
  allowedIntents: [],
  deniedIntents: [],
});

export function validateFinancialRolloutConfig(config) {
  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['CONFIG_INVALID'] };
  }
  const errors = [];
  if (typeof config.enabled !== 'boolean') errors.push('ENABLED_MISSING_OR_NOT_BOOLEAN');
  if (typeof config.shadowMode !== 'boolean') errors.push('SHADOW_MODE_MISSING_OR_NOT_BOOLEAN');
  if (typeof config.visibleEnabled !== 'boolean') errors.push('VISIBLE_ENABLED_MISSING_OR_NOT_BOOLEAN');
  if (typeof config.productionEnabled !== 'boolean') errors.push('PRODUCTION_ENABLED_MISSING_OR_NOT_BOOLEAN');
  if (typeof config.canaryEnabled !== 'boolean') errors.push('CANARY_ENABLED_MISSING_OR_NOT_BOOLEAN');
  if (typeof config.canaryPercentage !== 'number' || !Number.isFinite(config.canaryPercentage)) {
    errors.push('CANARY_PERCENTAGE_MISSING_OR_INVALID');
  }
  if (config.canaryPercentage < 0 || config.canaryPercentage > 100) {
    errors.push('CANARY_PERCENTAGE_OUT_OF_RANGE');
  }
  if (typeof config.minimumConfidence !== 'number' || !Number.isFinite(config.minimumConfidence)) {
    errors.push('MINIMUM_CONFIDENCE_MISSING_OR_INVALID');
  }
  if (config.minimumConfidence < 0 || config.minimumConfidence > 1) {
    errors.push('MINIMUM_CONFIDENCE_OUT_OF_RANGE');
  }
  if (typeof config.requireEligibility !== 'boolean') errors.push('REQUIRE_ELIGIBILITY_MISSING_OR_NOT_BOOLEAN');
  if (typeof config.requireFactualValidation !== 'boolean') errors.push('REQUIRE_FACTUAL_VALIDATION_MISSING_OR_NOT_BOOLEAN');
  if (typeof config.requireIdentityMatch !== 'boolean') errors.push('REQUIRE_IDENTITY_MATCH_MISSING_OR_NOT_BOOLEAN');
  if (typeof config.requireConversationMatch !== 'boolean') errors.push('REQUIRE_CONVERSATION_MATCH_MISSING_OR_NOT_BOOLEAN');
  if (typeof config.requireWorkspaceMatch !== 'boolean') errors.push('REQUIRE_WORKSPACE_MATCH_MISSING_OR_NOT_BOOLEAN');
  if (typeof config.requireTurnMatch !== 'boolean') errors.push('REQUIRE_TURN_MATCH_MISSING_OR_NOT_BOOLEAN');
  if (typeof config.requireMessageMatch !== 'boolean') errors.push('REQUIRE_MESSAGE_MATCH_MISSING_OR_NOT_BOOLEAN');
  if (typeof config.telemetryEnabled !== 'boolean') errors.push('TELEMETRY_ENABLED_MISSING_OR_NOT_BOOLEAN');
  if (typeof config.emergencyRollback !== 'boolean') errors.push('EMERGENCY_ROLLBACK_MISSING_OR_NOT_BOOLEAN');
  return { valid: errors.length === 0, errors };
}
