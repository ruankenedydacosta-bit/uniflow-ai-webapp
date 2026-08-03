import { UNI_OS_ENABLED } from '../../adapters/featureFlags.js';
import {
  extractContextCandidates,
  isContextEligible,
  rankContext,
} from './contextRankingPolicy.js';
import { createContextRankingSnapshot } from './contextRankingSchema.js';

export function processContextRanking(input = {}, options = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const candidates = extractContextCandidates(source.contextSnapshot);
  const eligible = candidates.filter((item) => (
    isContextEligible(item, source.contextSnapshot, { now: options.now })
  ));
  const rankedContext = rankContext(eligible, {
    parsedIntent: source.parsedIntent,
    goalSnapshot: source.goalSnapshot,
    goalRankingSnapshot: source.goalRankingSnapshot,
    memoryRankingSnapshot: source.memoryRankingSnapshot,
  }, { now: options.now });

  return createContextRankingSnapshot({
    rankedContext,
    primaryContext: rankedContext[0] ?? null,
    metadata: {
      sourceContextCount: candidates.length,
      eligibleContextCount: eligible.length,
    },
  });
}

export function logContextRankingSummary(logger, snapshot) {
  logger.info?.('[UNI OS] Context Ranking', {
    rankedKeys: snapshot.rankedContext.map((item) => item.key),
    primaryKey: snapshot.primaryContext?.key ?? null,
    executionAllowed: snapshot.metadata.executionAllowed,
  });
}

export async function runContextRankingShadow(input = {}, options = {}) {
  const enabled = options.enabled ?? UNI_OS_ENABLED;
  if (!enabled) return Object.freeze({ status: 'DISABLED', ranking: null });

  try {
    const snapshot = processContextRanking(input, options.engineOptions);
    if (typeof options.observer === 'function') await options.observer(snapshot);
    if (options.isDevelopment === true) {
      logContextRankingSummary(options.logger ?? console, snapshot);
    }
    return Object.freeze({ status: 'OBSERVED', ranking: null });
  } catch {
    if (options.isDevelopment === true) {
      (options.logger ?? console).warn?.('[UNI OS] Context Ranking failed safely.');
    }
    return Object.freeze({ status: 'FAILED_SAFE', ranking: null });
  }
}

export const contextRankingEngine = Object.freeze({ process: processContextRanking });
