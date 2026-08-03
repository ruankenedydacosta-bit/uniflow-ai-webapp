export const INSIGHT_SCHEMA_VERSION = '1.0';

export const INSIGHT_TYPES = Object.freeze([
  'GOAL_PROGRESS',
  'GOAL_DELAY',
  'SPENDING_PATTERN',
  'INCOME_PATTERN',
  'INVESTMENT_OPPORTUNITY',
  'EMERGENCY_RESERVE',
  'RECURRING_EXPENSE',
  'CATEGORY_CONCENTRATION',
  'MEMORY_CONFLICT',
  'CONTEXT_CHANGE',
  'NO_INSIGHT',
]);

export const INSIGHT_PRIORITIES = Object.freeze(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']);

export const INSIGHT_REASONS = Object.freeze([
  'GOAL_NEAR_COMPLETION',
  'GOAL_DEADLINE_PASSED',
  'SPENDING_PATTERN_RELEVANT',
  'INCOME_PATTERN_RELEVANT',
  'ACTIVE_INVESTMENT_GOAL',
  'LOW_EMERGENCY_RESERVE_PROGRESS',
  'RECURRING_EXPENSE_RELEVANT',
  'CATEGORY_MATCH_SIGNAL',
  'MEMORY_CONFLICT_SIGNAL',
  'WORKSPACE_GOAL_MISMATCH',
  'CONTEXT_CHANGED_SIGNAL',
  'INTENT_COMPATIBLE',
  'NO_ACTIONABLE_SIGNAL',
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

function safeCode(value, fallback) {
  return typeof value === 'string' && /^[A-Z][A-Z0-9_]*$/.test(value) ? value : fallback;
}

function safeTrigger(value = {}) {
  const source = ['GOAL', 'MEMORY', 'CONTEXT', 'SYSTEM'].includes(value.source)
    ? value.source
    : 'SYSTEM';
  return {
    source,
    referenceId: typeof value.referenceId === 'string' && value.referenceId.trim()
      ? value.referenceId.trim().slice(0, 160)
      : null,
    rule: safeCode(value.rule, 'UNSPECIFIED_RULE'),
  };
}

function safeInsight(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    insightId: typeof source.insightId === 'string' && source.insightId.trim()
      ? source.insightId.trim().slice(0, 220)
      : null,
    type: INSIGHT_TYPES.includes(source.type) ? source.type : 'NO_INSIGHT',
    priority: INSIGHT_PRIORITIES.includes(source.priority) ? source.priority : 'LOW',
    confidence: Number.isFinite(source.confidence) ? clamp(source.confidence, 0, 1) : 0,
    score: Number.isFinite(source.score) ? clamp(Math.round(source.score), 0, 100) : 0,
    trigger: safeTrigger(source.trigger),
    title: safeCode(source.title, 'NO_INSIGHT_IDENTIFIED'),
    description: safeCode(source.description, 'NO_ACTIONABLE_SIGNAL_DETECTED'),
    recommendedAction: safeCode(source.recommendedAction, 'NO_ACTION_REQUIRED'),
    reasons: Array.isArray(source.reasons)
      ? [...new Set(source.reasons.filter((reason) => INSIGHT_REASONS.includes(reason)))]
      : [],
  };
}

export function createInsightSnapshot({ insights = [], primaryInsight = null } = {}) {
  const safeInsights = Array.isArray(insights) ? insights.map(safeInsight) : [];
  const primaryIndex = safeInsights.findIndex((insight) => (
    insight.insightId === primaryInsight?.insightId && insight.score === primaryInsight?.score
  ));
  const safePrimary = primaryIndex >= 0 ? safeInsights[primaryIndex] : null;
  const actionableCount = safeInsights.filter((insight) => insight.type !== 'NO_INSIGHT').length;

  return deepFreeze({
    insights: safeInsights.map(cloneValue),
    primaryInsight: safePrimary ? cloneValue(safePrimary) : null,
    metadata: {
      version: INSIGHT_SCHEMA_VERSION,
      detectedCount: safeInsights.length,
      actionableCount,
      deterministic: true,
      naturalLanguageGenerated: false,
      userNotified: false,
      persisted: false,
      executionAllowed: false,
    },
  });
}

export { deepFreeze };
