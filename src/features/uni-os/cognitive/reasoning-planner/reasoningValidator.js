import { CAPABILITY_IDS } from '../../llm/capability-registry/capabilitySchema.js';
import { REASONING_DEPTHS } from './reasoningDepth.js';
import {
  AMBIGUITY_LEVELS,
  ANALYSIS_MODES,
  CONVERSATION_MODES,
  DECISION_STRATEGIES,
  PRIORITY_FOCUS,
  RESPONSE_STRATEGIES,
  RISK_LEVELS,
} from './reasoningStrategies.js';
import {
  REASONING_PLANNER_VERSION,
  REASONING_SECTION_NAMES,
  deepFreeze,
} from './reasoningSchema.js';

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

export function validateReasoningPlan(plan) {
  const errors = [];
  if (!plan || Array.isArray(plan) || typeof plan !== 'object') {
    return deepFreeze({ valid: false, errors: ['INVALID_REASONING_PLAN'] });
  }
  if (typeof plan.intent !== 'string' || !plan.intent) errors.push('INVALID_INTENT');
  checkEnum(errors, 'reasoning_depth', plan.reasoningDepth, REASONING_DEPTHS);
  checkEnum(errors, 'analysis_mode', plan.analysisMode, ANALYSIS_MODES);
  checkEnum(errors, 'decision_strategy', plan.decisionStrategy, DECISION_STRATEGIES);
  checkEnum(errors, 'response_strategy', plan.responseStrategy, RESPONSE_STRATEGIES);
  checkEnum(errors, 'conversation_mode', plan.conversationMode, CONVERSATION_MODES);
  checkEnum(errors, 'priority_focus', plan.priorityFocus, PRIORITY_FOCUS);
  checkEnum(errors, 'risk_level', plan.riskLevel, RISK_LEVELS);
  checkEnum(errors, 'ambiguity_level', plan.ambiguityLevel, AMBIGUITY_LEVELS);
  checkList(errors, 'required_capabilities', plan.requiredCapabilities, CAPABILITY_IDS);
  checkList(errors, 'required_context_sections', plan.requiredContextSections, REASONING_SECTION_NAMES.context);
  checkList(errors, 'required_memory_sections', plan.requiredMemorySections, REASONING_SECTION_NAMES.memory);
  checkList(errors, 'required_insight_sections', plan.requiredInsightSections, REASONING_SECTION_NAMES.insights);
  checkList(errors, 'required_goal_sections', plan.requiredGoalSections, REASONING_SECTION_NAMES.goals);
  if (!Number.isFinite(plan.confidenceTarget) || plan.confidenceTarget < 0 || plan.confidenceTarget > 1) {
    errors.push('INVALID_CONFIDENCE_TARGET');
  }
  if (typeof plan.followUpRequired !== 'boolean') errors.push('INVALID_FOLLOW_UP_REQUIRED');
  if (plan.executionAllowed !== false) errors.push('EXECUTION_NOT_ALLOWED');
  if (plan.plannerVersion !== REASONING_PLANNER_VERSION) errors.push('INVALID_PLANNER_VERSION');
  if (Number.isNaN(new Date(plan.generatedAt).getTime())) errors.push('INVALID_GENERATED_AT');
  if (!Object.isFrozen(plan)) errors.push('MUTABLE_REASONING_PLAN');
  return deepFreeze({ valid: errors.length === 0, errors });
}
