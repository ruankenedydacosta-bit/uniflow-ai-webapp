import { UNI_OS_ENABLED } from '../../adapters/featureFlags.js';
import { buildCognitiveExecutionDraft } from './executionPlanner.js';
import { createCognitiveExecutionPlanSnapshot } from './executionSchema.js';
import { validateCognitiveExecutionPlan } from './executionValidator.js';

export class CognitiveExecutionPlanValidationError extends Error {
  constructor(errors) {
    super('Cognitive execution plan validation failed.');
    this.name = 'CognitiveExecutionPlanValidationError';
    this.errors = Object.freeze([...errors]);
  }
}

export function createCognitiveExecutionPlan(input = {}, options = {}) {
  const draft = buildCognitiveExecutionDraft(input, { now: options.now });
  const cognitiveExecutionPlan = createCognitiveExecutionPlanSnapshot(draft);
  const validation = validateCognitiveExecutionPlan(cognitiveExecutionPlan);
  if (!validation.valid) throw new CognitiveExecutionPlanValidationError(validation.errors);
  return cognitiveExecutionPlan;
}

export function logCognitiveExecutionPlanSummary(logger, plan) {
  logger.info?.('[UNI OS] Cognitive Execution Plan', {
    strategy: plan.effectiveStrategy,
    risk: plan.effectiveRisk,
    confidence: plan.effectiveConfidence,
    depth: plan.effectiveReasoningDepth,
    conflicts: plan.metadata.conflicts.length,
    executionAllowed: plan.executionAllowed,
  });
}

export async function runCognitiveExecutionPlanShadow(input = {}, options = {}) {
  const enabled = options.enabled ?? UNI_OS_ENABLED;
  if (!enabled) {
    return Object.freeze({ status: 'DISABLED', cognitiveExecutionPlan: null });
  }
  try {
    const plan = createCognitiveExecutionPlan(input, options.plannerOptions);
    if (typeof options.observer === 'function') await options.observer(plan);
    if (options.isDevelopment === true) {
      logCognitiveExecutionPlanSummary(options.logger ?? console, plan);
    }
    return Object.freeze({ status: 'OBSERVED', cognitiveExecutionPlan: null });
  } catch {
    if (options.isDevelopment === true) {
      (options.logger ?? console).warn?.('[UNI OS] Cognitive Execution Plan failed safely.');
    }
    return Object.freeze({ status: 'FAILED_SAFE', cognitiveExecutionPlan: null });
  }
}

export const cognitiveExecutionPlanner = Object.freeze({ create: createCognitiveExecutionPlan });
