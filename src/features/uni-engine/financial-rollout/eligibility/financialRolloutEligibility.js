// Uni Engine — Fase 19: Rollout Control — avaliação completa de elegibilidade.

function stableIdFromIdentity(identity) {
  const fields = [
    identity.userId,
    identity.profileId,
    identity.workspaceId,
    identity.turnId,
    identity.messageId,
  ];
  return fields.find(id => typeof id === 'string' && id.length > 0) || 'unknown';
}

export function evaluateFinancialRolloutEligibility(identity, runtimeResult, eligibility, factualValidation, config, canaryAssignment) {
  const reasons = [];

  if (!config.enabled) {
    reasons.push('ROLLUP_DISABLED');
  }

  if (!runtimeResult || runtimeResult.mode !== 'shadow' || runtimeResult.discarded) {
    reasons.push('ENGINE_SHADOW_FAILED');
  }

  if (!config.visibleEnabled) {
    reasons.push('ROLLUP_VISIBLE_DISABLED');
  }

  if (!config.productionEnabled) {
    reasons.push('PRODUCTION_DISABLED');
  }

  if (config.emergencyRollback) {
    reasons.push('EMERGENCY_ROLLBACK');
  }

  if (!identity) {
    reasons.push('IDENTITY_MISSING');
  }

  // FASE 19.1: workspaceId/conversationId/turnId/messageId são campos
  // PRÓPRIOS de identity e runtimeResult (nunca aninhados dentro de
  // turnId, que continua sendo uma string simples).
  if (config.requireWorkspaceMatch && runtimeResult?.workspaceId != null && identity?.workspaceId != null && identity.workspaceId !== runtimeResult.workspaceId) {
    reasons.push('WORKSPACE_MISMATCH');
  }

  if (config.requireConversationMatch && runtimeResult?.conversationId != null && identity?.conversationId != null && identity.conversationId !== runtimeResult.conversationId) {
    reasons.push('CONVERSATION_MISMATCH');
  }

  if (config.requireTurnMatch && runtimeResult?.turnId != null && identity?.turnId != null && identity.turnId !== runtimeResult.turnId) {
    reasons.push('TURN_MISMATCH');
  }

  if (config.requireMessageMatch && runtimeResult?.messageId != null && identity?.messageId != null && identity.messageId !== runtimeResult.messageId) {
    reasons.push('MESSAGE_MISMATCH');
  }

  if (!canaryAssignment?.eligible) {
    reasons.push('CANARY_INELIGIBLE');
  }

  if (!Array.isArray(identity?.allowedIntents) && config?.allowedIntents?.length > 0) {
    const intentDenied = !config.allowedIntents.includes(runtimeResult?.intent?.type);
    if (intentDenied) reasons.push('INTENT_DENIED');
  }

  if (identity?.intent?.type && config?.deniedIntents?.includes(identity.intent.type)) {
    reasons.push('INTENT_DENIED');
  }

  if (config.requireEligibility && !eligibility?.eligible) {
    if (eligibility?.reasonCodes?.length > 0) {
      reasons.push(...eligibility.reasonCodes.map(code => `ELIGIBILITY_${code}`));
    } else {
      reasons.push('ELIGIBILITY_FAILED');
    }
  }

  if (config.requireFactualValidation && !factualValidation?.valid) {
    if (factualValidation?.reasonCodes?.length > 0) {
      reasons.push(...factualValidation.reasonCodes.map(code => `FACTUAL_${code}`));
    } else {
      reasons.push('FACTUAL_VALIDATION_FAILED');
    }
  }

  const confidence = runtimeResult?.confidence ?? runtimeResult?.narrative?.confidence ?? 0;
  if (confidence < config.minimumConfidence) {
    reasons.push('CONFIDENCE_INSUFFICIENT');
  }

  if (!runtimeResult?.narrative?.text?.trim()) {
    reasons.push('NARRATIVE_INVALID');
  }

  if (runtimeResult?.status !== 'completed') {
    reasons.push('RUNTIME_ERROR');
  }

  if (identity?.pendingAction) {
    reasons.push('PENDING_ACTION_ACTIVE');
  }

  if (identity?.confirmationState?.pending) {
    reasons.push('CONFIRMATION_PENDING');
  }

  const selectedSource = identity?.selectedSource || 'legacy';
  if (selectedSource === 'financial_runtime') {
    reasons.push('DUPLICATE_SELECTION');
  }

  const eligible = reasons.length === 0;

  return {
    eligible,
    reasonCodes: reasons,
    influenceAllowed: !eligible,
    fallbackRequired: eligible,
    confidence,
    eligibleIntents: identity?.allowedIntents || [],
    blockedIntents: identity?.deniedIntents || [],
    identityVerified: !!identity?.workspaceId,
    conversationVerified: !!identity?.conversationId,
    turnVerified: !!identity?.turnId,
  };
}

export function validateFinancialRolloutEligibility(eligibility) {
  if (!eligibility || typeof eligibility !== 'object') {
    return { valid: false, errors: ['ELIGIBILITY_INVALID'] };
  }
  const errors = [];
  if (typeof eligibility.eligible !== 'boolean') errors.push('ELIGIBLE_MISSING_OR_NOT_BOOLEAN');
  if (!Array.isArray(eligibility.reasonCodes)) errors.push('REASON_CODES_MISSING_OR_INVALID');
  if (typeof eligibility.influenceAllowed !== 'boolean') errors.push('INFLUENCE_ALLOWED_MISSING_OR_NOT_BOOLEAN');
  if (typeof eligibility.fallbackRequired !== 'boolean') errors.push('FALLBACK_REQUIRED_MISSING_OR_NOT_BOOLEAN');
  if (typeof eligibility.confidence !== 'number' || !Number.isFinite(eligibility.confidence)) {
    errors.push('CONFIDENCE_MISSING_OR_INVALID');
  }
  if (eligibility.confidence < 0 || eligibility.confidence > 1) {
    errors.push('CONFIDENCE_OUT_OF_RANGE');
  }
  return { valid: errors.length === 0, errors };
}
