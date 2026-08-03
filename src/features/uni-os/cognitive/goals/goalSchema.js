export const GOAL_ENGINE_SCHEMA_VERSION = '1.0';

export const GOAL_TYPES = Object.freeze([
  'Savings',
  'Investment',
  'EmergencyFund',
  'DebtReduction',
  'IncomeGrowth',
  'BusinessGrowth',
  'Custom',
]);

export const GOAL_STATUSES = Object.freeze([
  'ACTIVE',
  'PAUSED',
  'COMPLETED',
  'ARCHIVED',
]);

export const GOAL_PRIORITIES = Object.freeze([
  'LOW',
  'NORMAL',
  'HIGH',
  'CRITICAL',
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
    Object.entries(value).map(([key, nestedValue]) => [key, cloneValue(nestedValue)]),
  );
}

function safeDeadline(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : value;
}

function safeGoal(goal = {}) {
  const source = goal && typeof goal === 'object' ? goal : {};
  const progress = Number.isFinite(source.progress)
    ? Math.min(1, Math.max(0, source.progress))
    : 0;
  const confidence = Number.isFinite(source.confidence)
    ? Math.min(1, Math.max(0, source.confidence))
    : 0;
  return {
    id: typeof source.id === 'string' && source.id.trim() ? source.id.trim() : null,
    type: GOAL_TYPES.includes(source.type) ? source.type : 'Custom',
    title: typeof source.title === 'string' ? source.title.trim() : '',
    priority: GOAL_PRIORITIES.includes(source.priority) ? source.priority : 'NORMAL',
    progress,
    status: GOAL_STATUSES.includes(source.status) ? source.status : 'ACTIVE',
    targetValue: Number.isFinite(source.targetValue) ? source.targetValue : null,
    currentValue: Number.isFinite(source.currentValue) ? source.currentValue : null,
    deadline: safeDeadline(source.deadline),
    confidence,
  };
}

export function createGoalEngineSnapshot({ goals = [], primaryGoal = null, metadata = {} } = {}) {
  const safeGoals = Array.isArray(goals) ? goals.map(safeGoal) : [];
  const primaryId = primaryGoal?.id ?? null;
  const safePrimaryGoal = primaryId === null
    ? null
    : safeGoals.find((goal) => goal.id === primaryId) ?? null;

  return deepFreeze({
    goals: safeGoals.map(cloneValue),
    primaryGoal: safePrimaryGoal ? cloneValue(safePrimaryGoal) : null,
    metadata: {
      version: GOAL_ENGINE_SCHEMA_VERSION,
      sourceGoalCount: Number.isInteger(metadata.sourceGoalCount) ? metadata.sourceGoalCount : 0,
      activeGoalCount: safeGoals.length,
      sorted: metadata.sorted === true,
      executionAllowed: false,
      persisted: false,
      generatedGoals: false,
    },
  });
}

export { deepFreeze };
