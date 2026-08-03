export const CONTEXT_RANKING_SCHEMA_VERSION = '1.0';

export const CONTEXT_RELEVANCE = Object.freeze(['LOW', 'MEDIUM', 'HIGH']);

export const CONTEXT_RANKING_REASONS = Object.freeze([
  'INTENT_MATCH',
  'ACTIVE_WORKSPACE',
  'USER_MODE_MATCH',
  'CHANNEL_MATCH',
  'LANGUAGE_MATCH',
  'SESSION_ACTIVE',
  'RECENT_CONTEXT',
  'PRIMARY_GOAL_SIGNAL',
  'RELEVANT_MEMORY_SIGNAL',
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

function clampScore(value) {
  return Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : 0;
}

function safeRankedContext(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    key: typeof source.key === 'string' && source.key.trim() ? source.key.trim() : null,
    value: cloneValue(source.value ?? null),
    relevance: CONTEXT_RELEVANCE.includes(source.relevance) ? source.relevance : 'LOW',
    score: clampScore(source.score),
    reasons: Array.isArray(source.reasons)
      ? [...new Set(source.reasons.filter((reason) => CONTEXT_RANKING_REASONS.includes(reason)))]
      : [],
  };
}

export function createContextRankingSnapshot({ rankedContext = [], primaryContext = null, metadata = {} } = {}) {
  const safeContext = Array.isArray(rankedContext) ? rankedContext.map(safeRankedContext) : [];
  const primaryIndex = safeContext.findIndex((item) => (
    item.key === primaryContext?.key && item.score === primaryContext?.score
  ));
  const safePrimary = primaryIndex >= 0 ? safeContext[primaryIndex] : null;

  return deepFreeze({
    rankedContext: safeContext.map(cloneValue),
    primaryContext: safePrimary ? cloneValue(safePrimary) : null,
    metadata: {
      version: CONTEXT_RANKING_SCHEMA_VERSION,
      sourceContextCount: Number.isInteger(metadata.sourceContextCount)
        ? metadata.sourceContextCount
        : 0,
      eligibleContextCount: Number.isInteger(metadata.eligibleContextCount)
        ? metadata.eligibleContextCount
        : 0,
      rankedContextCount: safeContext.length,
      deterministic: true,
      createdContext: false,
      mutatedContext: false,
      persisted: false,
      executionAllowed: false,
    },
  });
}

export { deepFreeze };
