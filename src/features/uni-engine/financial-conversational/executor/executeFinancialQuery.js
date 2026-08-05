// Uni Engine — Inteligência Financeira Conversacional (Fase 16). Bloco 4:
// Executor Financeiro (Shadow).
//
// executeFinancialQuery(plan, snapshot, enrichedContext) executa o plano
// de consulta em modo shadow: lê dados do snapshot, calcula resultados,
// mas NUNCA escreve, NUNCA persiste, NUNCA chama serviços externos.
//
// Retorna resultado serializável com status, dados e evidências.

import { FINANCIAL_EXECUTOR_STATUS, isFinancialExecutorStatus } from '../types/index.js';
import { isSerializableValue } from '../../uniEngineContracts.js';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    return Object.freeze(value.map(deepFreeze));
  }
  const frozen = {};
  for (const key of Object.keys(value).sort()) {
    frozen[key] = deepFreeze(value[key]);
  }
  return Object.freeze(frozen);
}

function roundMoney(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * 100) / 100;
}

function safeGet(obj, path, defaultValue = null) {
  if (!obj || typeof obj !== 'object') return defaultValue;
  const keys = path.split('.');
  let current = obj;
  for (const key of keys) {
    if (current === null || current === undefined) return defaultValue;
    current = current[key];
  }
  return current !== undefined && current !== null ? current : defaultValue;
}

function executeSingleMetric(plan, snapshot, enrichedContext) {
  const focus = plan.requiredMetrics[0];
  const value = safeGet(enrichedContext, `metrics.${focus}`);
  const temporalValue = plan.temporalPeriod
    ? safeGet(enrichedContext, `temporal.context.metrics.${focus.toLowerCase().replace('monthly', '').replace('total', '')}`)
    : null;

  return {
    status: value !== null ? 'executed' : 'no_data',
    primaryValue: roundMoney(value ?? 0),
    temporalValue: temporalValue !== null ? roundMoney(temporalValue) : null,
    metric: focus,
    label: getMetricLabel(focus),
    unit: 'BRL',
    evidence: [`snapshot.${focus}`],
  };
}

function executeBreakdown(plan, snapshot, enrichedContext) {
  const { expenses, income } = snapshot;
  const breakdownType = plan.intentType === 'category_breakdown_query' ? 'category'
    : plan.intentType === 'account_query' ? 'account'
    : plan.intentType === 'recurring_query' ? 'recurring'
    : 'category';

  let items = [];
  if (breakdownType === 'category' && expenses?.byCategory) {
    items = expenses.byCategory
      .slice(0, 10)
      .map(c => ({ name: c.name, value: roundMoney(c.spent), id: c.id }));
  } else if (breakdownType === 'account' && snapshot.balance?.byAccount) {
    items = snapshot.balance.byAccount
      .filter(a => a.balance !== 0)
      .map(a => ({ name: a.name, value: roundMoney(a.balance), id: a.id, type: a.type }));
  } else if (breakdownType === 'recurring' && snapshot.recurring) {
    items = snapshot.recurring
      .map(r => ({ name: r.description, value: roundMoney(r.amount), id: r.id, type: r.transactionType }));
  }

  return {
    status: items.length > 0 ? 'executed' : 'no_data',
    breakdownType,
    items,
    total: roundMoney(items.reduce((sum, i) => sum + (i.value ?? 0), 0)),
    evidence: [`snapshot.${breakdownType === 'category' ? 'expenses.byCategory' : breakdownType === 'account' ? 'balance.byAccount' : 'recurring'}`],
  };
}

function executeComparison(plan, snapshot, enrichedContext) {
  const temporal = enrichedContext?.temporal?.context;
  if (!temporal?.periodKey) {
    return { status: 'no_data', comparisonType: 'period_over_period', evidence: [] };
  }

  const currentMonth = snapshot.currentMonth;
  const comparisonMonth = temporal.periodKey;
  const flow = snapshot.flow?.months ?? [];

  const current = flow.find(m => m.month === currentMonth);
  const comparison = flow.find(m => m.month === comparisonMonth);

  if (!current || !comparison) {
    return { status: 'partial_data', comparisonType: 'period_over_period', evidence: ['snapshot.flow.months'] };
  }

  const incomeDelta = roundMoney(current.income - comparison.income);
  const expenseDelta = roundMoney(current.expense - comparison.expense);
  const resultDelta = roundMoney(current.result - comparison.result);
  const incomePct = comparison.income !== 0 ? roundMoney((incomeDelta / comparison.income) * 100) : null;
  const expensePct = comparison.expense !== 0 ? roundMoney((expenseDelta / comparison.expense) * 100) : null;
  const resultPct = comparison.result !== 0 ? roundMoney((resultDelta / comparison.result) * 100) : null;

  return {
    status: 'executed',
    comparisonType: 'month_over_month',
    currentPeriod: { month: current.month, income: current.income, expense: current.expense, result: current.result },
    comparisonPeriod: { month: comparison.month, income: comparison.income, expense: comparison.expense, result: comparison.result },
    deltas: { income: incomeDelta, expense: expenseDelta, result: resultDelta },
    percentages: { income: incomePct, expense: expensePct, result: resultPct },
    evidence: ['snapshot.flow.months'],
  };
}

function executeProjection(plan, snapshot, enrichedContext) {
  const flow = snapshot.flow?.months ?? [];
  if (flow.length < 2) {
    return { status: 'no_data', evidence: ['snapshot.flow.months'] };
  }

  const recentFlows = flow.slice(-6);
  const incomeValues = recentFlows.map(m => m.income);
  const expenseValues = recentFlows.map(m => m.expense);
  const resultValues = recentFlows.map(m => m.result);

  const incomeTrend = calculateLinearTrend(incomeValues);
  const expenseTrend = calculateLinearTrend(expenseValues);
  const resultTrend = calculateLinearTrend(resultValues);

  const projections = [];
  const lastMonth = recentFlows[recentFlows.length - 1].month;
  for (let i = 1; i <= 3; i++) {
    const nextMonth = addMonths(lastMonth, i);
    const projectedIncome = roundMoney(incomeValues[incomeValues.length - 1] + incomeTrend.slope * i);
    const projectedExpense = roundMoney(expenseValues[expenseValues.length - 1] + expenseTrend.slope * i);
    const projectedResult = roundMoney(projectedIncome - projectedExpense);
    projections.push({
      month: nextMonth,
      income: Math.max(0, projectedIncome),
      expense: Math.max(0, projectedExpense),
      result: projectedResult,
    });
  }

  const confidence = Math.min(0.8, 0.3 + (incomeTrend.r2 + expenseTrend.r2) / 2 * 0.5);

  return {
    status: 'executed',
    projectionType: 'linear_trend',
    projections,
    trends: { income: incomeTrend, expense: expenseTrend, result: resultTrend },
    confidence,
    evidence: ['snapshot.flow.months'],
  };
}

function executeSearch(plan, snapshot, enrichedContext) {
  const intent = enrichedContext?.intent?.context;
  const entities = intent?.entities ?? [];
  const amountEntity = entities.find(e => e.type === 'amount');
  const descriptionEntity = entities.find(e => e.type === 'description');
  const categoryEntity = entities.find(e => e.type === 'category');

  const transactions = snapshot.latestEvents ?? [];
  let results = transactions;

  if (amountEntity?.value) {
    const targetAmount = roundMoney(amountEntity.value);
    results = results.filter(t => roundMoney(t.amount) === targetAmount);
  }
  if (descriptionEntity?.value) {
    const query = String(descriptionEntity.value).toLowerCase();
    results = results.filter(t => (t.description ?? '').toLowerCase().includes(query));
  }
  if (categoryEntity?.value) {
    const catName = String(categoryEntity.value).toLowerCase();
    results = results.filter(t => (t.categoryName ?? '').toLowerCase().includes(catName));
  }

  results = results.slice(0, 10).map(t => ({
    id: t.id,
    date: t.date,
    description: t.description,
    amount: roundMoney(t.amount),
    type: t.type,
    category: t.categoryName,
    account: t.accountName,
  }));

  return {
    status: results.length > 0 ? 'executed' : 'no_data',
    searchType: 'transaction_search',
    results,
    criteria: { amount: amountEntity?.value, description: descriptionEntity?.value, category: categoryEntity?.value },
    evidence: ['snapshot.latestEvents'],
  };
}

function executeHealthCheck(plan, snapshot, enrichedContext) {
  const metrics = enrichedContext?.metrics ?? {};
  const diagnostics = [];

  if (metrics.totalBalance < 0) diagnostics.push({ type: 'negative_balance', severity: 'critical', value: metrics.totalBalance });
  if (metrics.liquidBalance < metrics.monthlyExpense) diagnostics.push({ type: 'cash_risk', severity: 'high', value: metrics.liquidBalance });
  if (metrics.creditUtilization > 0.8) diagnostics.push({ type: 'credit_dependence', severity: 'high', value: metrics.creditUtilization });
  if (metrics.savingsRate < 0.1) diagnostics.push({ type: 'low_savings_rate', severity: 'medium', value: metrics.savingsRate });
  if (metrics.reserveCoverage < 1) diagnostics.push({ type: 'insufficient_reserve', severity: 'medium', value: metrics.reserveCoverage });
  if (metrics.lateGoalsCount > 0) diagnostics.push({ type: 'delayed_goals', severity: 'high', value: metrics.lateGoalsCount });

  const healthScore = calculateHealthScore(metrics, diagnostics);

  return {
    status: 'executed',
    healthScore,
    diagnostics,
    metrics: {
      totalBalance: metrics.totalBalance,
      monthlyIncome: metrics.monthlyIncome,
      monthlyExpense: metrics.monthlyExpense,
      monthlyResult: metrics.monthlyResult,
      savingsRate: metrics.savingsRate,
      liquidBalance: metrics.liquidBalance,
      netPatrimony: metrics.netPatrimony,
      creditUtilization: metrics.creditUtilization,
      reserveCoverage: metrics.reserveCoverage,
    },
    evidence: ['snapshot.balance', 'snapshot.income', 'snapshot.expenses', 'snapshot.result', 'snapshot.patrimony', 'snapshot.reserve', 'snapshot.goals', 'snapshot.creditCards'],
  };
}

function executeGoalTracking(plan, snapshot, enrichedContext) {
  const goals = snapshot.goals ?? [];
  if (goals.length === 0) {
    return { status: 'no_data', goals: [], evidence: ['snapshot.goals'] };
  }

  const goalData = goals.map(g => ({
    id: g.id,
    name: g.name,
    target: roundMoney(g.target),
    current: roundMoney(g.current),
    progress: g.progress,
    remaining: roundMoney(g.remaining),
    rhythm: g.rhythm,
    targetDate: g.targetDate,
    monthlyContribution: roundMoney(g.plannedMonthlyAmount ?? 0),
  }));

  return {
    status: 'executed',
    goals: goalData,
    summary: {
      total: goals.length,
      onTrack: goals.filter(g => g.rhythm === 'on_track').length,
      late: goals.filter(g => g.rhythm === 'late').length,
      completed: goals.filter(g => g.rhythm === 'complete').length,
      totalTarget: roundMoney(goals.reduce((sum, g) => sum + (g.target ?? 0), 0)),
      totalCurrent: roundMoney(goals.reduce((sum, g) => sum + (g.current ?? 0), 0)),
    },
    evidence: ['snapshot.goals'],
  };
}

function executeMultiMetric(plan, snapshot, enrichedContext) {
  const metrics = enrichedContext?.metrics ?? {};
  return {
    status: 'executed',
    metrics: {
      totalBalance: metrics.totalBalance,
      monthlyIncome: metrics.monthlyIncome,
      monthlyExpense: metrics.monthlyExpense,
      monthlyResult: metrics.monthlyResult,
      savingsRate: metrics.savingsRate,
      liquidBalance: metrics.liquidBalance,
      netPatrimony: metrics.netPatrimony,
      creditUtilization: metrics.creditUtilization,
      reserveCoverage: metrics.reserveCoverage,
      investmentBalance: metrics.investmentBalance,
    },
    evidence: ['snapshot.balance', 'snapshot.income', 'snapshot.expenses', 'snapshot.result', 'snapshot.patrimony', 'snapshot.reserve'],
  };
}

function calculateLinearTrend(values) {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] ?? 0, r2: 0 };
  const x = Array.from({ length: n }, (_, i) => i);
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = values.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * values[i], 0);
  const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
  const sumY2 = values.reduce((sum, yi) => sum + yi * yi, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  const r2 = n > 2 ? Math.pow((n * sumXY - sumX * sumY) / Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY)), 2) : 0;
  return { slope: roundMoney(slope), intercept: roundMoney(intercept), r2: roundMoney(r2) };
}

function addMonths(monthKey, delta) {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function calculateHealthScore(metrics, diagnostics) {
  let score = 100;
  for (const d of diagnostics) {
    if (d.severity === 'critical') score -= 30;
    else if (d.severity === 'high') score -= 15;
    else if (d.severity === 'medium') score -= 8;
    else if (d.severity === 'low') score -= 3;
  }
  if (metrics.savingsRate >= 0.2) score += 10;
  if (metrics.reserveCoverage >= 3) score += 10;
  if (metrics.creditUtilization === 0) score += 5;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function getMetricLabel(metric) {
  const labels = {
    totalBalance: 'Saldo total',
    monthlyIncome: 'Receita mensal',
    monthlyExpense: 'Despesa mensal',
    monthlyResult: 'Resultado mensal',
    savingsRate: 'Taxa de poupança',
    liquidBalance: 'Liquidez imediata',
    netPatrimony: 'Patrimônio líquido',
    creditUtilization: 'Uso de crédito',
    investmentBalance: 'Investimentos',
    reserveCoverage: 'Cobertura de reserva',
    goalsCount: 'Metas ativas',
  };
  return labels[metric] ?? metric;
}

const EXECUTORS = Object.freeze({
  single_metric: executeSingleMetric,
  breakdown: executeBreakdown,
  comparison: executeComparison,
  projection: executeProjection,
  search: executeSearch,
  health_check: executeHealthCheck,
  multi_metric: executeMultiMetric,
  goal_tracking: executeGoalTracking,
});

export function executeFinancialQuery(plan, snapshot, enrichedContext) {
  if (!plan || !plan.type || !EXECUTORS[plan.type]) {
    return deepFreeze({
      version: '1.0',
      status: 'out_of_scope',
      data: null,
      planType: plan?.type ?? 'unknown',
      evidence: [],
      serializable: true,
    });
  }

  if (!snapshot || snapshot.hasData !== true) {
    return deepFreeze({
      version: '1.0',
      status: 'no_data',
      data: null,
      planType: plan.type,
      evidence: [],
      serializable: true,
    });
  }

  const executor = EXECUTORS[plan.type];
  let executionData = null;
  let status = 'error_safe';

  try {
    executionData = executor(plan, snapshot, enrichedContext);
    status = executionData?.status ?? 'error_safe';
  } catch {
    status = 'error_safe';
    executionData = { error: 'execution_failed' };
  }

  const result = {
    version: '1.0',
    status: isFinancialExecutorStatus(status) ? status : 'error_safe',
    planType: plan.type,
    data: executionData,
    evidence: executionData?.evidence ?? [],
    serializable: true,
  };

  if (!isSerializableValue(result)) {
    return deepFreeze({
      version: '1.0',
      status: 'error_safe',
      planType: plan.type,
      data: null,
      evidence: [],
      error: 'result_not_serializable',
      serializable: true,
    });
  }

  return deepFreeze(result);
}