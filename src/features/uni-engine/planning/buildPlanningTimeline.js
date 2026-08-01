import { PLANNING_POLICY } from './planningPolicy.js';

function isoDate(value) {
  if (value == null || value === '') return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

function addMonths(date, months) {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next.toISOString().slice(0, 10);
}

export function buildPlanningTimeline(input = {}) {
  const goal = input.goal ?? {};
  const startDate = isoDate(input.timestamp) ?? '1970-01-01';
  const horizonMonths = goal.horizonMonths
    ?? PLANNING_POLICY.defaultHorizonMonths[goal.type]
    ?? null;
  const targetDate = isoDate(goal.targetDate)
    ?? (horizonMonths ? addMonths(startDate, horizonMonths) : null);
  const milestoneCount = horizonMonths
    ? Math.min(PLANNING_POLICY.limits.maxMilestones, Math.max(1, Math.ceil(horizonMonths / 3)))
    : 0;
  const milestones = Array.from({ length: milestoneCount }, (_, index) => {
    const sequence = index + 1;
    const month = Math.max(1, Math.round((horizonMonths * sequence) / milestoneCount));
    const ratio = Number((sequence / milestoneCount).toFixed(4));
    return {
      sequence,
      date: addMonths(startDate, month),
      progressRatio: ratio,
      targetAmount: goal.targetAmount == null
        ? null
        : Number((goal.targetAmount * ratio).toFixed(2)),
    };
  });
  return { startDate, targetDate, horizonMonths, milestones };
}

export { addMonths, isoDate };
