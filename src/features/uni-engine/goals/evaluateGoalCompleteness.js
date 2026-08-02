import { GOAL_POLICY } from './goalPolicy.js';

export function evaluateGoalCompleteness(input = {}) {
  const safe = input && typeof input === 'object' ? input : {};
  const goal = safe.goal ?? {};
  const target = goal.target ?? safe.target ?? {};
  const snapshot = safe.financialSnapshot ?? {};
  const cognitiveContext = safe.cognitiveContext ?? {};
  const workspaceType = String(safe.workspaceType ?? 'personal');

  const missing = [];
  const available = [];

  if (target.amount && target.currency) {
    available.push('target_amount');
  } else {
    missing.push('target_amount');
  }

  if (target.date) {
    available.push('target_date');
  } else {
    missing.push('target_date');
  }

  if (target.horizonMonths && target.horizonMonths > 0) {
    available.push('horizon');
  } else {
    missing.push('horizon');
  }

  if (snapshot && (snapshot.hasData || (Array.isArray(snapshot.accounts) && snapshot.accounts.length > 0))) {
    available.push('financial_snapshot');
  } else {
    missing.push('financial_snapshot');
  }

  const hasMemories = (Array.isArray(safe.persistentMemory?.retrieved) && safe.persistentMemory.retrieved.length > 0)
    || (Array.isArray(safe.operationalMemory?.entries) && safe.operationalMemory.entries.length > 0);
  if (hasMemories) {
    available.push('memory');
  } else {
    missing.push('memory');
  }

  if (workspaceType === 'business') {
    if (!cognitiveContext?.businessContext) {
      missing.push('business_context');
    } else {
      available.push('business_context');
    }
  }

  const score = available.length === 0 ? 0 : available.length / (available.length + missing.length);

  return {
    isComplete: missing.length <= GOAL_POLICY.maxMissingFieldsForReady,
    score,
    available,
    missing,
    missingCount: missing.length,
  };
}