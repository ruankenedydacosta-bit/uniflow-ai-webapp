import { UNI_OS_ENABLED } from '../../adapters/featureFlags.js';
import { evaluateConfidence } from './confidenceEvaluator.js';
import { createConfidencePlanSnapshot } from './confidenceSchema.js';
import { validateConfidencePlan } from './confidenceValidator.js';

export class ConfidenceEngineValidationError extends Error {
  constructor(errors) {
    super('Confidence plan validation failed.');
    this.name = 'ConfidenceEngineValidationError';
    this.errors = Object.freeze([...errors]);
  }
}

export function createConfidencePlan(input = {}, options = {}) {
  const draft = evaluateConfidence(input, { now: options.now });
  const confidencePlan = createConfidencePlanSnapshot(draft);
  const validation = validateConfidencePlan(confidencePlan);
  if (!validation.valid) throw new ConfidenceEngineValidationError(validation.errors);
  return confidencePlan;
}

export function logConfidenceSummary(logger, confidencePlan) {
  logger.info?.('[UNI OS] Confidence Engine', {
    level: confidencePlan.confidenceLevel,
    score: confidencePlan.confidenceScore,
    conflicts: confidencePlan.conflictingSignals.length,
    uncertainties: confidencePlan.uncertaintySources.length,
    safeToRecommend: confidencePlan.safeToRecommend,
    executionAllowed: confidencePlan.executionAllowed,
  });
}

export async function runConfidenceEngineShadow(input = {}, options = {}) {
  const enabled = options.enabled ?? UNI_OS_ENABLED;
  if (!enabled) return Object.freeze({ status: 'DISABLED', confidencePlan: null });

  try {
    const confidencePlan = createConfidencePlan(input, options.engineOptions);
    if (typeof options.observer === 'function') await options.observer(confidencePlan);
    if (options.isDevelopment === true) {
      logConfidenceSummary(options.logger ?? console, confidencePlan);
    }
    return Object.freeze({ status: 'OBSERVED', confidencePlan: null });
  } catch {
    if (options.isDevelopment === true) {
      (options.logger ?? console).warn?.('[UNI OS] Confidence Engine failed safely.');
    }
    return Object.freeze({ status: 'FAILED_SAFE', confidencePlan: null });
  }
}

export const confidenceEngine = Object.freeze({ evaluate: createConfidencePlan });
