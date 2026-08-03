import { UNI_OS_ENABLED } from '../../adapters/featureFlags.js';
import { buildReasoningPlanDraft } from './reasoningEngine.js';
import { createReasoningPlanSnapshot } from './reasoningSchema.js';
import { validateReasoningPlan } from './reasoningValidator.js';

export class ReasoningPlannerValidationError extends Error {
  constructor(errors) {
    super('Reasoning plan validation failed.');
    this.name = 'ReasoningPlannerValidationError';
    this.errors = Object.freeze([...errors]);
  }
}

export function planReasoning(compiledContext = {}, options = {}) {
  const draft = buildReasoningPlanDraft(compiledContext, { now: options.now });
  const reasoningPlan = createReasoningPlanSnapshot(draft);
  const validation = validateReasoningPlan(reasoningPlan);
  if (!validation.valid) throw new ReasoningPlannerValidationError(validation.errors);
  return reasoningPlan;
}

export function logReasoningPlanSummary(logger, reasoningPlan) {
  logger.info?.('[UNI OS] Reasoning Planner', {
    reasoningDepth: reasoningPlan.reasoningDepth,
    analysisMode: reasoningPlan.analysisMode,
    riskLevel: reasoningPlan.riskLevel,
    ambiguityLevel: reasoningPlan.ambiguityLevel,
    capabilitiesCount: reasoningPlan.requiredCapabilities.length,
    executionAllowed: reasoningPlan.executionAllowed,
  });
}

export async function runReasoningPlannerShadow(compiledContext = {}, options = {}) {
  const enabled = options.enabled ?? UNI_OS_ENABLED;
  if (!enabled) return Object.freeze({ status: 'DISABLED', reasoningPlan: null });

  try {
    const reasoningPlan = planReasoning(compiledContext, options.plannerOptions);
    if (typeof options.observer === 'function') await options.observer(reasoningPlan);
    if (options.isDevelopment === true) {
      logReasoningPlanSummary(options.logger ?? console, reasoningPlan);
    }
    return Object.freeze({ status: 'OBSERVED', reasoningPlan: null });
  } catch {
    if (options.isDevelopment === true) {
      (options.logger ?? console).warn?.('[UNI OS] Reasoning Planner failed safely.');
    }
    return Object.freeze({ status: 'FAILED_SAFE', reasoningPlan: null });
  }
}

export const reasoningPlanner = Object.freeze({ plan: planReasoning });
