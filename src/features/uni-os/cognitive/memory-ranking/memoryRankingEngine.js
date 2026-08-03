import { UNI_OS_ENABLED } from '../../adapters/featureFlags.js';
import {
  isMemoryEligible,
  normalizeMemoryForRanking,
  rankMemories,
} from './memoryRankingPolicy.js';
import { createMemoryRankingSnapshot } from './memoryRankingSchema.js';

function uniqueById(memories) {
  const ids = new Set();
  return memories.filter((memory) => {
    if (!memory?.id || ids.has(memory.id)) return false;
    ids.add(memory.id);
    return true;
  });
}

export function extractMemoryCandidates(memorySnapshot = {}) {
  const source = memorySnapshot && typeof memorySnapshot === 'object' ? memorySnapshot : {};
  const direct = Array.isArray(source.memories)
    ? source.memories
    : Array.isArray(source.items) ? source.items : null;
  if (direct) {
    return uniqueById(direct.map((memory) => normalizeMemoryForRanking(memory)));
  }

  const projectionItems = [
    ...(Array.isArray(source.explicit?.items) ? source.explicit.items : []),
    ...(Array.isArray(source.conversation?.items) ? source.conversation.items : []),
  ];
  const trustedProjection = typeof source.metadata?.version === 'string';
  return uniqueById(projectionItems.map((memory) => (
    normalizeMemoryForRanking(memory, { trustedProjection })
  )));
}

export function processMemoryRanking(input = {}, options = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const candidates = extractMemoryCandidates(source.memorySnapshot);
  const eligible = candidates.filter((memory) => (
    isMemoryEligible(memory, source.contextSnapshot, { now: options.now })
  ));
  const rankedMemories = rankMemories(eligible, {
    parsedIntent: source.parsedIntent,
    contextSnapshot: source.contextSnapshot,
    goalSnapshot: source.goalSnapshot,
    goalRankingSnapshot: source.goalRankingSnapshot,
  }, { now: options.now });

  return createMemoryRankingSnapshot({
    rankedMemories,
    primaryMemory: rankedMemories[0] ?? null,
    metadata: {
      sourceMemoryCount: candidates.length,
      eligibleMemoryCount: eligible.length,
    },
  });
}

export function logMemoryRankingSummary(logger, snapshot) {
  logger.info?.('[UNI OS] Memory Ranking', {
    rankedMemoryCount: snapshot.rankedMemories.length,
    primaryRelevance: snapshot.primaryMemory?.relevance ?? null,
    executionAllowed: snapshot.metadata.executionAllowed,
  });
}

export async function runMemoryRankingShadow(input = {}, options = {}) {
  const enabled = options.enabled ?? UNI_OS_ENABLED;
  if (!enabled) return Object.freeze({ status: 'DISABLED', ranking: null });

  try {
    const snapshot = processMemoryRanking(input, options.engineOptions);
    if (typeof options.observer === 'function') await options.observer(snapshot);
    if (options.isDevelopment === true) {
      logMemoryRankingSummary(options.logger ?? console, snapshot);
    }
    return Object.freeze({ status: 'OBSERVED', ranking: null });
  } catch {
    if (options.isDevelopment === true) {
      (options.logger ?? console).warn?.('[UNI OS] Memory Ranking failed safely.');
    }
    return Object.freeze({ status: 'FAILED_SAFE', ranking: null });
  }
}

export const memoryRankingEngine = Object.freeze({ process: processMemoryRanking });
