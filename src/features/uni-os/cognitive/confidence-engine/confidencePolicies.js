export const CONFIDENCE_REASONS = Object.freeze([
  'DECISION_CONFIDENCE_AVAILABLE',
  'CONTEXT_AVAILABLE',
  'MEMORY_AVAILABLE',
  'REASONING_AVAILABLE',
  'INSIGHTS_AVAILABLE',
  'GOALS_AVAILABLE',
  'LOW_RISK',
  'NO_AMBIGUITY',
  'CONFIRMATION_PROTECTED',
]);

export const MISSING_INFORMATION_CODES = Object.freeze([
  'DECISION_PLAN',
  'CONTEXT',
  'MEMORY',
  'REASONING',
  'PLANNER_REFERENCE',
  'CAPABILITIES',
]);

export const CONFLICTING_SIGNAL_CODES = Object.freeze([
  'HIGH_CONFIDENCE_BLOCKING_RISK',
  'AMBIGUITY_NOT_CLARIFIED',
  'UNCONFIRMED_EXECUTION_INTENT',
  'FINANCIAL_ACTION_WITHOUT_CONFIRMATION',
]);

export const UNCERTAINTY_SOURCE_CODES = Object.freeze([
  'MISSING_DECISION_PLAN',
  'MISSING_CONTEXT',
  'MISSING_MEMORY',
  'MISSING_REASONING',
  'MISSING_PLANNER_REFERENCE',
  'MISSING_CAPABILITIES',
  'AMBIGUITY',
  'ELEVATED_RISK',
  'LOW_BASE_CONFIDENCE',
  'CONFLICTING_SIGNALS',
  'CONFIRMATION_PENDING',
]);

export const RECOMMENDED_FOLLOW_UPS = Object.freeze([
  'NONE',
  'REQUEST_MISSING_INFORMATION',
  'RESOLVE_CONFLICTS',
  'REVIEW_RISK',
  'REQUEST_CONFIRMATION',
  'INCREASE_EVIDENCE',
]);

function isRecord(value) {
  return Boolean(value && !Array.isArray(value) && typeof value === 'object');
}

function hasItems(value) {
  return Array.isArray(value) && value.length > 0;
}

export function collectMissingInformation(decisionPlan, hasDecision) {
  if (!hasDecision) return [...MISSING_INFORMATION_CODES];
  const missing = [];
  if (!isRecord(decisionPlan.selectedContext)
    || Object.keys(decisionPlan.selectedContext).length === 0) missing.push('CONTEXT');
  if (!hasItems(decisionPlan.selectedMemory)) missing.push('MEMORY');
  if (!isRecord(decisionPlan.selectedReasoning)
    || Object.keys(decisionPlan.selectedReasoning).length === 0) missing.push('REASONING');
  if (!decisionPlan.plannerReference?.version) missing.push('PLANNER_REFERENCE');
  if (!hasItems(decisionPlan.recommendedCapabilities)) missing.push('CAPABILITIES');
  return missing;
}

export function collectConflictingSignals(decisionPlan, hasDecision) {
  if (!hasDecision) return [];
  const conflicts = [];
  if (decisionPlan.decisionConfidence >= 0.8 && decisionPlan.riskAssessment?.blocking === true) {
    conflicts.push('HIGH_CONFIDENCE_BLOCKING_RISK');
  }
  if (['MEDIUM', 'HIGH'].includes(decisionPlan.ambiguityAssessment?.level)
    && decisionPlan.decisionType !== 'CLARIFICATION_REQUEST') {
    conflicts.push('AMBIGUITY_NOT_CLARIFIED');
  }
  if (decisionPlan.executionIntent !== 'NONE' && decisionPlan.confirmationRequired !== true) {
    conflicts.push('UNCONFIRMED_EXECUTION_INTENT');
  }
  if (decisionPlan.decisionType === 'FINANCIAL_ACTION_CONFIRMATION'
    && decisionPlan.confirmationRequired !== true) {
    conflicts.push('FINANCIAL_ACTION_WITHOUT_CONFIRMATION');
  }
  return [...new Set(conflicts)];
}

export function collectConfidenceReasons(decisionPlan, hasDecision) {
  if (!hasDecision) return [];
  const reasons = ['DECISION_CONFIDENCE_AVAILABLE'];
  if (Object.keys(decisionPlan.selectedContext ?? {}).length > 0) reasons.push('CONTEXT_AVAILABLE');
  if (hasItems(decisionPlan.selectedMemory)) reasons.push('MEMORY_AVAILABLE');
  if (Object.keys(decisionPlan.selectedReasoning ?? {}).length > 0) reasons.push('REASONING_AVAILABLE');
  if (hasItems(decisionPlan.selectedInsights)) reasons.push('INSIGHTS_AVAILABLE');
  if (hasItems(decisionPlan.selectedGoals)) reasons.push('GOALS_AVAILABLE');
  if (decisionPlan.riskAssessment?.level === 'LOW') reasons.push('LOW_RISK');
  if (decisionPlan.ambiguityAssessment?.level === 'NONE') reasons.push('NO_AMBIGUITY');
  if (decisionPlan.confirmationRequired === true) reasons.push('CONFIRMATION_PROTECTED');
  return reasons;
}

export function collectUncertaintySources({
  decisionPlan,
  missingInformation,
  conflictingSignals,
  hasDecision,
}) {
  const sources = missingInformation.map((code) => `MISSING_${code}`);
  if (hasDecision && decisionPlan.ambiguityAssessment?.level !== 'NONE') sources.push('AMBIGUITY');
  if (hasDecision && ['MEDIUM', 'HIGH', 'CRITICAL'].includes(
    decisionPlan.riskAssessment?.level,
  )) sources.push('ELEVATED_RISK');
  if (!hasDecision || decisionPlan.decisionConfidence < 0.6) sources.push('LOW_BASE_CONFIDENCE');
  if (conflictingSignals.length > 0) sources.push('CONFLICTING_SIGNALS');
  if (hasDecision && decisionPlan.confirmationRequired === true) sources.push('CONFIRMATION_PENDING');
  return [...new Set(sources)].filter((code) => UNCERTAINTY_SOURCE_CODES.includes(code));
}

export function selectRecommendedFollowUp({
  missingInformation,
  conflictingSignals,
  riskLevel,
  requiresConfirmation,
  confidenceScore,
}) {
  const criticalMissing = missingInformation.filter((code) => code !== 'MEMORY');
  if (criticalMissing.length > 0) return 'REQUEST_MISSING_INFORMATION';
  if (conflictingSignals.length > 0) return 'RESOLVE_CONFLICTS';
  if (['HIGH', 'CRITICAL'].includes(riskLevel)) return 'REVIEW_RISK';
  if (requiresConfirmation) return 'REQUEST_CONFIRMATION';
  if (confidenceScore < 0.6) return 'INCREASE_EVIDENCE';
  return 'NONE';
}
