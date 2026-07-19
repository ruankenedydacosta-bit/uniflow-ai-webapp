import { SCENARIO_CONFIG, GOAL_FEASIBILITY } from './futureConstants.js';
import { calcRemaining, calcRemainingMonths, calcMonthsUntilTarget } from '../goals/goalCalc.js';

function safeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

export function calcMonthlyAverages(transactions = []) {
  if (!transactions.length) {
    return { avgIncome: 0, avgExpense: 0, monthsWithData: 0, netResult: 0 };
  }

  const monthlyMap = {};

  for (const t of transactions) {
    if (!t.transaction_date) continue;
    const date = new Date(t.transaction_date);
    if (isNaN(date.getTime())) continue;

    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!monthlyMap[key]) {
      monthlyMap[key] = { income: 0, expense: 0 };
    }

    const amount = safeNumber(t.amount);
    if (t.transaction_type === 'income') {
      monthlyMap[key].income += amount;
    } else if (t.transaction_type === 'expense') {
      monthlyMap[key].expense += amount;
    }
  }

  const months = Object.keys(monthlyMap);
  if (!months.length) {
    return { avgIncome: 0, avgExpense: 0, monthsWithData: 0, netResult: 0 };
  }

  const totalIncome = months.reduce((sum, m) => sum + monthlyMap[m].income, 0);
  const totalExpense = months.reduce((sum, m) => sum + monthlyMap[m].expense, 0);
  const monthCount = months.length;

  return {
    avgIncome: totalIncome / monthCount,
    avgExpense: totalExpense / monthCount,
    monthsWithData: monthCount,
    netResult: (totalIncome - totalExpense) / monthCount,
  };
}

export function calcProjectedBalance(currentBalance, monthlyNet, months) {
  const balance = safeNumber(currentBalance);
  const net = safeNumber(monthlyNet);
  const m = Math.max(1, Math.round(safeNumber(months)));
  return balance + net * m;
}

export function calcScenarioAdjustment(avgIncome, avgExpense, scenarioId) {
  const config = SCENARIO_CONFIG[scenarioId];
  if (!config) {
    const income = safeNumber(avgIncome);
    const expense = safeNumber(avgExpense);
    return { adjustedIncome: income, adjustedExpense: expense, adjustedNet: income - expense };
  }

  const income = safeNumber(avgIncome);
  const expense = safeNumber(avgExpense);

  const adjustedIncome = income * (1 + config.incomeAdjustment);
  const adjustedExpense = expense * (1 + config.expenseAdjustment);
  const adjustedNet = adjustedIncome - adjustedExpense;

  return { adjustedIncome, adjustedExpense, adjustedNet };
}

export function calcScenarioProjection(currentBalance, avgIncome, avgExpense, scenarioId, horizon) {
  const { adjustedIncome, adjustedExpense, adjustedNet } = calcScenarioAdjustment(avgIncome, avgExpense, scenarioId);

  if (!adjustedIncome && !adjustedExpense) {
    return {
      projectedBalance: safeNumber(currentBalance),
      monthlyResult: 0,
      monthsProjected: horizon,
      hasData: false,
    };
  }

  const projectedBalance = calcProjectedBalance(currentBalance, adjustedNet, horizon);

  return {
    projectedBalance: Math.round(projectedBalance * 100) / 100,
    monthlyResult: Math.round(adjustedNet * 100) / 100,
    monthsProjected: horizon,
    hasData: true,
  };
}

export function calcAllScenarioProjections(currentBalance, avgIncome, avgExpense, scenarioIds, horizon) {
  return scenarioIds.reduce((acc, id) => {
    acc[id] = calcScenarioProjection(currentBalance, avgIncome, avgExpense, id, horizon);
    return acc;
  }, {});
}

export function calcSavingsCapacity(monthlyNet, scenarioId) {
  const config = SCENARIO_CONFIG[scenarioId];
  const net = safeNumber(monthlyNet);
  if (net <= 0) return 0;

  const adjustment = config ? config.contributionAdjustment : 0;
  const capacity = net * (1 + adjustment);
  return Math.max(0, Math.round(capacity * 100) / 100);
}

export function calcGoalProjection(goal, monthlySurplus, scenarioId) {
  const config = SCENARIO_CONFIG[scenarioId];
  const surplus = safeNumber(monthlySurplus) * (1 + (config ? config.contributionAdjustment : 0));

  const remaining = calcRemaining(goal.current_amount, goal.target_amount);
  if (remaining <= 0) {
    return {
      goalId: goal.id,
      name: goal.name,
      status: goal.status,
      feasibility: GOAL_FEASIBILITY.VIABLE,
      originalMonths: calcMonthsUntilTarget(goal) || 0,
      estimatedMonths: 0,
      differenceMonths: 0,
      currentContribution: safeNumber(goal.planned_monthly_amount),
      requiredContribution: 0,
      suggestedAction: 'Meta já concluída',
      estimatedDate: goal.completed_at || null,
    };
  }

  const originalMonths = calcMonthsUntilTarget(goal);
  const remainingOriginalMonths = calcRemainingMonths(goal.target_date);

  if (surplus <= 0) {
    return {
      goalId: goal.id,
      name: goal.name,
      status: goal.status,
      feasibility: GOAL_FEASIBILITY.UNVIABLE,
      originalMonths: originalMonths || null,
      estimatedMonths: null,
      differenceMonths: null,
      currentContribution: safeNumber(goal.planned_monthly_amount),
      requiredContribution: 0,
      suggestedAction: 'Fluxo mensal negativo — sem capacidade de poupança no momento',
      estimatedDate: null,
    };
  }

  const maxContribution = surplus * 0.8;
  let feasibleContribution = safeNumber(goal.planned_monthly_amount);
  if (feasibleContribution <= 0) {
    feasibleContribution = Math.min(remaining, maxContribution);
  }
  if (feasibleContribution > maxContribution) {
    feasibleContribution = maxContribution;
  }

  const estimatedMonths = Math.ceil(remaining / feasibleContribution);
  const requiredForDeadline = remainingOriginalMonths !== null && remainingOriginalMonths > 0
    ? Math.ceil(remaining / remainingOriginalMonths)
    : null;

  let feasibility;
  let suggestedAction;

  if (!goal.target_date) {
    feasibility = GOAL_FEASIBILITY.VIABLE;
    suggestedAction = 'Sem prazo definido — contribuição mensal mantida';
  } else if (remainingOriginalMonths !== null && estimatedMonths <= remainingOriginalMonths) {
    feasibility = GOAL_FEASIBILITY.VIABLE;
    suggestedAction = 'No prazo — mantenha a contribuição atual';
  } else if (remainingOriginalMonths !== null && estimatedMonths <= remainingOriginalMonths * 1.5) {
    feasibility = GOAL_FEASIBILITY.ATTENTION;
    const extra = requiredForDeadline ? Math.ceil(requiredForDeadline - feasibleContribution) : 0;
    suggestedAction = extra > 0
      ? `Aportar +${formatCurrencySimple(extra)}/mês para cumprir o prazo`
      : 'Próximo do prazo — revise a data ou aumente o aporte';
  } else {
    feasibility = GOAL_FEASIBILITY.UNVIABLE;
    suggestedAction = 'Prazo inviável com fluxo atual — revise o valor ou estenda o prazo';
  }

  return {
    goalId: goal.id,
    name: goal.name,
    status: goal.status,
    feasibility,
    originalMonths: originalMonths || null,
    estimatedMonths,
    differenceMonths: remainingOriginalMonths !== null ? estimatedMonths - remainingOriginalMonths : null,
    currentContribution: safeNumber(goal.planned_monthly_amount),
    requiredContribution: requiredForDeadline || 0,
    suggestedAction,
    estimatedDate: estimatedMonths ? addMonths(new Date(), estimatedMonths).toISOString().split('T')[0] : null,
  };
}

export function calcAllGoalProjections(goals = [], monthlyNet, scenarioId) {
  return goals
    .filter((g) => g.status === 'active' || g.status === 'paused')
    .map((goal) => calcGoalProjection(goal, monthlyNet, scenarioId));
}

export function calcProjectionSummary(projections = []) {
  const total = projections.length;
  const viable = projections.filter((p) => p.feasibility === GOAL_FEASIBILITY.VIABLE).length;
  const attention = projections.filter((p) => p.feasibility === GOAL_FEASIBILITY.ATTENTION).length;
  const unviable = projections.filter((p) => p.feasibility === GOAL_FEASIBILITY.UNVIABLE).length;

  return { total, viable, attention, unviable };
}

export function calcAccumulatedBalance(currentBalance, monthlyNet, months) {
  if (!months || months <= 0) return safeNumber(currentBalance);
  return safeNumber(currentBalance) + safeNumber(monthlyNet) * months;
}

export function buildChartData(currentBalance, avgIncome, avgExpense, scenarioIds, horizon) {
  const points = [];

  for (let month = 0; month <= horizon; month++) {
    const label = month === 0 ? 'Hoje' : `Mês ${month}`;
    const scenarioPoints = { label };

    for (const sid of scenarioIds) {
      const { adjustedNet } = calcScenarioAdjustment(avgIncome, avgExpense, sid);
      const balance = calcAccumulatedBalance(currentBalance, adjustedNet, month);
      scenarioPoints[sid] = Math.round(balance * 100) / 100;
    }

    points.push(scenarioPoints);
  }

  return points;
}

function addMonths(date, count) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + count);
  return result;
}

function formatCurrencySimple(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}
