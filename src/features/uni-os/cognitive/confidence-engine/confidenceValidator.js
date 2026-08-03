import { CONFIDENCE_LEVELS } from './confidenceLevels.js';
import {
  CONFIDENCE_REASONS,
  CONFLICTING_SIGNAL_CODES,
  MISSING_INFORMATION_CODES,
  RECOMMENDED_FOLLOW_UPS,
  UNCERTAINTY_SOURCE_CODES,
} from './confidencePolicies.js';
import { CONFIDENCE_ENGINE_VERSION, deepFreeze } from './confidenceSchema.js';

function validateList(errors, field, value, allowed) {
  if (!Array.isArray(value)) {
    errors.push(`INVALID_${field.toUpperCase()}`);
    return;
  }
  if (new Set(value).size !== value.length) errors.push(`DUPLICATE_${field.toUpperCase()}`);
  if (value.some((item) => !allowed.includes(item))) errors.push(`UNKNOWN_${field.toUpperCase()}`);
}

export function validateConfidencePlan(plan) {
  const errors = [];
  if (!plan || Array.isArray(plan) || typeof plan !== 'object') {
    return deepFreeze({ valid: false, errors: ['INVALID_CONFIDENCE_PLAN'] });
  }
  if (!Number.isFinite(plan.confidenceScore)
    || plan.confidenceScore < 0 || plan.confidenceScore > 1) {
    errors.push('INVALID_CONFIDENCE_SCORE');
  }
  if (!CONFIDENCE_LEVELS.includes(plan.confidenceLevel)) errors.push('INVALID_CONFIDENCE_LEVEL');
  validateList(errors, 'confidence_reasons', plan.confidenceReasons, CONFIDENCE_REASONS);
  validateList(
    errors, 'missing_information', plan.missingInformation, MISSING_INFORMATION_CODES,
  );
  validateList(
    errors, 'conflicting_signals', plan.conflictingSignals, CONFLICTING_SIGNAL_CODES,
  );
  validateList(
    errors, 'uncertainty_sources', plan.uncertaintySources, UNCERTAINTY_SOURCE_CODES,
  );
  if (typeof plan.requiresConfirmation !== 'boolean') errors.push('INVALID_CONFIRMATION');
  if (typeof plan.safeToRecommend !== 'boolean') errors.push('INVALID_RECOMMENDATION_SAFETY');
  if (plan.safeToExecute !== false) errors.push('EXECUTION_NOT_SAFE');
  if (!RECOMMENDED_FOLLOW_UPS.includes(plan.recommendedFollowUp)) {
    errors.push('INVALID_RECOMMENDED_FOLLOW_UP');
  }
  if (plan.confidenceVersion !== CONFIDENCE_ENGINE_VERSION) {
    errors.push('INVALID_CONFIDENCE_VERSION');
  }
  if (Number.isNaN(new Date(plan.generatedAt).getTime())) errors.push('INVALID_GENERATED_AT');
  if (plan.executionAllowed !== false) errors.push('EXECUTION_NOT_ALLOWED');
  if (!Object.isFrozen(plan)) errors.push('MUTABLE_CONFIDENCE_PLAN');
  return deepFreeze({ valid: errors.length === 0, errors });
}
