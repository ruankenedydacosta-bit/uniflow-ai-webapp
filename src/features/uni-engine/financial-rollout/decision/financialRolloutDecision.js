// Uni Engine — Fase 19: Rollout Control — função central de decisão de rollout.

function extractStableIdentityPart(identity) {
  const fields = [
    identity?.userId,
    identity?.profileId,
    identity?.workspaceId,
    identity?.turnId,
    identity?.messageId,
    identity?.conversationId,
    identity?.sessionId,
  ];
  return fields.find(id => typeof id === 'string' && id.length > 0) || 'unknown';
}

function isRuntimeOk(runtimeResult, identity, config) {
  if (!runtimeResult || runtimeResult.mode !== 'shadow' || runtimeResult.status !== 'completed') {
    return false;
  }
  if (config.emergencyRollback) return false;
  if (!config.visibleEnabled) return false;
  if (!config.productionEnabled) return false;
  if (!identity?.workspaceId) return false;
  if (identity?.pendingAction) return false;
  if (identity?.confirmationState?.pending) return false;
  return true;
}

function buildLegacySelection(legacyText, identity, eligible, reasonCodes) {
  return {
    selectedSource: 'legacy',
    selectedText: legacyText,
    influenceApplied: false,
    fallbackUsed: true,
    rolloutEligible: false,
    canaryAssigned: false,
    confidence: 0,
    reasonCodes,
    safety: {
      blockedBy: reasonCodes,
      confidenceApproved: false,
    },
    diagnostics: {
      runtimeEvaluated: false,
      eligibleEvaluated: false,
      confidenceEvaluated: false,
    },
  };
}

function buildFinancialSelection(financialResult, eligible, identity, reasonCodes) {
  const confidence = financialResult?.confidence ?? financialResult?.narrative?.confidence ?? 0;
  return {
    selectedSource: 'financial_runtime',
    selectedText: financialResult?.narrative?.text || '',
    influenceApplied: eligible,
    fallbackUsed: !eligible,
    rolloutEligible: true,
    canaryAssigned: eligible && identity?.canaryEligible,
    confidence,
    reasonCodes,
    safety: {
      blockedBy: reasonCodes,
      confidenceApproved: confidence >= 0.9,
    },
    diagnostics: {
      runtimeEvaluated: true,
      eligibleEvaluated: eligible,
      confidenceEvaluated: true,
    },
  };
}

export function decideFinancialRuntimeRollout(identity, legacyText, runtimeResult, financialSelection, eligibility, canaryAssignment, config) {
  if (!isRuntimeOk(runtimeResult, identity, config)) {
    const reasons = [];
    if (!config.visibleEnabled) reasons.push('visible_enabled_false');
    if (!config.productionEnabled) reasons.push('production_enabled_false');
    if (config.emergencyRollback) reasons.push('emergency_rollback');
    if (!identity?.workspaceId) reasons.push('identity_missing');
    if (identity?.pendingAction) reasons.push('pending_action');
    if (identity?.confirmationState?.pending) reasons.push('confirmation_pending');
    return buildLegacySelection(legacyText, identity, false, reasons);
  }

  const eligible = isRolloutEligible(identity, runtimeResult, financialSelection, eligibility, config, canaryAssignment);
  const reasons = buildEligibilityReasons(identity, runtimeResult, financialSelection, eligibility, config, canaryAssignment);

  if (!eligible) {
    return buildLegacySelection(legacyText, identity, false, reasons);
  }

  return buildFinancialSelection(runtimeResult, true, identity, reasons);
}

// FASE 19.1: mesmos gates de isolamento de financialRolloutIntegration.js --
// workspaceId/conversationId/turnId/messageId são campos PRÓPRIOS de
// identity e runtimeResult (nunca aninhados dentro de turnId).
function identityMismatches(identity, runtimeResult, config) {
  const mismatches = [];
  if (
    config.requireWorkspaceMatch
    && identity?.workspaceId != null
    && runtimeResult?.workspaceId != null
    && identity.workspaceId !== runtimeResult.workspaceId
  ) {
    mismatches.push('workspace_mismatch');
  }
  if (
    config.requireConversationMatch
    && identity?.conversationId != null
    && runtimeResult?.conversationId != null
    && identity.conversationId !== runtimeResult.conversationId
  ) {
    mismatches.push('conversation_mismatch');
  }
  if (
    config.requireTurnMatch
    && identity?.turnId != null
    && runtimeResult?.turnId != null
    && identity.turnId !== runtimeResult.turnId
  ) {
    mismatches.push('turn_mismatch');
  }
  if (
    config.requireMessageMatch
    && identity?.messageId != null
    && runtimeResult?.messageId != null
    && identity.messageId !== runtimeResult.messageId
  ) {
    mismatches.push('message_mismatch');
  }
  return mismatches;
}

function isRolloutEligible(identity, runtimeResult, financialSelection, eligibility, config, canaryAssignment) {
  if (!runtimeResult || runtimeResult.mode !== 'shadow' || runtimeResult.status !== 'completed') return false;
  if (config.emergencyRollback) return false;
  if (!config.visibleEnabled) return false;
  if (!config.productionEnabled) return false;
  if (!identity?.workspaceId) return false;
  if (identity?.pendingAction) return false;
  if (identity?.confirmationState?.pending) return false;
  if (identityMismatches(identity, runtimeResult, config).length > 0) return false;
  if (!canaryAssignment?.eligible) return false;
  if (!eligibility?.eligible) return false;
  const confidence = runtimeResult?.confidence ?? runtimeResult?.narrative?.confidence ?? 0;
  if (confidence < config.minimumConfidence) return false;
  if (!runtimeResult?.narrative?.text?.trim()) return false;
  return true;
}

function buildEligibilityReasons(identity, runtimeResult, financialSelection, eligibility, config, canaryAssignment) {
  const reasons = [];
  if (!config.enabled) reasons.push('rollout_disabled');
  if (!config.visibleEnabled) reasons.push('visible_disabled');
  if (!config.productionEnabled) reasons.push('production_disabled');
  if (config.emergencyRollback) reasons.push('emergency_rollback');
  if (!identity?.workspaceId) reasons.push('identity_missing');
  if (identity?.pendingAction) reasons.push('pending_action');
  if (identity?.confirmationState?.pending) reasons.push('confirmation_pending');
  reasons.push(...identityMismatches(identity, runtimeResult, config));
  if (!canaryAssignment?.eligible) reasons.push('canary_ineligible');
  if (!eligibility?.eligible) {
    reasons.push(...eligibility?.reasonCodes?.map(code => code.toLowerCase()) || ['eligibility_failed']);
  }
  const confidence = runtimeResult?.confidence ?? runtimeResult?.narrative?.confidence ?? 0;
  if (confidence < config.minimumConfidence) reasons.push('confidence_insufficient');
  if (!runtimeResult?.narrative?.text?.trim()) reasons.push('narrative_invalid');
  return reasons;
}

export function validateFinancialRolloutDecision(decision) {
  if (!decision || typeof decision !== 'object') {
    return { valid: false, errors: ['DECISION_INVALID'] };
  }
  const errors = [];
  if (!['legacy', 'financial_runtime'].includes(decision.selectedSource)) {
    errors.push('SELECTED_SOURCE_INVALID');
  }
  if (typeof decision.selectedText !== 'string') errors.push('SELECTED_TEXT_INVALID');
  if (typeof decision.influenceApplied !== 'boolean') errors.push('INFLUENCE_APPLIED_INVALID');
  if (typeof decision.fallbackUsed !== 'boolean') errors.push('FALLBACK_USED_INVALID');
  if (typeof decision.rolloutEligible !== 'boolean') errors.push('ROLLOUT_ELIGIBLE_INVALID');
  if (typeof decision.canaryAssigned !== 'boolean') errors.push('CANARY_ASSIGNED_INVALID');
  if (typeof decision.confidence !== 'number' || !Number.isFinite(decision.confidence)) {
    errors.push('CONFIDENCE_INVALID');
  }
  if (decision.confidence < 0 || decision.confidence > 1) errors.push('CONFIDENCE_OUT_OF_RANGE');
  if (!Array.isArray(decision.reasonCodes)) errors.push('REASON_CODES_INVALID');
  if (!decision.safety || typeof decision.safety !== 'object') errors.push('SAFETY_INVALID');
  if (!decision.diagnostics || typeof decision.diagnostics !== 'object') errors.push('DIAGNOSTICS_INVALID');
  return { valid: errors.length === 0, errors };
}