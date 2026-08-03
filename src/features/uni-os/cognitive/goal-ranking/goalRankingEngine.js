import { UNI_OS_ENABLED } from '../../adapters/featureFlags.js';
import { rankGoals } from './goalRankingPolicy.js';
import { createGoalRankingSnapshot } from './goalRankingSchema.js';

function extractGoalSnapshotGoals(goalSnapshot = {}) {
  return Array.isArray(goalSnapshot?.goals) ? goalSnapshot.goals : [];
}

export function processGoalRanking(input = {}, options = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const goals = extractGoalSnapshotGoals(source.goalSnapshot);
  const rankedGoals = rankGoals(goals, {
    parsedIntent: source.parsedIntent,
    contextSnapshot: source.contextSnapshot,
    memorySnapshot: source.memorySnapshot,
  }, { now: options.now });

  return createGoalRankingSnapshot({
    rankedGoals,
    primaryGoal: rankedGoals[0] ?? null,
  });
}

export function logGoalRankingSummary(logger, snapshot) {
  logger.info?.('[UNI OS] Goal Ranking', {
    rankedGoalCount: snapshot.rankedGoals.length,
    primaryRelevance: snapshot.primaryGoal?.relevance ?? null,
    executionAllowed: snapshot.metadata.executionAllowed,
  });
}

export async function runGoalRankingShadow(input = {}, options = {}) {
  const enabled = options.enabled ?? UNI_OS_ENABLED;
  if (!enabled) return Object.freeze({ status: 'DISABLED', ranking: null });

  try {
    const snapshot = processGoalRanking(input, options.engineOptions);
    if (typeof options.observer === 'function') await options.observer(snapshot);
    if (options.isDevelopment === true) {
      logGoalRankingSummary(options.logger ?? console, snapshot);
    }
    return Object.freeze({ status: 'OBSERVED', ranking: null });
  } catch {
    if (options.isDevelopment === true) {
      (options.logger ?? console).warn?.('[UNI OS] Goal Ranking shadow validation failed safely.');
    }
    return Object.freeze({ status: 'FAILED_SAFE', ranking: null });
  }
}

export const goalRankingEngine = Object.freeze({ process: processGoalRanking });
