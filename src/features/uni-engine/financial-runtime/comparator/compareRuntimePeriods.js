// Uni Engine — Runtime Conversacional Financeiro (Fase 17). Bloco 5:
 // Comparator Runtime.
 //
 // Compara métricas financeiras entre períodos usando o compareFinancialPeriods
 // da Fase 16 e adiciona comparações específicas do runtime.
 //
 // Tipos suportados:
 //   month_over_month      - Este mês vs mês passado
 //   year_over_year        - Este ano vs ano passado
 //   quarter_over_quarter  - Trimestre vs trimestre
 //   period_over_period    - Período customizado
 //   income_vs_expense     - Receitas vs despesas
 //   category_vs_category  - Categoria vs categoria
 //   account_vs_account    - Conta vs conta
 //   projected_vs_actual   - Projetado vs realizado

import { RUNTIME_COMPARISON_TYPES, isRuntimeComparisonType } from '../types/index.js';
import { compareFinancialPeriods } from '../../financial-conversational/period-comparison/index.js';
import { deepFreeze, roundMoney } from '../utils/shared.js';

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

export function compareRuntimePeriods(snapshot, periodA, periodB, comparisonType = 'month_over_month') {
  if (!snapshot || snapshot.hasData !== true) {
    return deepFreeze({
      version: '1.0',
      type: comparisonType,
      status: 'no_data',
      periodA: null,
      periodB: null,
      deltas: null,
      percentages: null,
      interpretation: null,
      serializable: true,
    });
  }

  if (!isRuntimeComparisonType(comparisonType)) {
    return deepFreeze({
      version: '1.0',
      type: comparisonType,
      status: 'invalid_type',
      error: 'Tipo de comparação não suportado',
      serializable: true,
    });
  }

  // Usar o comparador da Fase 16 para month_over_month, year_over_year, etc.
  if (['month_over_month', 'year_over_year', 'quarter_over_quarter', 'period_over_period'].includes(comparisonType)) {
    return deepFreeze(compareFinancialPeriods(snapshot, periodA, periodB, comparisonType));
  }

  // Comparações específicas do runtime
  switch (comparisonType) {
    case 'income_vs_expense': {
      const currentMonth = snapshot.currentMonth;
      const metrics = getPeriodMetrics(snapshot, currentMonth);
      if (!metrics) {
        return deepFreeze({
          version: '1.0',
          type: 'income_vs_expense',
          status: 'no_data',
          serializable: true,
        });
      }
      const delta = roundMoney(metrics.income - metrics.expense);
      const pct = metrics.expense !== 0 ? roundMoney((metrics.income - metrics.expense) / metrics.expense * 100) : null;
      return deepFreeze({
        version: '1.0',
        type: 'income_vs_expense',
        status: 'executed',
        period: currentMonth,
        income: metrics.income,
        expense: metrics.expense,
        delta,
        percentage: pct,
        interpretation: delta >= 0
          ? `Receita supera despesa em ${roundMoney(delta)} (${pct !== null ? pct + '%' : ''})`
          : `Despesa supera receita em ${roundMoney(Math.abs(delta))} (${pct !== null ? Math.abs(pct) + '%' : ''})`,
        serializable: true,
      });
    }

    case 'category_vs_category': {
      const categories = snapshot.expenses?.byCategory ?? [];
      if (categories.length < 2) {
        return deepFreeze({
          version: '1.0',
          type: 'category_vs_category',
          status: 'insufficient_data',
          serializable: true,
        });
      }
      const top = categories[0];
      const second = categories[1];
      const delta = roundMoney(top.spent - second.spent);
      const pct = second.spent !== 0 ? roundMoney((top.spent - second.spent) / second.spent * 100) : null;
      return deepFreeze({
        version: '1.0',
        type: 'category_vs_category',
        status: 'executed',
        period: snapshot.currentMonth,
        categoryA: { name: top.name, spent: roundMoney(top.spent) },
        categoryB: { name: second.name, spent: roundMoney(second.spent) },
        delta,
        percentage: pct,
        interpretation: `"${top.name}" foi ${delta >= 0 ? 'maior' : 'menor'} que "${second.name}" em ${Math.abs(delta)}${pct !== null ? ` (${pct}%)` : ''}`,
        serializable: true,
      });
    }

    case 'account_vs_account': {
      const accounts = snapshot.balance?.byAccount ?? [];
      const activeAccounts = accounts.filter(a => a.balance !== 0);
      if (activeAccounts.length < 2) {
        return deepFreeze({
          version: '1.0',
          type: 'account_vs_account',
          status: 'insufficient_data',
          serializable: true,
        });
      }
      const sorted = [...activeAccounts].sort((a, b) => b.balance - a.balance);
      const top = sorted[0];
      const second = sorted[1];
      const delta = roundMoney(top.balance - second.balance);
      return deepFreeze({
        version: '1.0',
        type: 'account_vs_account',
        status: 'executed',
        period: snapshot.currentMonth,
        accountA: { name: top.name, balance: roundMoney(top.balance), type: top.type },
        accountB: { name: second.name, balance: roundMoney(second.balance), type: second.type },
        delta,
        interpretation: `${top.name} (${roundMoney(top.balance)}) ${delta >= 0 ? 'supera' : 'fica abaixo de'} ${second.name} (${roundMoney(second.balance)}) em ${Math.abs(delta)}`,
        serializable: true,
      });
    }

    case 'projected_vs_actual': {
      // Comparar projeção (se houver) vs realizado
      // Por enquanto retorna estrutura base
      return deepFreeze({
        version: '1.0',
        type: 'projected_vs_actual',
        status: 'not_implemented',
        serializable: true,
      });
    }

    default:
      return deepFreeze({
        version: '1.0',
        type: comparisonType,
        status: 'unsupported',
        serializable: true,
      });
  }
}

export function compareMultipleRuntimePeriods(snapshot, periods, comparisonType = 'month_over_month') {
  if (periods.length < 2) return null;

  const comparisons = [];
  for (let i = 1; i < periods.length; i++) {
    const comparison = compareRuntimePeriods(snapshot, periods[i], periods[i - 1], comparisonType);
    comparisons.push(comparison);
  }

  return deepFreeze({
    version: '1.0',
    comparisonType,
    comparisons,
    serializable: true,
  });
}

export function getSupportedComparisonTypes() {
  return [...RUNTIME_COMPARISON_TYPES];
}

export function isValidComparisonType(type) {
  return isRuntimeComparisonType(type);
}