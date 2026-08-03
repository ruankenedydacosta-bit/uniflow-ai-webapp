import { resolveConfidenceLevel } from './confidenceLevels.js';
import {
  collectConfidenceReasons,
  collectConflictingSignals,
  collectMissingInformation,
  collectUncertaintySources,
  selectRecommendedFollowUp,
} from './confidencePolicies.js';

function isRecord(value) {
  return Boolean(value && !Array.isArray(value) && typeof value === 'object');
}

function extractDecisionPlan(input) {
  if (!isRecord(input)) return null;
  return isRecord(input.decisionPlan) ? input.decisionPlan : input;
}

function penaltyForMissing(code) {
  return {
    DECISION_PLAN: 1,
    CONTEXT: 0.1,
    MEMORY: 0.05,
    REASONING: 0.1,
    PLANNER_REFERENCE: 0.05,
    CAPABILITIES: 0.05,
  }[code] ?? 0;
}

function calculateConfidenceScore(decisionPlan, hasDecision, missing, conflicts) {
  if (!hasDecision) return 0;
  const base = Number.isFinite(decisionPlan.decisionConfidence)
    ? decisionPlan.decisionConfidence : 0;
  const missingPenalty = missing.reduce((total, code) => total + penaltyForMissing(code), 0);
  const conflictPenalty = conflicts.length * 0.15;
  const ambiguityPenalty = {
    NONE: 0, LOW: 0.03, MEDIUM: 0.1, HIGH: 0.2,
  }[decisionPlan.ambiguityAssessment?.level] ?? 0.2;
  const riskPenalty = {
    LOW: 0, MEDIUM: 0.03, HIGH: 0.1, CRITICAL: 0.2,
  }[decisionPlan.riskAssessment?.level] ?? 0.1;
  const confirmationPenalty = decisionPlan.confirmationRequired === true ? 0.03 : 0;
  const score = base - missingPenalty - conflictPenalty
    - ambiguityPenalty - riskPenalty - confirmationPenalty;
  return Math.round(Math.max(0, Math.min(1, score)) * 100) / 100;
}

export function evaluateConfidence(input = {}, options = {}) {
  const decisionPlan = extractDecisionPlan(input);
  const hasDecision = Boolean(
    decisionPlan?.engineVersion && decisionPlan.executionAllowed === false,
  );
  const missingInformation = collectMissingInformation(decisionPlan ?? {}, hasDecision);
  const conflictingSignals = collectConflictingSignals(decisionPlan ?? {}, hasDecision);
  const confidenceScore = calculateConfidenceScore(
    decisionPlan ?? {}, hasDecision, missingInformation, conflictingSignals,
  );
  const uncertaintySources = collectUncertaintySources({
    decisionPlan: decisionPlan ?? {},
    missingInformation,
    conflictingSignals,
    hasDecision,
  });
  const riskLevel = hasDecision ? decisionPlan.riskAssessment?.level ?? 'HIGH' : 'HIGH';
  const ambiguityLevel = hasDecision
    ? decisionPlan.ambiguityAssessment?.level ?? 'HIGH' : 'HIGH';
  const requiresConfirmation = !hasDecision
    || decisionPlan.confirmationRequired === true
    || confidenceScore < 0.8
    || ['MEDIUM', 'HIGH'].includes(ambiguityLevel)
    || ['HIGH', 'CRITICAL'].includes(riskLevel);
  const safeToRecommend = hasDecision
    && confidenceScore >= 0.6
    && !['HIGH', 'CRITICAL'].includes(riskLevel)
    && ambiguityLevel !== 'HIGH'
    && conflictingSignals.length === 0
    && !missingInformation.includes('CONTEXT')
    && !missingInformation.includes('REASONING');

  return {
    confidenceScore,
    confidenceLevel: resolveConfidenceLevel(confidenceScore),
    confidenceReasons: collectConfidenceReasons(decisionPlan ?? {}, hasDecision),
    missingInformation,
    conflictingSignals,
    uncertaintySources,
    requiresConfirmation,
    safeToRecommend,
    safeToExecute: false,
    recommendedFollowUp: selectRecommendedFollowUp({
      missingInformation,
      conflictingSignals,
      riskLevel,
      requiresConfirmation,
      confidenceScore,
    }),
    generatedAt: options.now,
  };
}

export { calculateConfidenceScore, extractDecisionPlan };
