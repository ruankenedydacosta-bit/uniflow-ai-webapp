export const EFFECTIVE_STRATEGIES = Object.freeze([
  'SAFE_FALLBACK',
  'REQUEST_CLARIFICATION',
  'RESOLVE_CONFLICTS',
  'DEFER_FOR_RISK_REVIEW',
  'REQUIRE_CONFIRMATION',
  'RECOMMEND_ONLY',
  'GUIDE_ONLY',
]);

export const EFFECTIVE_RISK_LEVELS = Object.freeze(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export const EFFECTIVE_REASONING_DEPTHS = Object.freeze(['LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH']);
export const CEP_COMMUNICATION_OBJECTIVES = Object.freeze([
  'INFORM', 'CONFIRM', 'EXPLAIN', 'GUIDE', 'ACKNOWLEDGE', 'REASSURE', 'CLARIFY',
]);
export const FOLLOW_UP_STRATEGIES = Object.freeze([
  'NONE',
  'REQUEST_MISSING_PLANS',
  'REQUEST_MISSING_INFORMATION',
  'RESOLVE_CONFLICTS',
  'REVIEW_RISK',
  'REQUEST_CONFIRMATION',
  'INCREASE_EVIDENCE',
]);

const RISK_WEIGHT = Object.freeze({ LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 });
const DEPTH_WEIGHT = Object.freeze({ LOW: 0, MEDIUM: 1, HIGH: 2, VERY_HIGH: 3 });

export function resolveEffectiveCapabilities(reasoningPlan = {}, decisionPlan = {}) {
  const reasoning = Array.isArray(reasoningPlan.requiredCapabilities)
    ? reasoningPlan.requiredCapabilities : [];
  const decision = new Set(
    Array.isArray(decisionPlan.recommendedCapabilities)
      ? decisionPlan.recommendedCapabilities : [],
  );
  return [...new Set(reasoning.filter((capability) => decision.has(capability)))];
}

export function resolveEffectiveRisk(reasoningPlan = {}, decisionPlan = {}, conflicts = []) {
  const candidates = [reasoningPlan.riskLevel, decisionPlan.riskAssessment?.level]
    .filter((level) => EFFECTIVE_RISK_LEVELS.includes(level));
  let effective = candidates.sort((a, b) => RISK_WEIGHT[b] - RISK_WEIGHT[a])[0] ?? 'HIGH';
  if (conflicts.length > 0 && RISK_WEIGHT[effective] < RISK_WEIGHT.HIGH) effective = 'HIGH';
  return effective;
}

export function resolveEffectiveConfidence(reasoningPlan = {}, decisionPlan = {}, confidencePlan = {}) {
  const values = [
    reasoningPlan.confidenceTarget,
    decisionPlan.decisionConfidence,
    confidencePlan.confidenceScore,
  ].filter((value) => Number.isFinite(value) && value >= 0 && value <= 1);
  if (values.length !== 3) return 0;
  return Math.round(Math.min(...values) * 100) / 100;
}

export function resolveEffectiveReasoningDepth(reasoningDepth, effectiveRisk) {
  const source = EFFECTIVE_REASONING_DEPTHS.includes(reasoningDepth) ? reasoningDepth : 'LOW';
  const minimum = effectiveRisk === 'CRITICAL' ? 'VERY_HIGH'
    : effectiveRisk === 'HIGH' ? 'HIGH' : source;
  return DEPTH_WEIGHT[minimum] > DEPTH_WEIGHT[source] ? minimum : source;
}

export function resolveEffectiveStrategy({
  missingPlans = [],
  conflicts = [],
  effectiveRisk = 'HIGH',
  decisionPlan = {},
  confidencePlan = {},
} = {}) {
  if (missingPlans.length === 3) return 'SAFE_FALLBACK';
  if (missingPlans.length > 0) return 'REQUEST_CLARIFICATION';
  if (conflicts.length > 0) return 'RESOLVE_CONFLICTS';
  if (['HIGH', 'CRITICAL'].includes(effectiveRisk)) return 'DEFER_FOR_RISK_REVIEW';
  if (confidencePlan.requiresConfirmation === true
    || decisionPlan.confirmationRequired === true) return 'REQUIRE_CONFIRMATION';
  if (confidencePlan.safeToRecommend === true) return 'RECOMMEND_ONLY';
  return 'GUIDE_ONLY';
}

export function resolveCommunicationObjective({
  effectiveStrategy,
  decisionPlan = {},
} = {}) {
  if (['SAFE_FALLBACK', 'REQUEST_CLARIFICATION', 'RESOLVE_CONFLICTS'].includes(
    effectiveStrategy,
  )) return 'CLARIFY';
  if (effectiveStrategy === 'DEFER_FOR_RISK_REVIEW') return 'REASSURE';
  if (effectiveStrategy === 'REQUIRE_CONFIRMATION') return 'CONFIRM';
  return CEP_COMMUNICATION_OBJECTIVES.includes(decisionPlan.communicationObjective)
    ? decisionPlan.communicationObjective : 'INFORM';
}

export function resolveFollowUpStrategy({
  effectiveStrategy,
  confidencePlan = {},
} = {}) {
  if (effectiveStrategy === 'SAFE_FALLBACK') return 'REQUEST_MISSING_PLANS';
  if (effectiveStrategy === 'REQUEST_CLARIFICATION') return 'REQUEST_MISSING_INFORMATION';
  if (effectiveStrategy === 'RESOLVE_CONFLICTS') return 'RESOLVE_CONFLICTS';
  if (effectiveStrategy === 'DEFER_FOR_RISK_REVIEW') return 'REVIEW_RISK';
  if (effectiveStrategy === 'REQUIRE_CONFIRMATION') return 'REQUEST_CONFIRMATION';
  return FOLLOW_UP_STRATEGIES.includes(confidencePlan.recommendedFollowUp)
    ? confidencePlan.recommendedFollowUp : 'NONE';
}
