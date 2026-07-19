const RHYTHM_STATUS = { ON_TRACK: 'on_track', ATTENTION: 'attention', LATE: 'late' };

export function getGoalStatus(goal) {
  if (goal.status === 'completed') return 'completed';
  if (goal.status === 'canceled') return 'canceled';
  if (goal.status === 'paused') return 'paused';
  if (goal.archived_at) return 'archived';
  return 'active';
}

export function calcProgress(current, target) {
  if (!target || target <= 0) return 0;
  return Math.min(Math.round((Math.max(current, 0) / target) * 100), 100);
}

export function calcRemaining(current, target) {
  const remaining = target - Math.max(current, 0);
  return Math.max(remaining, 0);
}

export function calcMonthsBetween(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (start >= end) return 1;
  const months = (end.getFullYear() - start.getFullYear()) * 12
    + (end.getMonth() - start.getMonth());
  return Math.max(months, 1);
}

export function calcRemainingMonths(targetDate) {
  if (!targetDate) return null;
  const now = new Date();
  const target = new Date(targetDate);
  if (target <= now) return 0;
  const months = (target.getFullYear() - now.getFullYear()) * 12
    + (target.getMonth() - now.getMonth());
  return months;
}

export function calcRequiredMonthlyAmount(goal) {
  const remaining = calcRemaining(goal.current_amount, goal.target_amount);
  if (remaining <= 0) return 0;
  if (goal.target_date) {
    const monthsLeft = calcRemainingMonths(goal.target_date);
    if (monthsLeft !== null && monthsLeft > 0) return remaining / monthsLeft;
  }
  if (goal.planned_monthly_amount) return goal.planned_monthly_amount;
  return null;
}

export function calcExpectedProgress(goal) {
  if (!goal.start_date || !goal.target_date) return null;
  if (goal.status === 'completed') return 100;
  const now = new Date();
  const start = new Date(goal.start_date);
  const end = new Date(goal.target_date);
  if (now >= end) return 100;
  if (now <= start) return 0;
  const totalMs = end.getTime() - start.getTime();
  const elapsedMs = now.getTime() - start.getTime();
  return Math.min(Math.round((elapsedMs / totalMs) * 100), 100);
}

export function calcRhythmStatus(goal) {
  if (goal.status === 'completed' || goal.status === 'canceled') return null;
  const progress = calcProgress(goal.current_amount, goal.target_amount);
  const expected = calcExpectedProgress(goal);
  if (expected === null) return null;
  if (goal.target_date && new Date(goal.target_date) < new Date()) {
    if (progress < 100) return RHYTHM_STATUS.LATE;
    return RHYTHM_STATUS.ON_TRACK;
  }
  if (progress >= expected) return RHYTHM_STATUS.ON_TRACK;
  const deficit = expected - progress;
  if (deficit <= 15) return RHYTHM_STATUS.ATTENTION;
  return RHYTHM_STATUS.LATE;
}

export function getRhythmLabel(status) {
  const labels = {
    on_track: 'no ritmo',
    attention: 'atenção',
    late: 'atrasada',
  };
  return labels[status] || '';
}

export function getRhythmVariant(status) {
  const variants = {
    on_track: 'success',
    attention: 'warning',
    late: 'danger',
  };
  return variants[status] || 'default';
}

export function calcTotalPlanned(goals) {
  return goals.reduce((sum, g) => sum + Number(g.target_amount || 0), 0);
}

export function calcTotalAccumulated(goals) {
  return goals.reduce((sum, g) => sum + Number(g.current_amount || 0), 0);
}

export function calcOverallProgress(goals) {
  const total = calcTotalPlanned(goals);
  const accrued = calcTotalAccumulated(goals);
  return calcProgress(accrued, total);
}

export function calcActiveGoals(goals) {
  return goals.filter((g) => g.status === 'active' || g.status === 'paused');
}

export function calcCompletedGoals(goals) {
  return goals.filter((g) => g.status === 'completed');
}

export function calcLateGoals(goals) {
  return goals.filter((g) => {
    if (g.status === 'completed' || g.status === 'canceled') return false;
    if (!g.target_date) return false;
    return new Date(g.target_date) < new Date()
      && calcProgress(g.current_amount, g.target_amount) < 100;
  });
}

export function calcRequiredToReachGoal(goal) {
  if (!goal.planned_monthly_amount || goal.planned_monthly_amount <= 0) return null;
  const remaining = calcRemaining(goal.current_amount, goal.target_amount);
  if (remaining <= 0) return 0;
  return Math.ceil(remaining / goal.planned_monthly_amount);
}

export function calcMonthsUntilTarget(goal) {
  if (goal.status === 'completed') return 0;
  const remaining = calcRemaining(goal.current_amount, goal.target_amount);
  if (remaining <= 0) return 0;
  const monthly = goal.planned_monthly_amount || calcRequiredMonthlyAmount(goal);
  if (!monthly || monthly <= 0) return null;
  return Math.ceil(remaining / monthly);
}
