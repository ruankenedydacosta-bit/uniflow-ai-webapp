import { UNI_OS_ENABLED } from '../../adapters/featureFlags.js';
import { extractGoals, normalizeGoal } from './goalNormalizer.js';
import { prioritizeGoals } from './goalPrioritizer.js';
import { createGoalEngineSnapshot } from './goalSchema.js';

export function processGoals(input = {}, options = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const sourceGoals = extractGoals(source.memorySnapshot);
  const activeGoals = sourceGoals
    .map(normalizeGoal)
    .filter((goal) => goal.status === 'ACTIVE');
  const goals = prioritizeGoals(activeGoals, { now: options.now });

  return createGoalEngineSnapshot({
    goals,
    primaryGoal: goals[0] ?? null,
    metadata: {
      sourceGoalCount: sourceGoals.length,
      sorted: true,
    },
  });
}

export function logGoalEngineSummary(logger, snapshot) {
  logger.info?.('[UNI OS] Goal Engine', {
    goalCount: snapshot.goals.length,
    primaryPriority: snapshot.primaryGoal?.priority ?? null,
    executionAllowed: snapshot.metadata.executionAllowed,
  });
}

export async function runGoalEngineShadow(input = {}, options = {}) {
  const enabled = options.enabled ?? UNI_OS_ENABLED;
  if (!enabled) return Object.freeze({ status: 'DISABLED', goals: null });

  try {
    const snapshot = processGoals(input, options.engineOptions);
    if (typeof options.observer === 'function') await options.observer(snapshot);
    if (options.isDevelopment === true) {
      logGoalEngineSummary(options.logger ?? console, snapshot);
    }
    return Object.freeze({ status: 'OBSERVED', goals: null });
  } catch {
    if (options.isDevelopment === true) {
      (options.logger ?? console).warn?.('[UNI OS] Goal Engine shadow validation failed safely.');
    }
    return Object.freeze({ status: 'FAILED_SAFE', goals: null });
  }
}

export const goalEngine = Object.freeze({ process: processGoals });
