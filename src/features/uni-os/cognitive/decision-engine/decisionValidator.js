import { CAPABILITY_IDS } from '../../llm/capability-registry/capabilitySchema.js';
import {
  COMMUNICATION_OBJECTIVES,
  DECISION_TYPES,
  EXECUTION_INTENTS,
  EXPLANATION_LEVELS,
  FALLBACK_STRATEGIES,
  PRIMARY_DECISIONS,
} from './decisionPolicies.js';
import {
  DECISION_AMBIGUITY_LEVELS,
  DECISION_ENGINE_VERSION,
  DECISION_RISK_LEVELS,
  deepFreeze,
} from './decisionSchema.js';
import { DECISION_STRATEGIES } from './decisionStrategies.js';

function checkEnum(errors, field, value, allowed) {
  if (!allowed.includes(value)) errors.push(`INVALID_${field.toUpperCase()}`);
}

function checkCollection(errors, field, value) {
  if (!Array.isArray(value)) errors.push(`INVALID_${field.toUpperCase()}`);
}

export function validateDecisionPlan(plan) {
  const errors = [];
  if (!plan || Array.isArray(plan) || typeof plan !== 'object') {
    return deepFreeze({ valid: false, errors: ['INVALID_DECISION_PLAN'] });
  }
  checkEnum(errors, 'primary_decision', plan.primaryDecision, PRIMARY_DECISIONS);
  checkEnum(errors, 'decision_type', plan.decisionType, DECISION_TYPES);
  checkEnum(errors, 'selected_strategy', plan.selectedStrategy, DECISION_STRATEGIES);
  checkEnum(errors, 'execution_intent', plan.executionIntent, EXECUTION_INTENTS);
  checkEnum(errors, 'fallback_strategy', plan.fallbackStrategy, FALLBACK_STRATEGIES);
  checkEnum(errors, 'explanation_level', plan.explanationLevel, EXPLANATION_LEVELS);
  checkEnum(
    errors, 'communication_objective', plan.communicationObjective, COMMUNICATION_OBJECTIVES,
  );
  checkEnum(errors, 'risk_level', plan.riskAssessment?.level, DECISION_RISK_LEVELS);
  checkEnum(
    errors, 'ambiguity_level', plan.ambiguityAssessment?.level, DECISION_AMBIGUITY_LEVELS,
  );
  ['selectedInsights', 'selectedGoals', 'selectedMemory', 'recommendedCapabilities']
    .forEach((field) => checkCollection(errors, field, plan[field]));
  if (plan.recommendedCapabilities?.some((item) => !CAPABILITY_IDS.includes(item))) {
    errors.push('UNKNOWN_RECOMMENDED_CAPABILITY');
  }
  if (!Number.isFinite(plan.decisionConfidence)
    || plan.decisionConfidence < 0 || plan.decisionConfidence > 1) {
    errors.push('INVALID_DECISION_CONFIDENCE');
  }
  if (typeof plan.confirmationRequired !== 'boolean') errors.push('INVALID_CONFIRMATION');
  if (plan.executionAllowed !== false) errors.push('EXECUTION_NOT_ALLOWED');
  if (plan.engineVersion !== DECISION_ENGINE_VERSION) errors.push('INVALID_ENGINE_VERSION');
  if (Number.isNaN(new Date(plan.generatedAt).getTime())) errors.push('INVALID_GENERATED_AT');
  if (!Object.isFrozen(plan)) errors.push('MUTABLE_DECISION_PLAN');
  return deepFreeze({ valid: errors.length === 0, errors });
}
