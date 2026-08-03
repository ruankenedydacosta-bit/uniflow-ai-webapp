import { UNI_OS_ENABLED } from '../../adapters/featureFlags.js';
import { evaluateDecision } from './decisionEvaluator.js';
import { createDecisionPlanSnapshot } from './decisionSchema.js';
import { validateDecisionPlan } from './decisionValidator.js';

export class DecisionEngineValidationError extends Error {
  constructor(errors) {
    super('Decision plan validation failed.');
    this.name = 'DecisionEngineValidationError';
    this.errors = Object.freeze([...errors]);
  }
}

export function createDecisionPlan(input = {}, options = {}) {
  const draft = evaluateDecision(input, { now: options.now });
  const decisionPlan = createDecisionPlanSnapshot(draft);
  const validation = validateDecisionPlan(decisionPlan);
  if (!validation.valid) throw new DecisionEngineValidationError(validation.errors);
  return decisionPlan;
}

export function logDecisionSummary(logger, decisionPlan) {
  logger.info?.('[UNI OS] Decision Engine', {
    decisionType: decisionPlan.decisionType,
    strategy: decisionPlan.selectedStrategy,
    confidence: decisionPlan.decisionConfidence,
    risk: decisionPlan.riskAssessment.level,
    ambiguity: decisionPlan.ambiguityAssessment.level,
    executionAllowed: decisionPlan.executionAllowed,
  });
}

export async function runDecisionEngineShadow(input = {}, options = {}) {
  const enabled = options.enabled ?? UNI_OS_ENABLED;
  if (!enabled) return Object.freeze({ status: 'DISABLED', decisionPlan: null });

  try {
    const decisionPlan = createDecisionPlan(input, options.engineOptions);
    if (typeof options.observer === 'function') await options.observer(decisionPlan);
    if (options.isDevelopment === true) {
      logDecisionSummary(options.logger ?? console, decisionPlan);
    }
    return Object.freeze({ status: 'OBSERVED', decisionPlan: null });
  } catch {
    if (options.isDevelopment === true) {
      (options.logger ?? console).warn?.('[UNI OS] Decision Engine failed safely.');
    }
    return Object.freeze({ status: 'FAILED_SAFE', decisionPlan: null });
  }
}

export const decisionEngine = Object.freeze({ evaluate: createDecisionPlan });
