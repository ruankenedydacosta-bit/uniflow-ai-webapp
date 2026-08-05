// Uni Engine — Fase 19: Rollout Control — camada de integração para o fluxo do UniChatPage.

let lastFinancialRolloutState = {
  turnId: null,
  workspaceId: null,
  conversationId: null,
  legacyText: null,
  runtimeResult: null,
  financialSelection: null,
  eligible: null,
  canaryAssignment: null,
  decision: null,
  telemetryStarted: false,
};

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

function isRuntimeOk(runtimeResult, config) {
  if (!runtimeResult || runtimeResult.mode !== 'shadow' || runtimeResult.status !== 'completed') {
    return false;
  }
  if (config.emergencyRollback) return false;
  if (!config.visibleEnabled) return false;
  if (!config.productionEnabled) return false;
  return true;
}

function buildLegacySelection(legacyText, identity, eligible, reasonCodes, rollbackUsed = true) {
  return {
    selectedSource: 'legacy',
    selectedText: legacyText,
    influenceApplied: false,
    fallbackUsed: true,
    rolloutEligible: false,
    canaryAssigned: false,
    confidence: 0,
    rollbackUsed,
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

function buildFinancialSelection(runtimeResult, eligible, identity, reasonCodes) {
  const confidence = runtimeResult?.confidence ?? runtimeResult?.narrative?.confidence ?? 0;
  return {
    selectedSource: 'financial_runtime',
    selectedText: runtimeResult?.narrative?.text || '',
    influenceApplied: eligible,
    fallbackUsed: !eligible,
    rolloutEligible: true,
    canaryAssigned: eligible && identity?.canaryEligible,
    confidence,
    rollbackUsed: false,
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

// FASE 19.1: gates de isolamento reais. turnId é, e sempre foi, uma string
// simples -- workspaceId/conversationId/messageId agora viajam como campos
// PRÓPRIOS no runtimeResult (ver runFinancialRuntimeShadow.js), nunca
// aninhados dentro de turnId. As comparações abaixo usam exclusivamente
// esses campos-irmãos, nunca uma propriedade inventada dentro de turnId.
//
// Cada gate só bloqueia quando o respectivo require*Match está ligado
// (todos nascem `true` em FINANCIAL_ROLLOUT_CONFIG -- fail-closed por
// padrão) E o identificador correspondente existir dos dois lados para
// comparar; ausência de qualquer um dos dois lados é tratada por
// IDENTITY_MISSING/campo ausente, não por "match", e nunca é decidida aqui.
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

function isRolloutEligible(identity, runtimeResult, eligible, config, canaryAssignment) {
  if (!runtimeResult || runtimeResult.mode !== 'shadow' || runtimeResult.status !== 'completed') return false;
  if (config.emergencyRollback) return false;
  if (!config.visibleEnabled) return false;
  if (!config.productionEnabled) return false;
  if (!identity?.workspaceId) return false;
  if (identity?.pendingAction) return false;
  if (identity?.confirmationState?.pending) return false;
  if (identityMismatches(identity, runtimeResult, config).length > 0) return false;
  if (!canaryAssignment?.eligible) return false;
  if (!eligible) return false;
  const confidence = runtimeResult?.confidence ?? runtimeResult?.narrative?.confidence ?? 0;
  if (confidence < config.minimumConfidence) return false;
  if (!runtimeResult?.narrative?.text?.trim()) return false;
  return true;
}

function buildEligibilityReasons(identity, runtimeResult, eligible, config, canaryAssignment) {
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
  if (!eligible) {
    reasons.push(...(eligible?.reasonCodes?.map(code => code.toLowerCase()) || ['eligibility_failed']));
  }
  const confidence = runtimeResult?.confidence ?? runtimeResult?.narrative?.confidence ?? 0;
  if (confidence < config.minimumConfidence) reasons.push('confidence_insufficient');
  if (!runtimeResult?.narrative?.text?.trim()) reasons.push('narrative_invalid');
  return reasons;
}

function stableIdFromIdentity(identity) {
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

export function runFinancialRolloutIntegration(options) {
  const safeOptions = options && typeof options === 'object' ? options : {};
  const {
    legacyText,
    runtimeResult,
    financialSelection,
    config,
    identity,
    eligible,
    canaryAssignment,
    environment = 'development',
  } = safeOptions;
  // Falha-segura: config ausente/malformado (ex.: chamada com options vazio)
  // nunca deve lançar -- cai no mesmo ramo de ROLLOUT_DISABLED, que já é o
  // fallback legado.
  const safeConfig = config && typeof config === 'object' ? config : {};

  if (!safeConfig.enabled) {
    return {
      selectedSource: 'legacy',
      selectedText: legacyText,
      influenceApplied: false,
      fallbackUsed: true,
      rolloutEligible: false,
      canaryAssigned: false,
      confidence: 0,
      rollbackUsed: true,
      reasonCodes: ['ROLLOUT_DISABLED'],
      safety: { blockedBy: ['ROLLOUT_DISABLED'], confidenceApproved: false },
      diagnostics: { runtimeEvaluated: false, eligibleEvaluated: false, confidenceEvaluated: false },
    };
  }

  if (safeConfig.emergencyRollback) {
    return buildLegacySelection(legacyText, identity, false, ['EMERGENCY_ROLLBACK_TRIGGERED'], true);
  }

  const eligibleResult = isRolloutEligible(identity, runtimeResult, eligible, safeConfig, canaryAssignment);
  const reasons = buildEligibilityReasons(identity, runtimeResult, eligible, safeConfig, canaryAssignment);

  if (!eligibleResult) {
    return buildLegacySelection(legacyText, identity, false, reasons);
  }

  return buildFinancialSelection(runtimeResult, true, identity, reasons);
}

export function validateFinancialRolloutIntegration(options) {
  const errors = [];

  if (!options.legacyText || typeof options.legacyText !== 'string') {
    errors.push('legacyText is required and must be a string');
  }

  if (!options.runtimeResult || typeof options.runtimeResult !== 'object') {
    errors.push('runtimeResult is required and must be an object');
  }

  if (!options.financialSelection || typeof options.financialSelection !== 'object') {
    errors.push('financialSelection is required and must be an object');
  }

  if (!options.config || typeof options.config !== 'object') {
    errors.push('config is required and must be an object');
  }

  if (!options.identity || typeof options.identity !== 'object') {
    errors.push('identity is required and must be an object');
  }

  if (options.canaryAssignment && typeof options.canaryAssignment !== 'object') {
    errors.push('canaryAssignment must be an object if provided');
  }

  return { valid: errors.length === 0, errors };
}

export function getFinancialRolloutState() {
  return { ...lastFinancialRolloutState };
}

export function updateFinancialRolloutState(stateUpdate) {
  lastFinancialRolloutState = {
    ...lastFinancialRolloutState,
    ...stateUpdate,
  };
}

export function isFinancialRolloutEnabled(config) {
  return Boolean(config?.enabled);
}

export function isFinancialRolloutVisible(config) {
  return Boolean(config?.visibleEnabled);
}

export function isFinancialRolloutProduction(config) {
  return Boolean(config?.productionEnabled);
}

export function isCanaryEnabled(config) {
  return Boolean(config?.canaryEnabled);
}

export function isCanaryActive(canaryAssignment) {
  return Boolean(canaryAssignment?.eligible);
}

export function isEmergencyRollback(config) {
  return Boolean(config?.emergencyRollback);
}

export function isTelemetryEnabled(config) {
  return Boolean(config?.telemetryEnabled);
}

export function isCanaryPercentageActive(canaryAssignment, percentage) {
  if (!canaryAssignment?.eligible) return false;
  return canaryAssignment.bucket < (percentage || 0);
}

export function validateFinancialRolloutControls(config) {
  const errors = [];
  if (typeof config?.enabled !== 'boolean') errors.push('enabled must be boolean');
  if (typeof config?.shadowMode !== 'boolean') errors.push('shadowMode must be boolean');
  if (typeof config?.visibleEnabled !== 'boolean') errors.push('visibleEnabled must be boolean');
  if (typeof config?.productionEnabled !== 'boolean') errors.push('productionEnabled must be boolean');
  if (typeof config?.canaryEnabled !== 'boolean') errors.push('canaryEnabled must be boolean');
  if (typeof config?.canaryPercentage !== 'number' || !Number.isFinite(config.canaryPercentage)) {
    errors.push('canaryPercentage must be a finite number');
  }
  if (config.canaryPercentage < 0 || config.canaryPercentage > 100) {
    errors.push('canaryPercentage must be between 0 and 100');
  }
  if (typeof config?.minimumConfidence !== 'number' || !Number.isFinite(config.minimumConfidence)) {
    errors.push('minimumConfidence must be a finite number');
  }
  if (config.minimumConfidence < 0 || config.minimumConfidence > 1) {
    errors.push('minimumConfidence must be between 0 and 1');
  }
  if (typeof config?.telemetryEnabled !== 'boolean') errors.push('telemetryEnabled must be boolean');
  if (typeof config?.emergencyRollback !== 'boolean') errors.push('emergencyRollback must be boolean');
  if (typeof config?.requireEligibility !== 'boolean') errors.push('requireEligibility must be boolean');
  if (typeof config?.requireFactualValidation !== 'boolean') errors.push('requireFactualValidation must be boolean');
  if (typeof config?.requireIdentityMatch !== 'boolean') errors.push('requireIdentityMatch must be boolean');
  if (typeof config?.requireConversationMatch !== 'boolean') errors.push('requireConversationMatch must be boolean');
  if (typeof config?.requireWorkspaceMatch !== 'boolean') errors.push('requireWorkspaceMatch must be boolean');
  if (!Array.isArray(config?.allowedIntents)) errors.push('allowedIntents must be an array');
  if (!Array.isArray(config?.deniedIntents)) errors.push('deniedIntents must be an array');
  return { valid: errors.length === 0, errors };
}