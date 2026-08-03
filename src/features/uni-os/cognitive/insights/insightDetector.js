function daysOverdue(deadline, now) {
  if (typeof deadline !== 'string') return null;
  const deadlineTime = new Date(`${deadline}T00:00:00.000Z`).getTime();
  const nowTime = new Date(now).getTime();
  if (!Number.isFinite(deadlineTime) || !Number.isFinite(nowTime)) return null;
  return Math.floor((nowTime - deadlineTime) / 86_400_000);
}

function validGoal(goal) {
  return Boolean(goal && typeof goal === 'object' && goal.id && goal.status === 'ACTIVE');
}

function goalSignals(goal, now) {
  if (!validGoal(goal)) return [];
  const signals = [];
  const confidence = Number.isFinite(goal.confidence) ? goal.confidence : 0;
  const progress = Number.isFinite(goal.progress) ? goal.progress : 0;
  const overdue = daysOverdue(goal.deadline, now);

  if (overdue !== null && overdue > 0 && progress < 1) {
    signals.push({
      type: 'GOAL_DELAY', source: 'GOAL', referenceId: goal.id,
      rule: 'GOAL_DEADLINE_EXPIRED', confidence, severity: Math.min(1, overdue / 90),
      reasons: ['GOAL_DEADLINE_PASSED'],
    });
  }
  if (progress >= 0.8 && progress < 1) {
    signals.push({
      type: 'GOAL_PROGRESS', source: 'GOAL', referenceId: goal.id,
      rule: 'GOAL_PROGRESS_THRESHOLD', confidence, severity: progress,
      reasons: ['GOAL_NEAR_COMPLETION'],
    });
  }
  if (goal.type === 'Investment' && progress < 1) {
    signals.push({
      type: 'INVESTMENT_OPPORTUNITY', source: 'GOAL', referenceId: goal.id,
      rule: 'ACTIVE_INVESTMENT_GOAL', confidence, severity: 1 - progress,
      reasons: ['ACTIVE_INVESTMENT_GOAL'],
    });
  }
  if (goal.type === 'EmergencyFund' && progress < 0.5) {
    signals.push({
      type: 'EMERGENCY_RESERVE', source: 'GOAL', referenceId: goal.id,
      rule: 'LOW_EMERGENCY_RESERVE_PROGRESS', confidence, severity: 1 - progress,
      reasons: ['LOW_EMERGENCY_RESERVE_PROGRESS'],
    });
  }
  return signals;
}

function memorySignals(memory) {
  if (!memory?.memoryId || !memory.type) return [];
  const common = {
    source: 'MEMORY',
    referenceId: memory.memoryId,
    confidence: Number.isFinite(memory.confidence) ? memory.confidence : 0,
    severity: Number.isFinite(memory.score) ? memory.score / 100 : 0,
  };
  const signals = [];

  if (memory.type === 'spending_pattern') {
    signals.push({
      ...common, type: 'SPENDING_PATTERN', rule: 'SPENDING_PATTERN_RELEVANT',
      reasons: ['SPENDING_PATTERN_RELEVANT'],
    });
    if (memory.reasons?.includes('CATEGORY_MATCH')) {
      signals.push({
        ...common, type: 'CATEGORY_CONCENTRATION', rule: 'CATEGORY_MATCH_SIGNAL',
        reasons: ['CATEGORY_MATCH_SIGNAL'],
      });
    }
  } else if (memory.type === 'recurring_income') {
    signals.push({
      ...common, type: 'INCOME_PATTERN', rule: 'INCOME_PATTERN_RELEVANT',
      reasons: ['INCOME_PATTERN_RELEVANT'],
    });
  } else if (memory.type === 'recurring_expense') {
    signals.push({
      ...common, type: 'RECURRING_EXPENSE', rule: 'RECURRING_EXPENSE_RELEVANT',
      reasons: ['RECURRING_EXPENSE_RELEVANT'],
    });
  }
  return signals;
}

function memoryConflictSignals(memoryRankingSnapshot = {}) {
  const ids = Array.isArray(memoryRankingSnapshot.metadata?.conflictMemoryIds)
    ? memoryRankingSnapshot.metadata.conflictMemoryIds.filter((id) => typeof id === 'string')
    : [];
  if (ids.length === 0 && memoryRankingSnapshot.metadata?.conflictDetected !== true) return [];
  const references = ids.length > 0 ? ids : ['memory-conflict'];
  return references.map((referenceId) => ({
    type: 'MEMORY_CONFLICT', source: 'MEMORY', referenceId,
    rule: 'MEMORY_CONFLICT_SIGNAL', confidence: 1, severity: 1,
    reasons: ['MEMORY_CONFLICT_SIGNAL'],
  }));
}

function contextSignals(input = {}) {
  const signals = [];
  const changedKeys = Array.isArray(input.contextRankingSnapshot?.metadata?.changedKeys)
    ? input.contextRankingSnapshot.metadata.changedKeys.filter((key) => typeof key === 'string')
    : [];
  const workspaceType = input.contextRankingSnapshot?.rankedContext?.find(
    (item) => item?.key === 'workspace.type',
  )?.value;
  const primaryGoalId = input.goalRankingSnapshot?.primaryGoal?.goalId
    ?? input.goalSnapshot?.primaryGoal?.id;
  const goals = Array.isArray(input.goalSnapshot?.goals) ? input.goalSnapshot.goals : [];
  const primaryGoal = goals.find((goal) => goal?.id === primaryGoalId);
  if (primaryGoal?.type === 'BusinessGrowth' && workspaceType === 'personal') {
    changedKeys.push('workspace.type');
  }
  return [...new Set(changedKeys)].map((referenceId) => ({
    type: 'CONTEXT_CHANGE', source: 'CONTEXT', referenceId,
    rule: 'CONTEXT_CHANGED_SIGNAL', confidence: 1, severity: 0.8,
    reasons: [
      referenceId === 'workspace.type' ? 'WORKSPACE_GOAL_MISMATCH' : 'CONTEXT_CHANGED_SIGNAL',
    ],
  })).concat(signals);
}

export function detectInsightSignals(input = {}, options = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const now = options.now ?? new Date().toISOString();
  const goals = Array.isArray(source.goalSnapshot?.goals) ? source.goalSnapshot.goals : [];
  const memories = Array.isArray(source.memoryRankingSnapshot?.rankedMemories)
    ? source.memoryRankingSnapshot.rankedMemories
    : [];

  return [
    ...goals.flatMap((goal) => goalSignals(goal, now)),
    ...memories.flatMap(memorySignals),
    ...memoryConflictSignals(source.memoryRankingSnapshot),
    ...contextSignals(source),
  ];
}
