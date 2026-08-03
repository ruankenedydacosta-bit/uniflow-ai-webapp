import { INSIGHT_TYPES } from './insightSchema.js';

export const INSIGHT_DEFINITIONS = Object.freeze({
  GOAL_PROGRESS: Object.freeze({
    baseScore: 58, title: 'GOAL_PROGRESS_DETECTED', description: 'GOAL_NEAR_COMPLETION', action: 'REVIEW_GOAL_NEXT_STEP',
  }),
  GOAL_DELAY: Object.freeze({
    baseScore: 78, title: 'GOAL_DELAY_DETECTED', description: 'GOAL_DEADLINE_EXPIRED', action: 'REVIEW_GOAL_TIMELINE',
  }),
  SPENDING_PATTERN: Object.freeze({
    baseScore: 55, title: 'SPENDING_PATTERN_DETECTED', description: 'SPENDING_PATTERN_RELEVANT', action: 'REVIEW_SPENDING_PATTERN',
  }),
  INCOME_PATTERN: Object.freeze({
    baseScore: 52, title: 'INCOME_PATTERN_DETECTED', description: 'INCOME_PATTERN_RELEVANT', action: 'REVIEW_INCOME_PATTERN',
  }),
  INVESTMENT_OPPORTUNITY: Object.freeze({
    baseScore: 48, title: 'INVESTMENT_OPPORTUNITY_DETECTED', description: 'ACTIVE_INVESTMENT_GOAL', action: 'REVIEW_INVESTMENT_ROUTE',
  }),
  EMERGENCY_RESERVE: Object.freeze({
    baseScore: 68, title: 'EMERGENCY_RESERVE_SIGNAL', description: 'LOW_EMERGENCY_RESERVE_PROGRESS', action: 'REVIEW_RESERVE_ROUTE',
  }),
  RECURRING_EXPENSE: Object.freeze({
    baseScore: 54, title: 'RECURRING_EXPENSE_DETECTED', description: 'RECURRING_EXPENSE_RELEVANT', action: 'REVIEW_RECURRING_EXPENSE',
  }),
  CATEGORY_CONCENTRATION: Object.freeze({
    baseScore: 60, title: 'CATEGORY_CONCENTRATION_DETECTED', description: 'CATEGORY_MATCH_SIGNAL', action: 'REVIEW_CATEGORY_CONCENTRATION',
  }),
  MEMORY_CONFLICT: Object.freeze({
    baseScore: 82, title: 'MEMORY_CONFLICT_DETECTED', description: 'MEMORY_CONFLICT_SIGNAL', action: 'REQUEST_MEMORY_REVIEW',
  }),
  CONTEXT_CHANGE: Object.freeze({
    baseScore: 64, title: 'CONTEXT_CHANGE_DETECTED', description: 'CONTEXT_CHANGED_SIGNAL', action: 'REVIEW_ACTIVE_CONTEXT',
  }),
  NO_INSIGHT: Object.freeze({
    baseScore: 0, title: 'NO_INSIGHT_IDENTIFIED', description: 'NO_ACTIONABLE_SIGNAL_DETECTED', action: 'NO_ACTION_REQUIRED',
  }),
});

const INTENT_COMPATIBILITY = Object.freeze({
  GOAL_PROGRESS: Object.freeze(['create_goal', 'planning', 'forecast']),
  GOAL_DELAY: Object.freeze(['create_goal', 'planning', 'forecast']),
  SPENDING_PATTERN: Object.freeze(['register_expense', 'forecast', 'planning']),
  INCOME_PATTERN: Object.freeze(['register_income', 'forecast', 'planning']),
  INVESTMENT_OPPORTUNITY: Object.freeze(['forecast', 'planning', 'check_balance']),
  EMERGENCY_RESERVE: Object.freeze(['forecast', 'planning', 'check_balance']),
  RECURRING_EXPENSE: Object.freeze(['register_expense', 'forecast']),
  CATEGORY_CONCENTRATION: Object.freeze(['register_expense', 'forecast']),
  MEMORY_CONFLICT: Object.freeze(['question', 'configuration']),
  CONTEXT_CHANGE: Object.freeze(['question', 'configuration']),
  NO_INSIGHT: Object.freeze([]),
});

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function identifierPart(value) {
  const normalized = String(value ?? 'global').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
  return normalized.slice(0, 120) || 'global';
}

export function priorityFromScore(score) {
  if (score >= 90) return 'CRITICAL';
  if (score >= 70) return 'HIGH';
  if (score >= 35) return 'NORMAL';
  return 'LOW';
}

export function createStructuredInsight(signal = {}, parsedIntent = {}) {
  const type = INSIGHT_TYPES.includes(signal.type) ? signal.type : 'NO_INSIGHT';
  const definition = INSIGHT_DEFINITIONS[type];
  const confidence = Number.isFinite(signal.confidence) ? clamp(signal.confidence, 0, 1) : 0;
  const severity = Number.isFinite(signal.severity) ? clamp(signal.severity, 0, 1) : 0;
  const intent = String(parsedIntent?.intent ?? '').trim().toLowerCase();
  const intentCompatible = INTENT_COMPATIBILITY[type].includes(intent);
  const score = type === 'NO_INSIGHT' ? 0 : Math.min(100, Math.max(0,
    definition.baseScore + Math.round(confidence * 10) + Math.round(severity * 10)
      + (intentCompatible ? 5 : 0),
  ));
  const reasons = Array.isArray(signal.reasons) ? [...signal.reasons] : [];
  if (intentCompatible) reasons.push('INTENT_COMPATIBLE');

  return {
    insightId: `insight:${type.toLowerCase()}:${identifierPart(signal.referenceId)}`,
    type,
    priority: priorityFromScore(score),
    confidence,
    score,
    trigger: {
      source: signal.source ?? 'SYSTEM',
      referenceId: typeof signal.referenceId === 'string' ? signal.referenceId : null,
      rule: signal.rule ?? 'UNSPECIFIED_RULE',
    },
    title: definition.title,
    description: definition.description,
    recommendedAction: definition.action,
    reasons,
  };
}

export function createNoInsight() {
  return createStructuredInsight({
    type: 'NO_INSIGHT',
    source: 'SYSTEM',
    referenceId: 'none',
    rule: 'NO_ACTIONABLE_SIGNAL',
    confidence: 1,
    reasons: ['NO_ACTIONABLE_SIGNAL'],
  });
}
