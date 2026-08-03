import { normalizeGoalPriority } from './goalNormalizer.js';

export const GOAL_PRIORITY_WEIGHT = Object.freeze({
  LOW: 1,
  NORMAL: 2,
  HIGH: 3,
  CRITICAL: 4,
});

function daysUntil(deadline, now) {
  if (!deadline) return null;
  const deadlineTime = new Date(`${deadline}T00:00:00.000Z`).getTime();
  const nowTime = new Date(now).getTime();
  if (!Number.isFinite(deadlineTime) || !Number.isFinite(nowTime)) return null;
  return Math.ceil((deadlineTime - nowTime) / 86_400_000);
}

function highestPriority(first, second) {
  return GOAL_PRIORITY_WEIGHT[first] >= GOAL_PRIORITY_WEIGHT[second] ? first : second;
}

export function resolveGoalPriority(goal, { now = new Date().toISOString() } = {}) {
  let priority = normalizeGoalPriority(goal?.priority);
  const remainingDays = daysUntil(goal?.deadline, now);

  if (remainingDays !== null && remainingDays < 0) priority = 'CRITICAL';
  else if (remainingDays !== null && remainingDays <= 30) {
    priority = highestPriority(priority, 'HIGH');
  }

  if (goal?.type === 'EmergencyFund' || goal?.type === 'DebtReduction') {
    priority = highestPriority(priority, 'HIGH');
  }

  return priority;
}

export function prioritizeGoals(goals = [], options = {}) {
  if (!Array.isArray(goals)) return [];

  return goals
    .map((goal, originalIndex) => ({
      ...goal,
      priority: resolveGoalPriority(goal, options),
      originalIndex,
    }))
    .sort((first, second) => {
      const priorityDifference = GOAL_PRIORITY_WEIGHT[second.priority]
        - GOAL_PRIORITY_WEIGHT[first.priority];
      if (priorityDifference !== 0) return priorityDifference;

      const deadlineDifference = String(first.deadline ?? '9999-12-31')
        .localeCompare(String(second.deadline ?? '9999-12-31'));
      return deadlineDifference || first.originalIndex - second.originalIndex;
    })
    .map((entry) => {
      const goal = { ...entry };
      delete goal.originalIndex;
      return goal;
    });
}
