import { UNI_OS_ENABLED } from '../featureFlags.js';
import { buildPlanningSteps, resolvePlanningConfirmation } from './planningPlanner.js';
import { createPlanningPlan } from './planningSchema.js';

function defaultIdFactory() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `uni-plan-${Date.now().toString(36)}`;
}

export function adaptPlanningInput(input = {}, options = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const parsedIntent = source.parsedIntent && typeof source.parsedIntent === 'object'
    ? source.parsedIntent
    : {};
  const now = typeof options.now === 'function' ? options.now : () => new Date().toISOString();
  const idFactory = typeof options.idFactory === 'function' ? options.idFactory : defaultIdFactory;

  return createPlanningPlan({
    planId: idFactory(),
    timestamp: now(),
    intent: parsedIntent.intent,
    confidence: parsedIntent.confidence,
    requiresConfirmation: resolvePlanningConfirmation(parsedIntent),
    steps: buildPlanningSteps({
      parsedIntent,
      contextSnapshot: source.contextSnapshot,
      memorySnapshot: source.memorySnapshot,
    }),
  });
}

export function logPlanningSummary(logger, plan) {
  logger.info?.('[UNI OS] Planning', {
    intent: plan.intent,
    steps: plan.steps.map((item) => item.type),
    confirmation: plan.requiresConfirmation,
    executionAllowed: plan.executionAllowed,
  });
}

export async function runPlanningAdapterShadow(input, options = {}) {
  const enabled = options.enabled ?? UNI_OS_ENABLED;
  if (!enabled) return Object.freeze({ status: 'DISABLED', plan: null });

  try {
    const plan = adaptPlanningInput(input, options.adapterOptions);
    if (typeof options.observer === 'function') await options.observer(plan);
    if (options.isDevelopment === true) {
      logPlanningSummary(options.logger ?? console, plan);
    }
    return Object.freeze({ status: 'OBSERVED', plan: null });
  } catch {
    if (options.isDevelopment === true) {
      (options.logger ?? console).warn?.('[UNI OS] Planning shadow validation failed safely.');
    }
    return Object.freeze({ status: 'FAILED_SAFE', plan: null });
  }
}
