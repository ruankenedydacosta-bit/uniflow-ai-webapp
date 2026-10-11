const COMPLETED_STATUS = 'completed';

export function getCompletedTransactions(transactions = []) {
  return transactions.filter((transaction) => transaction?.status === COMPLETED_STATUS);
}

export function getGoalProgress(goal) {
  const target = Number(goal?.target_amount) || 0;
  if (target <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((Number(goal?.current_amount || 0) / target) * 100)));
}

export function getPeriodTotals(financialPeriod = {}) {
  const data = financialPeriod?.chart?.data ?? [];
  const lastPoint = data[data.length - 1] ?? {};

  return {
    income: Number(lastPoint.receita) || 0,
    expense: Number(lastPoint.despesa) || 0,
  };
}

export function buildSignalCandidates({
  balance,
  financialPeriod,
  goals = [],
  hasTransactions,
} = {}) {
  const { income, expense } = getPeriodTotals(financialPeriod);
  const comparisonPercent = financialPeriod?.chart?.comparisonMeta?.deltaPercent;
  const topCategory = financialPeriod?.categories?.[0] ?? null;
  const activeGoals = goals.filter((goal) => goal?.status === 'active');
  const leadingGoal = [...activeGoals].sort((left, right) => getGoalProgress(right) - getGoalProgress(left))[0];
  const signals = [];

  if (balance < 0) {
    signals.push({
      id: 'negative-balance',
      title: 'Movimentações pedem atenção',
      label: 'Revisar movimentações',
      description: 'A leitura derivada indica que vale revisar os lançamentos confirmados.',
      status: 'Atenção',
      variant: 'warning',
      tone: 'warning',
      icon: '!',
      href: '/financeiro',
      priority: 100,
    });
  }

  if (expense > income && expense > 0) {
    signals.push({
      id: 'expenses-above-income',
      title: 'Saídas acima das entradas',
      label: 'Saídas acima das entradas',
      description: 'No período atual, as saídas confirmadas estão acima das entradas confirmadas.',
      status: 'Revisar',
      variant: 'warning',
      tone: 'warning',
      icon: '!',
      href: '/financeiro',
      priority: 90,
    });
  }

  if (Number.isFinite(comparisonPercent) && comparisonPercent >= 10) {
    signals.push({
      id: 'expense-growth',
      title: 'Saídas cresceram no período',
      label: `Saídas subiram ${comparisonPercent}%`,
      description: `As saídas confirmadas estão ${comparisonPercent}% acima do período anterior.`,
      status: 'Comparar',
      variant: 'warning',
      tone: 'warning',
      icon: '↑',
      href: '/financeiro',
      priority: 80,
    });
  } else if (Number.isFinite(comparisonPercent) && comparisonPercent <= -10) {
    signals.push({
      id: 'expense-reduction',
      title: 'Saídas diminuíram no período',
      label: `Saídas caíram ${Math.abs(comparisonPercent)}%`,
      description: `As saídas confirmadas estão ${Math.abs(comparisonPercent)}% abaixo do período anterior.`,
      status: 'Oportunidade',
      variant: 'success',
      tone: 'success',
      icon: '↓',
      href: '/financeiro',
      priority: 60,
    });
  }

  if (topCategory?.percent >= 50) {
    signals.push({
      id: 'category-concentration',
      title: 'Saída concentrada em uma categoria',
      label: `${topCategory.label}: ${topCategory.percent}%`,
      description: `${topCategory.label} representa ${topCategory.percent}% das saídas confirmadas do período.`,
      status: 'Observar',
      variant: 'secondary',
      tone: 'neutral',
      icon: '%',
      href: '/financeiro',
      priority: 50,
    });
  }

  if (leadingGoal && getGoalProgress(leadingGoal) >= 80) {
    const progress = getGoalProgress(leadingGoal);
    signals.push({
      id: 'goal-progress',
      title: 'Meta próxima do objetivo',
      label: `${leadingGoal.name}: ${progress}%`,
      description: `${leadingGoal.name} chegou a ${progress}% do valor definido.`,
      status: 'Progresso',
      variant: 'success',
      tone: 'success',
      icon: '✓',
      href: '/metas',
      priority: 40,
    });
  }

  if (!hasTransactions && activeGoals.length === 0) {
    signals.push({
      id: 'building-history',
      title: 'Base financeira em construção',
      label: 'Base financeira em construção',
      description: 'Registre movimentações ou uma meta para formar uma leitura financeira útil.',
      status: 'Começar',
      variant: 'secondary',
      tone: 'neutral',
      icon: '+',
      href: '/financeiro',
      priority: 30,
    });
  }

  return signals
    .sort((left, right) => right.priority - left.priority)
    .slice(0, 3);
}
