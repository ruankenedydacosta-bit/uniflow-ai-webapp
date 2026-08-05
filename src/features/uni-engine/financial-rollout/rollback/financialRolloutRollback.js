// Uni Engine — Fase 19: Rollout Control — rollback imediato e controle de emergência.

export function rollbackFinancialRuntimeRollout(identity, runtimeResult, config, decision) {
  const reasons = [];

  if (config.emergencyRollback) {
    reasons.push('EMERGENCY_ROLLBACK_TRIGGERED');
    return {
      selectedSource: 'legacy',
      selectedText: identity?.legacyText || '',
      influenceApplied: false,
      fallbackUsed: true,
      rolloutEligible: false,
      canaryAssigned: false,
      confidence: 0,
      reasonCodes: reasons,
      safety: { blockedBy: reasons, confidenceApproved: false },
      diagnostics: { runtimeEvaluated: false, eligibleEvaluated: false, confidenceEvaluated: false },
    };
  }

  if (!config.enabled) {
    reasons.push('ROLLOUT_DISABLED');
    return {
      selectedSource: 'legacy',
      selectedText: identity?.legacyText || '',
      influenceApplied: false,
      fallbackUsed: true,
      rolloutEligible: false,
      canaryAssigned: false,
      confidence: 0,
      reasonCodes: reasons,
      safety: { blockedBy: reasons, confidenceApproved: false },
      diagnostics: { runtimeEvaluated: false, eligibleEvaluated: false, confidenceEvaluated: false },
    };
  }

  if (!config.visibleEnabled) {
    reasons.push('VISIBLE_DISABLED');
    return {
      selectedSource: 'legacy',
      selectedText: identity?.legacyText || '',
      influenceApplied: false,
      fallbackUsed: true,
      rolloutEligible: false,
      canaryAssigned: false,
      confidence: 0,
      reasonCodes: reasons,
      safety: { blockedBy: reasons, confidenceApproved: false },
      diagnostics: { runtimeEvaluated: false, eligibleEvaluated: false, confidenceEvaluated: false },
    };
  }

  if (!config.productionEnabled) {
    reasons.push('PRODUCTION_DISABLED');
    return {
      selectedSource: 'legacy',
      selectedText: identity?.legacyText || '',
      influenceApplied: false,
      fallbackUsed: true,
      rolloutEligible: false,
      canaryAssigned: false,
      confidence: 0,
      reasonCodes: reasons,
      safety: { blockedBy: reasons, confidenceApproved: false },
      diagnostics: { runtimeEvaluated: false, eligibleEvaluated: false, confidenceEvaluated: false },
    };
  }

  return decision;
}

export function validateFinancialRolloutRollback(rollback) {
  if (!rollback || typeof rollback !== 'object') {
    return { valid: false, errors: ['ROLLBACK_INVALID'] };
  }
  const errors = [];
  if (typeof rollback.selectedSource !== 'string') errors.push('SELECTED_SOURCE_INVALID');
  if (typeof rollback.selectedText !== 'string') errors.push('SELECTED_TEXT_INVALID');
  if (typeof rollback.influenceApplied !== 'boolean') errors.push('INFLUENCE_APPLIED_INVALID');
  if (typeof rollback.fallbackUsed !== 'boolean') errors.push('FALLBACK_USED_INVALID');
  if (typeof rollback.rolloutEligible !== 'boolean') errors.push('ROLLOUT_ELIGIBLE_INVALID');
  if (typeof rollback.canaryAssigned !== 'boolean') errors.push('CANARY_ASSIGNED_INVALID');
  if (typeof rollback.confidence !== 'number' || !Number.isFinite(rollback.confidence)) {
    errors.push('CONFIDENCE_INVALID');
  }
  if (rollback.confidence < 0 || rollback.confidence > 1) errors.push('CONFIDENCE_OUT_OF_RANGE');
  if (!Array.isArray(rollback.reasonCodes)) errors.push('REASON_CODES_INVALID');
  if (!rollback.safety || typeof rollback.safety !== 'object') errors.push('SAFETY_INVALID');
  if (!rollback.diagnostics || typeof rollback.diagnostics !== 'object') errors.push('DIAGNOSTICS_INVALID');
  return { valid: errors.length === 0, errors };
}
