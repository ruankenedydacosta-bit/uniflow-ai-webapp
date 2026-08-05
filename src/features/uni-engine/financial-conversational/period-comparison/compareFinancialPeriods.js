// Uni Engine — Inteligência Financeira Conversacional (Fase 16). Bloco 5:
// Comparador de Períodos.
//
// compareFinancialPeriods(snapshot, periodA, periodB, comparisonType) compara
// métricas financeiras entre dois períodos. Suporta:
// - month_over_month (mês a mês)
// - year_over_year (ano a ano)
// - quarter_over_quarter (trimestre a trimestre)
// - period_over_period (período customizado)
// - rolling_window (janela deslizante)
// - trend_analysis (análise de tendência)
//
// Tudo shadow-only, serializável, sem efeitos.

import { TEMPORAL_COMPARISON_TYPES, isTemporalComparisonType } from '../types/index.js';
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

function getPeriodMetrics(snapshot, periodKey) {
  if (!snapshot?.flow?.months) return null;
  const month = snapshot.flow.months.find(m => m.month === periodKey);
  if (!month) return null;
  return {
    income: month.income,
    expense: month.expense,
    result: month.result,
    transactionCount: month.transactionCount,
  };
}

function calculateDeltas(current, comparison) {
  if (!current || !comparison) return null;
  return {
    income: roundMoney(current.income - comparison.income),
    expense: roundMoney(current.expense - comparison.expense),
    result: roundMoney(current.result - comparison.result),
    transactionCount: current.transactionCount - comparison.transactionCount,
  };
}

function calculatePercentages(current, comparison) {
  if (!current || !comparison) return null;
  return {
    income: comparison.income !== 0 ? roundMoney((current.income - comparison.income) / comparison.income * 100) : null,
    expense: comparison.expense !== 0 ? roundMoney((current.expense - comparison.expense) / comparison.expense * 100) : null,
    result: comparison.result !== 0 ? roundMoney((current.result - comparison.result) / comparison.result * 100) : null,
  };
}

function calculateRollingAverage(flow, endMonthKey, windowSize) {
  const months = flow.filter(m => {
    const mKey = m.month;
    return mKey <= endMonthKey;
  }).slice(-windowSize);

  if (months.length === 0) return null;

  const avgIncome = roundMoney(months.reduce((sum, m) => sum + m.income, 0) / months.length);
  const avgExpense = roundMoney(months.reduce((sum, m) => sum + m.expense, 0) / months.length);
  const avgResult = roundMoney(months.reduce((sum, m) => sum + m.result, 0) / months.length);

  return { avgIncome, avgExpense, avgResult, monthsCount: months.length };
}

function detectTrend(flow, metric, windowSize = 6) {
  const recent = flow.slice(-windowSize).map(m => m[metric]);
  if (recent.length < 3) return { direction: 'insufficient_data', slope: 0, consistency: 0 };

  const n = recent.length;
  const x = Array.from({ length: n }, (_, i) => i);
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = recent.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * recent[i], 0);
  const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const direction = slope > 0.01 ? 'increasing' : slope < -0.01 ? 'decreasing' : 'stable';
  const changes = recent.slice(1).map((v, i) => Math.sign(v - recent[i]));
  const consistency = changes.filter(c => c === Math.sign(slope)).length / changes.length;

  return { direction, slope: roundMoney(slope), consistency: roundMoney(consistency) };
}

export function compareFinancialPeriods(snapshot, periodA, periodB, comparisonType = 'month_over_month') {
  if (!snapshot || snapshot.hasData !== true) {
    return deepFreeze({
      version: '1.0',
      status: 'no_data',
      comparisonType,
      periodA: null,
      periodB: null,
      deltas: null,
      percentages: null,
      serializable: true,
    });
  }

  if (!isTemporalComparisonType(comparisonType)) {
    return deepFreeze({
      version: '1.0',
      status: 'invalid_comparison_type',
      comparisonType,
      error: 'Tipo de comparação não suportado',
      serializable: true,
    });
  }

  let metricsA = null;
  let metricsB = null;
  let labelA = periodA;
  let labelB = periodB;

  switch (comparisonType) {
    case 'month_over_month': {
      metricsA = getPeriodMetrics(snapshot, periodA);
      metricsB = getPeriodMetrics(snapshot, periodB);
      break;
    }
    case 'year_over_year': {
      const [yearA] = periodA.split('-');
      const [yearB] = periodB.split('-');
      const month = periodA.split('-')[1];
      metricsA = getPeriodMetrics(snapshot, `${yearA}-${month}`);
      metricsB = getPeriodMetrics(snapshot, `${yearB}-${month}`);
      labelA = `${month}/${yearA}`;
      labelB = `${month}/${yearB}`;
      break;
    }
    case 'quarter_over_quarter': {
      const quartersA = getQuarterMonths(periodA);
      const quartersB = getQuarterMonths(periodB);
      metricsA = aggregateQuarter(snapshot, quartersA);
      metricsB = aggregateQuarter(snapshot, quartersB);
      labelA = `T${getQuarterNumber(periodA)}/${periodA.split('-')[0]}`;
      labelB = `T${getQuarterNumber(periodB)}/${periodB.split('-')[0]}`;
      break;
    }
    case 'rolling_window': {
      const windowA = getRollingWindow(snapshot, periodA, 3);
      const windowB = getRollingWindow(snapshot, periodB, 3);
      metricsA = windowA;
      metricsB = windowB;
      labelA = `Janela até ${periodA}`;
      labelB = `Janela até ${periodB}`;
      break;
    }
    case 'trend_analysis': {
      return deepFreeze({
        version: '1.0',
        status: 'executed',
        comparisonType: 'trend_analysis',
        period: periodA,
        trends: {
          income: detectTrend(snapshot.flow.months, 'income'),
          expense: detectTrend(snapshot.flow.months, 'expense'),
          result: detectTrend(snapshot.flow.months, 'result'),
        },
        serializable: true,
      });
    }
  }

  if (!metricsA || !metricsB) {
    return deepFreeze({
      version: '1.0',
      status: 'partial_data',
      comparisonType,
      periodA: labelA,
      periodB: labelB,
      metricsA,
      metricsB,
      deltas: null,
      percentages: null,
      serializable: true,
    });
  }

  const deltas = calculateDeltas(metricsA, metricsB);
  const percentages = calculatePercentages(metricsA, metricsB);

  const result = deepFreeze({
    version: '1.0',
    status: 'executed',
    comparisonType,
    periodA: { key: periodA, label: labelA, metrics: metricsA },
    periodB: { key: periodB, label: labelB, metrics: metricsB },
    deltas,
    percentages,
    interpretation: interpretComparison(deltas, percentages),
    serializable: true,
  });

  if (!isSerializableValue(result)) {
    return deepFreeze({
      version: '1.0',
      status: 'error_safe',
      comparisonType,
      error: 'result_not_serializable',
      serializable: true,
    });
  }

  return result;
}

function getQuarterMonths(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  const quarter = Math.ceil(month / 3);
  const startMonth = (quarter - 1) * 3 + 1;
  return Array.from({ length: 3 }, (_, i) => `${year}-${String(startMonth + i).padStart(2, '0')}`);
}

function getQuarterNumber(monthKey) {
  const month = parseInt(monthKey.split('-')[1], 10);
  return Math.ceil(month / 3);
}

function aggregateQuarter(snapshot, months) {
  let income = 0, expense = 0, result = 0, count = 0;
  for (const m of months) {
    const metrics = getPeriodMetrics(snapshot, m);
    if (metrics) {
      income += metrics.income;
      expense += metrics.expense;
      result += metrics.result;
      count += metrics.transactionCount;
    }
  }
  return count > 0 ? { income, expense, result, transactionCount: count } : null;
}

function getRollingWindow(snapshot, endMonthKey, windowSize = 3) {
  return calculateRollingAverage(snapshot.flow.months, endMonthKey, windowSize);
}

function interpretComparison(deltas, percentages) {
  if (!deltas || !percentages) return { summary: 'Dados insuficientes para interpretação' };

  const insights = [];

  if (percentages.income !== null) {
    if (percentages.income > 10) insights.push(`Receita subiu ${percentages.income}%`);
    else if (percentages.income < -10) insights.push(`Receita caiu ${Math.abs(percentages.income)}%`);
    else insights.push(`Receita estável (${percentages.income > 0 ? '+' : ''}${percentages.income}%)`);
  }

  if (percentages.expense !== null) {
    if (percentages.expense > 10) insights.push(`Despesa subiu ${percentages.expense}%`);
    else if (percentages.expense < -10) insights.push(`Despesa caiu ${Math.abs(percentages.expense)}%`);
    else insights.push(`Despesa estável (${percentages.expense > 0 ? '+' : ''}${percentages.expense}%)`);
  }

  if (percentages.result !== null) {
    if (percentages.result > 20) insights.push(`Resultado melhorou ${percentages.result}%`);
    else if (percentages.result < -20) insights.push(`Resultado piorou ${Math.abs(percentages.result)}%`);
    else insights.push(`Resultado estável (${percentages.result > 0 ? '+' : ''}${percentages.result}%)`);
  }

  return { summary: insights.join('; ') };
}

export function compareMultiplePeriods(snapshot, periods, comparisonType = 'month_over_month') {
  if (periods.length < 2) return null;

  const comparisons = [];
  for (let i = 1; i < periods.length; i++) {
    const comparison = compareFinancialPeriods(snapshot, periods[i], periods[i - 1], comparisonType);
    comparisons.push(comparison);
  }

  return deepFreeze({
    version: '1.0',
    comparisonType,
    comparisons,
    serializable: true,
  });
}