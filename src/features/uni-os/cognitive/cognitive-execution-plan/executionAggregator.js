export const EXECUTION_CONFLICT_CODES = Object.freeze([
  'PLANNER_VERSION_MISMATCH',
  'INTENT_MISMATCH',
  'CONFIDENCE_CONFLICTS_PRESENT',
  'UNSAFE_RECOMMENDATION',
  'CONFIRMATION_MISMATCH',
]);

export const REQUIRED_PLAN_NAMES = Object.freeze([
  'reasoningPlan',
  'decisionPlan',
  'confidencePlan',
]);

function isRecord(value) {
  return Boolean(value && !Array.isArray(value) && typeof value === 'object');
}

function validReasoningPlan(value) {
  return isRecord(value) && typeof value.plannerVersion === 'string'
    && value.executionAllowed === false;
}

function validDecisionPlan(value) {
  return isRecord(value) && typeof value.engineVersion === 'string'
    && value.executionAllowed === false;
}

function validConfidencePlan(value) {
  return isRecord(value) && typeof value.confidenceVersion === 'string'
    && value.executionAllowed === false && value.safeToExecute === false;
}

export function normalizeExecutionPlans(input = {}) {
  const source = isRecord(input) ? input : {};
  return {
    reasoningPlan: validReasoningPlan(source.reasoningPlan) ? source.reasoningPlan : null,
    decisionPlan: validDecisionPlan(source.decisionPlan) ? source.decisionPlan : null,
    confidencePlan: validConfidencePlan(source.confidencePlan) ? source.confidencePlan : null,
  };
}

export function detectExecutionConflicts({ reasoningPlan, decisionPlan, confidencePlan }) {
  if (!reasoningPlan || !decisionPlan || !confidencePlan) return [];
  const conflicts = [];
  if (decisionPlan.plannerReference?.version !== reasoningPlan.plannerVersion) {
    conflicts.push('PLANNER_VERSION_MISMATCH');
  }
  if (decisionPlan.plannerReference?.intent !== reasoningPlan.intent) {
    conflicts.push('INTENT_MISMATCH');
  }
  if (Array.isArray(confidencePlan.conflictingSignals)
    && confidencePlan.conflictingSignals.length > 0) {
    conflicts.push('CONFIDENCE_CONFLICTS_PRESENT');
  }
  if (confidencePlan.safeToRecommend === true
    && decisionPlan.riskAssessment?.blocking === true) {
    conflicts.push('UNSAFE_RECOMMENDATION');
  }
  if (decisionPlan.confirmationRequired === true
    && confidencePlan.requiresConfirmation !== true) {
    conflicts.push('CONFIRMATION_MISMATCH');
  }
  return [...new Set(conflicts)];
}

export function aggregateExecutionPlans(input = {}) {
  const plans = normalizeExecutionPlans(input);
  const missingPlans = REQUIRED_PLAN_NAMES.filter((name) => plans[name] === null);
  return {
    ...plans,
    missingPlans,
    conflicts: detectExecutionConflicts(plans),
  };
}
