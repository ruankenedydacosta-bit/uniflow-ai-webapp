export const GOAL_RANKING_SCHEMA_VERSION = '1.0';

export const GOAL_RELEVANCE = Object.freeze(['LOW', 'MEDIUM', 'HIGH']);

export const GOAL_RANKING_REASONS = Object.freeze([
  'ACTIVE_GOAL',
  'PRIORITY_WEIGHT',
  'INTENT_MATCH',
  'CATEGORY_MATCH',
  'CONTEXT_MATCH',
  'DEADLINE_PROXIMITY',
  'MEMORY_CORROBORATED',
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

function safeScore(value) {
  return Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : 0;
}

function safeRankedGoal(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    goalId: typeof source.goalId === 'string' && source.goalId.trim()
      ? source.goalId.trim()
      : null,
    relevance: GOAL_RELEVANCE.includes(source.relevance) ? source.relevance : 'LOW',
    priority: ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'].includes(source.priority)
      ? source.priority
      : 'NORMAL',
    score: safeScore(source.score),
    reasons: Array.isArray(source.reasons)
      ? [...new Set(source.reasons.filter((reason) => GOAL_RANKING_REASONS.includes(reason)))]
      : [],
  };
}

export function createGoalRankingSnapshot({ rankedGoals = [], primaryGoal = null } = {}) {
  const safeGoals = Array.isArray(rankedGoals) ? rankedGoals.map(safeRankedGoal) : [];
  const primaryIndex = safeGoals.findIndex((goal) => (
    goal.goalId === primaryGoal?.goalId && goal.score === primaryGoal?.score
  ));
  const safePrimaryGoal = primaryIndex >= 0 ? safeGoals[primaryIndex] : null;

  return deepFreeze({
    rankedGoals: safeGoals.map(cloneValue),
    primaryGoal: safePrimaryGoal ? cloneValue(safePrimaryGoal) : null,
    metadata: {
      version: GOAL_RANKING_SCHEMA_VERSION,
      sourceGoalCount: safeGoals.length,
      rankedGoalCount: safeGoals.length,
      deterministic: true,
      generatedGoals: false,
      mutatedGoals: false,
      executionAllowed: false,
    },
  });
}

export { deepFreeze };
