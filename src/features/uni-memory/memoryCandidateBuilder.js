import { explainMemoryEvidence } from './memoryExplanation.js';
import {
  deepFreeze,
  MEMORY_SOURCES,
  normalizeMemoryText,
} from './memoryTypes.js';

function addDays(isoDate, days) {
  if (!isoDate) return null;
  const date = new Date(`${isoDate.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function createCandidate({
  workspaceId,
  type,
  key,
  value,
  confidence,
  evidence,
  source,
  firstObservedAt,
  lastObservedAt,
  expiresAt = null,
  requiresConfirmation = true,
}) {
  return {
    type,
    key: normalizeMemoryText(key).replace(/\s+/g, '_'),
    value,
    confidence: Number(Math.min(1, Math.max(0, confidence)).toFixed(2)),
    evidence,
    source,
    firstObservedAt,
    lastObservedAt,
    expiresAt,
    requiresConfirmation,
    explanation: explainMemoryEvidence(type, evidence),
    workspaceId,
  };
}

export function buildMemoryCandidates({
  workspaceId,
  snapshot,
  recurrences = [],
  patterns = [],
  categoryCorrections = [],
  explicitPreferences = [],
  financialGoals = [],
  conversationContext = null,
} = {}) {
  if (!workspaceId || !snapshot) {
    return deepFreeze([]);
  }

  const candidates = [];
  const hasSufficientHistory = snapshot.totals?.transactionCount >= 2;
  const observedStart = snapshot.period?.start;
  const observedEnd = snapshot.period?.end;
  const topCategory = hasSufficientHistory
    ? snapshot.categoryTotals?.find((item) => item.count >= 3)
    : null;
  if (topCategory) {
    const evidence = { categoryId: topCategory.id, categoryName: topCategory.name, count: topCategory.count, total: topCategory.total };
    candidates.push(createCandidate({
      workspaceId,
      type: 'category_preference',
      key: `${topCategory.type}:${topCategory.id ?? topCategory.name}`,
      value: { categoryId: topCategory.id, categoryName: topCategory.name, transactionType: topCategory.type },
      confidence: Math.min(0.9, 0.5 + topCategory.count * 0.06),
      evidence,
      source: MEMORY_SOURCES.TRANSACTION_PATTERN,
      firstObservedAt: observedStart,
      lastObservedAt: observedEnd,
    }));
  }

  const topAccount = hasSufficientHistory
    ? snapshot.accountTotals?.find((item) => item.count >= 3)
    : null;
  if (topAccount) {
    const evidence = { accountId: topAccount.id, accountName: topAccount.name, count: topAccount.count, total: topAccount.total };
    candidates.push(createCandidate({
      workspaceId,
      type: 'account_preference',
      key: topAccount.id ?? topAccount.name,
      value: { accountId: topAccount.id, accountName: topAccount.name },
      confidence: Math.min(0.9, 0.5 + topAccount.count * 0.06),
      evidence,
      source: MEMORY_SOURCES.TRANSACTION_PATTERN,
      firstObservedAt: observedStart,
      lastObservedAt: observedEnd,
    }));
  }

  (hasSufficientHistory ? recurrences : [])
    .filter((item) => item.occurrences >= 3 && item.confidence >= 0.65)
    .forEach((item) => {
      const type = item.transactionType === 'income' ? 'recurring_income' : 'recurring_expense';
      const evidence = { occurrences: item.occurrences, averageIntervalDays: item.averageIntervalDays, transactionIds: item.evidence.transactionIds, dates: item.evidence.dates };
      candidates.push(createCandidate({
        workspaceId,
        type,
        key: `${item.normalizedDescription}:${item.accountId ?? 'unknown'}`,
        value: { description: item.description, categoryId: item.categoryId, accountId: item.accountId, averageAmount: item.averageAmount, frequency: item.frequency },
        confidence: item.confidence,
        evidence,
        source: MEMORY_SOURCES.TRANSACTION_PATTERN,
        firstObservedAt: item.evidence.dates[0],
        lastObservedAt: item.evidence.dates.at(-1),
      }));
    });

  (hasSufficientHistory ? patterns : []).filter((item) => item.confidence >= 0.65).forEach((item) => {
    const evidence = { ...item.evidence, changePercent: item.changePercent };
    candidates.push(createCandidate({
      workspaceId,
      type: 'spending_pattern',
      key: `${item.type}:${item.categoryId ?? item.currentAccountId ?? 'workspace'}`,
      value: { patternType: item.type, categoryId: item.categoryId ?? null, changePercent: item.changePercent ?? null, share: item.share ?? null },
      confidence: item.confidence,
      evidence,
      source: MEMORY_SOURCES.TRANSACTION_PATTERN,
      firstObservedAt: observedStart,
      lastObservedAt: observedEnd,
      expiresAt: addDays(observedEnd, 90),
    }));
  });

  categoryCorrections.forEach((correction) => {
    if (!correction.merchant || !correction.categoryId) return;
    const observedAt = correction.observedAt ?? observedEnd;
    candidates.push(createCandidate({
      workspaceId,
      type: 'merchant_category_mapping',
      key: correction.merchant,
      value: { merchant: correction.merchant, categoryId: correction.categoryId, categoryName: correction.categoryName ?? null },
      confidence: 1,
      evidence: { correctionId: correction.id ?? null, count: 1 },
      source: MEMORY_SOURCES.USER_CORRECTION,
      firstObservedAt: observedAt,
      lastObservedAt: observedAt,
      requiresConfirmation: false,
    }));
  });

  explicitPreferences.forEach((preference) => {
    if (!preference.key || preference.value === undefined) return;
    const observedAt = preference.observedAt ?? observedEnd;
    candidates.push(createCandidate({
      workspaceId,
      type: 'conversation_preference',
      key: preference.key,
      value: { preference: preference.value },
      confidence: 1,
      evidence: { explicitlyInformed: true },
      source: MEMORY_SOURCES.EXPLICIT_USER,
      firstObservedAt: observedAt,
      lastObservedAt: observedAt,
      expiresAt: preference.expiresAt ?? null,
      requiresConfirmation: false,
    }));
  });

  financialGoals.forEach((goal) => {
    if (!goal.id && !goal.name) return;
    const observedAt = goal.observedAt ?? observedEnd;
    candidates.push(createCandidate({
      workspaceId,
      type: 'financial_goal_context',
      key: goal.id ?? goal.name,
      value: { goalId: goal.id ?? null, name: goal.name, targetAmount: goal.targetAmount ?? null },
      confidence: goal.explicit ? 1 : 0.72,
      evidence: { explicitlyInformed: Boolean(goal.explicit) },
      source: goal.explicit ? MEMORY_SOURCES.EXPLICIT_USER : MEMORY_SOURCES.CONVERSATION_CONTEXT,
      firstObservedAt: observedAt,
      lastObservedAt: observedAt,
      expiresAt: goal.expiresAt ?? null,
      requiresConfirmation: !goal.explicit,
    }));
  });

  if (conversationContext?.goalName) {
    const observedAt = conversationContext.observedAt ?? observedEnd;
    candidates.push(createCandidate({
      workspaceId,
      type: 'financial_goal_context',
      key: conversationContext.goalName,
      value: { name: conversationContext.goalName, targetAmount: conversationContext.targetAmount ?? null },
      confidence: 0.65,
      evidence: { recentConversationContext: true },
      source: MEMORY_SOURCES.CONVERSATION_CONTEXT,
      firstObservedAt: observedAt,
      lastObservedAt: observedAt,
      expiresAt: addDays(observedAt, 30),
      requiresConfirmation: true,
    }));
  }

  return deepFreeze(candidates);
}
