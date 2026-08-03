import { UNI_OS_ENABLED } from '../../adapters/featureFlags.js';
import { allocateTokenBudget } from './budgetAllocator.js';
import {
  BUDGET_ESTIMATOR_METADATA,
  estimateConversationWindow,
} from './budgetEstimator.js';
import { resolveBudgetPolicyFromRoutingResult } from './budgetPolicy.js';
import { createTokenBudgetSchema } from './budgetSchema.js';
import { validateTokenBudget } from './budgetValidator.js';

export class TokenBudgetValidationError extends Error {
  constructor(errors) {
    super('Token budget validation failed.');
    this.name = 'TokenBudgetValidationError';
    this.codes = Object.freeze([...errors]);
  }
}

export function buildTokenBudget(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const policy = resolveBudgetPolicyFromRoutingResult(source.routingResult);
  const sectionDemand = estimateConversationWindow(source.conversationWindow);
  const allocation = allocateTokenBudget(sectionDemand, policy);
  const snapshot = createTokenBudgetSchema({
    totalBudget: policy.totalBudget,
    sections: allocation.sections,
    sectionDemand,
    policy: policy.id,
    estimator: BUDGET_ESTIMATOR_METADATA.id,
  });
  const validation = validateTokenBudget(snapshot);
  if (!validation.valid) throw new TokenBudgetValidationError(validation.errors);
  return snapshot;
}

export function logTokenBudgetSummary(logger, snapshot) {
  logger.info?.('[UNI OS] Token Budget Calculated', {
    budgetPolicy: snapshot.tokenBudget.metadata.policy,
    estimatedBudget: snapshot.tokenBudget.statistics.estimatedDemand,
    allocatedBudget: snapshot.tokenBudget.allocatedBudget,
    remainingBudget: snapshot.tokenBudget.remainingBudget,
  });
}

export async function runTokenBudgetShadow(input = {}, options = {}) {
  const enabled = options.enabled ?? UNI_OS_ENABLED;
  if (!enabled) return Object.freeze({ status: 'DISABLED', tokenBudget: null });

  try {
    const snapshot = buildTokenBudget(input);
    if (typeof options.observer === 'function') await options.observer(snapshot);
    if (options.isDevelopment === true) logTokenBudgetSummary(options.logger ?? console, snapshot);
    return Object.freeze({ status: 'OBSERVED', tokenBudget: null });
  } catch {
    if (options.isDevelopment === true) {
      (options.logger ?? console).warn?.('[UNI OS] Token Budget failed safely.');
    }
    return Object.freeze({ status: 'FAILED_SAFE', tokenBudget: null });
  }
}

export const tokenBudgetManager = Object.freeze({ build: buildTokenBudget });
