import { CAPABILITY_IDS } from '../../llm/capability-registry/capabilitySchema.js';
import { EXECUTION_CONFLICT_CODES, REQUIRED_PLAN_NAMES } from './executionAggregator.js';
import {
  CEP_COMMUNICATION_OBJECTIVES,
  EFFECTIVE_REASONING_DEPTHS,
  EFFECTIVE_RISK_LEVELS,
  EFFECTIVE_STRATEGIES,
  FOLLOW_UP_STRATEGIES,
} from './executionPolicies.js';
import {
  COGNITIVE_EXECUTION_PLAN_VERSION,
  deepFreeze,
} from './executionSchema.js';

function checkEnum(errors, field, value, allowed) {
  if (!allowed.includes(value)) errors.push(`INVALID_${field.toUpperCase()}`);
}

function checkList(errors, field, value, allowed) {
  if (!Array.isArray(value)) {
    errors.push(`INVALID_${field.toUpperCase()}`);
    return;
  }
  if (new Set(value).size !== value.length) errors.push(`DUPLICATE_${field.toUpperCase()}`);
  if (value.some((item) => !allowed.includes(item))) errors.push(`UNKNOWN_${field.toUpperCase()}`);
}

export function validateCognitiveExecutionPlan(plan) {
  const errors = [];
  if (!plan || Array.isArray(plan) || typeof plan !== 'object') {
    return deepFreeze({ valid: false, errors: ['INVALID_COGNITIVE_EXECUTION_PLAN'] });
  }
  ['reasoningPlan', 'decisionPlan', 'confidencePlan'].forEach((field) => {
    if (!plan[field] || Array.isArray(plan[field]) || typeof plan[field] !== 'object') {
      errors.push(`INVALID_${field.toUpperCase()}`);
    }
  });
  checkEnum(errors, 'effective_strategy', plan.effectiveStrategy, EFFECTIVE_STRATEGIES);
  checkEnum(errors, 'effective_risk', plan.effectiveRisk, EFFECTIVE_RISK_LEVELS);
  checkEnum(
    errors, 'effective_reasoning_depth', plan.effectiveReasoningDepth, EFFECTIVE_REASONING_DEPTHS,
  );
  checkEnum(
    errors, 'communication_objective', plan.communicationObjective, CEP_COMMUNICATION_OBJECTIVES,
  );
  checkEnum(errors, 'follow_up_strategy', plan.followUpStrategy, FOLLOW_UP_STRATEGIES);
  checkList(errors, 'effective_capabilities', plan.effectiveCapabilities, CAPABILITY_IDS);
  checkList(errors, 'missing_plans', plan.metadata?.missingPlans, REQUIRED_PLAN_NAMES);
  checkList(errors, 'conflicts', plan.metadata?.conflicts, EXECUTION_CONFLICT_CODES);
  if (!Number.isFinite(plan.effectiveConfidence)
    || plan.effectiveConfidence < 0 || plan.effectiveConfidence > 1) {
    errors.push('INVALID_EFFECTIVE_CONFIDENCE');
  }
  if (plan.plannerVersion !== COGNITIVE_EXECUTION_PLAN_VERSION) {
    errors.push('INVALID_PLANNER_VERSION');
  }
  if (Number.isNaN(new Date(plan.generatedAt).getTime())) errors.push('INVALID_GENERATED_AT');
  if (plan.executionAllowed !== false) errors.push('EXECUTION_NOT_ALLOWED');
  if (!Object.isFrozen(plan)) errors.push('MUTABLE_COGNITIVE_EXECUTION_PLAN');
  return deepFreeze({ valid: errors.length === 0, errors });
}
