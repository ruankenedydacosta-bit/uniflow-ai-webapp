export const MEMORY_RANKING_SCHEMA_VERSION = '1.0';

export const MEMORY_RELEVANCE = Object.freeze(['LOW', 'MEDIUM', 'HIGH']);

export const MEMORY_RANKING_REASONS = Object.freeze([
  'INTENT_MATCH',
  'CATEGORY_MATCH',
  'ACTIVE_GOAL_MATCH',
  'CONTEXT_MATCH',
  'RECENT_MEMORY',
  'CONFIDENCE_WEIGHT',
  'EXPLICIT_SOURCE',
  'WORKSPACE_MATCH',
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [key, cloneValue(nested)]),
  );
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function safeRankedMemory(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const confidence = Number.isFinite(source.confidence) ? clamp(source.confidence, 0, 1) : 0;
  return {
    memoryId: typeof source.memoryId === 'string' && source.memoryId.trim()
      ? source.memoryId.trim()
      : null,
    type: typeof source.type === 'string' ? source.type : null,
    relevance: MEMORY_RELEVANCE.includes(source.relevance) ? source.relevance : 'LOW',
    score: Number.isFinite(source.score) ? clamp(Math.round(source.score), 0, 100) : 0,
    confidence,
    reasons: Array.isArray(source.reasons)
      ? [...new Set(source.reasons.filter((reason) => MEMORY_RANKING_REASONS.includes(reason)))]
      : [],
  };
}

export function createMemoryRankingSnapshot({ rankedMemories = [], primaryMemory = null, metadata = {} } = {}) {
  const safeMemories = Array.isArray(rankedMemories)
    ? rankedMemories.map(safeRankedMemory)
    : [];
  const primaryIndex = safeMemories.findIndex((memory) => (
    memory.memoryId === primaryMemory?.memoryId && memory.score === primaryMemory?.score
  ));
  const safePrimaryMemory = primaryIndex >= 0 ? safeMemories[primaryIndex] : null;

  return deepFreeze({
    rankedMemories: safeMemories.map(cloneValue),
    primaryMemory: safePrimaryMemory ? cloneValue(safePrimaryMemory) : null,
    metadata: {
      version: MEMORY_RANKING_SCHEMA_VERSION,
      sourceMemoryCount: Number.isInteger(metadata.sourceMemoryCount)
        ? metadata.sourceMemoryCount
        : 0,
      eligibleMemoryCount: Number.isInteger(metadata.eligibleMemoryCount)
        ? metadata.eligibleMemoryCount
        : 0,
      rankedMemoryCount: safeMemories.length,
      deterministic: true,
      createdMemories: false,
      mutatedMemories: false,
      persisted: false,
      executionAllowed: false,
    },
  });
}

export { deepFreeze };
