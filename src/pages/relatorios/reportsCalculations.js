// Logica pura de Relatorios: agrupamento mensal, medias, comparacao de
// periodo e sinais de atencao deterministicos. Sem dependencia de React/
// Supabase -- testavel via node --test. Escrita de forma independente
// (nao importa src/features/future) -- mesmo padrao de isolamento de
// dominio ja usado em todo o projeto (cada dominio duplica sua propria
// copia de logica conceitualmente semelhante, sem compartilhamento).

const GOAL_ACTIVE_STATUSES = ['active', 'paused'];

function safeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

/**
 * Extrai a chave YYYY-MM diretamente dos componentes da string de data,
 * sem passar por `new Date(dateValue)`. transaction_date e uma coluna
 * `date` (sem horario) -- interpretar a string via Date a colocaria em
 * UTC meia-noite, deslocando o mes para tras em fusos negativos (ex.:
 * Brasil). Mesma cautela ja aplicada em AgendaPage.jsx/toLocalDateKey e
 * projectFormUtils.js/formatProjectDate.
 */
function monthKey(dateValue) {
  if (typeof dateValue !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-\d{2}/.exec(dateValue);
  if (!match) return null;
  return `${match[1]}-${match[2]}`;
}

function monthLabel(key) {
  const [year, month] = key.split('-').map(Number);
  const date = new Date(year, month - 1, 1);
  return new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit' }).format(date);
}

/**
 * Agrupa transacoes por mes (chave YYYY-MM), soma receitas/despesas e
 * calcula o resultado (net) de cada mes. Retorna somente meses que
 * tiverem ao menos 1 transacao valida -- nunca preenche meses vazios com
 * zero. Ordenado cronologicamente ascendente e limitado aos ultimos
 * `monthsBack` meses com dado real.
 */
export function calcMonthlySeries(transactions = [], monthsBack = 6) {
  const monthlyMap = {};

  for (const t of transactions) {
    const key = monthKey(t?.transaction_date);
    if (!key) continue;

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

  const sortedKeys = Object.keys(monthlyMap).sort();
  const limitedKeys = sortedKeys.slice(Math.max(0, sortedKeys.length - monthsBack));

  return limitedKeys.map((key) => {
    const { income, expense } = monthlyMap[key];
    return {
      key,
      label: monthLabel(key),
      income,
      expense,
      net: income - expense,
    };
  });
}

/** Medias do periodo com dado real. monthsWithData conta apenas meses presentes na serie. */
export function calcMonthlyAverages(monthlySeries = []) {
  if (!monthlySeries.length) {
    return { avgIncome: 0, avgExpense: 0, avgNet: 0, monthsWithData: 0 };
  }

  const totals = monthlySeries.reduce(
    (acc, month) => ({
      income: acc.income + month.income,
      expense: acc.expense + month.expense,
    }),
    { income: 0, expense: 0 },
  );

  const count = monthlySeries.length;

  return {
    avgIncome: totals.income / count,
    avgExpense: totals.expense / count,
    avgNet: (totals.income - totals.expense) / count,
    monthsWithData: count,
  };
}

/**
 * Variacao percentual entre dois valores. `previous === 0` e tratado a
 * parte -- um percentual calculado sobre base zero e matematicamente
 * indefinido, entao retorna null (a UI deve exibir "-", nunca inventar um
 * numero). current === previous === 0 e o unico caso onde ambos zero
 * retorna 0 (sem variacao real).
 */
export function calcPercentChange(current, previous) {
  const currentValue = safeNumber(current);
  const previousValue = safeNumber(previous);

  if (previousValue === 0) {
    return currentValue === 0 ? 0 : null;
  }

  return ((currentValue - previousValue) / Math.abs(previousValue)) * 100;
}

/** Compara o net do ultimo mes da serie com o penultimo. Requer >=2 meses -- caso contrario, percentChange fica null. */
export function calcBalanceEvolutionIndicator(monthlySeries = []) {
  if (monthlySeries.length < 2) {
    const last = monthlySeries[0];
    return {
      currentNet: last ? last.net : 0,
      previousNet: null,
      percentChange: null,
    };
  }

  const current = monthlySeries[monthlySeries.length - 1];
  const previous = monthlySeries[monthlySeries.length - 2];

  return {
    currentNet: current.net,
    previousNet: previous.net,
    percentChange: calcPercentChange(current.net, previous.net),
  };
}

/** Compara a despesa do ultimo mes da serie com o penultimo. Requer >=2 meses -- caso contrario, percentChange fica null. */
export function calcExpenseVariationIndicator(monthlySeries = []) {
  if (monthlySeries.length < 2) {
    const last = monthlySeries[0];
    return {
      currentExpense: last ? last.expense : 0,
      previousExpense: null,
      percentChange: null,
    };
  }

  const current = monthlySeries[monthlySeries.length - 1];
  const previous = monthlySeries[monthlySeries.length - 2];

  return {
    currentExpense: current.expense,
    previousExpense: previous.expense,
    percentChange: calcPercentChange(current.expense, previous.expense),
  };
}

/**
 * Progresso medio das metas ativas/pausadas (current_amount / target_amount,
 * capado em 100% por meta -- uma meta que ultrapassou o alvo nao deve
 * inflar a media acima de 100%). Metas concluidas/canceladas nao entram
 * (ja fora do ciclo de acompanhamento ativo).
 */
export function calcGoalsProgressIndicator(goals = []) {
  const activeGoals = goals.filter((g) => GOAL_ACTIVE_STATUSES.includes(g?.status));

  if (!activeGoals.length) {
    return { averageProgress: 0, activeGoalsCount: 0 };
  }

  const totalProgress = activeGoals.reduce((sum, goal) => {
    const target = safeNumber(goal.target_amount);
    if (target <= 0) return sum;
    const progress = Math.min(1, safeNumber(goal.current_amount) / target);
    return sum + progress;
  }, 0);

  return {
    averageProgress: (totalProgress / activeGoals.length) * 100,
    activeGoalsCount: activeGoals.length,
  };
}

/**
 * Sinais de atencao 100% deterministicos, sem texto gerado: conta meses
 * recentes (ate 3, dos disponiveis na serie) com resultado negativo, e
 * metas ativas com prazo vencido e ainda nao concluidas. `reasons` sao
 * rotulos fixos (nao narrativa fabricada).
 */
export function calcAttentionSignals(monthlySeries = [], goals = []) {
  const recentMonths = monthlySeries.slice(-3);
  const negativeMonthsCount = recentMonths.filter((month) => month.net < 0).length;

  const today = new Date();
  const overdueGoalsCount = goals.filter((goal) => {
    if (!GOAL_ACTIVE_STATUSES.includes(goal?.status)) return false;
    if (!goal.target_date) return false;
    const targetDate = new Date(goal.target_date);
    if (Number.isNaN(targetDate.getTime())) return false;
    return targetDate < today && safeNumber(goal.current_amount) < safeNumber(goal.target_amount);
  }).length;

  const reasons = [];
  if (negativeMonthsCount > 0) {
    reasons.push(
      negativeMonthsCount === 1
        ? '1 mês recente com resultado negativo'
        : `${negativeMonthsCount} meses recentes com resultado negativo`,
    );
  }
  if (overdueGoalsCount > 0) {
    reasons.push(
      overdueGoalsCount === 1
        ? '1 meta com prazo vencido'
        : `${overdueGoalsCount} metas com prazo vencido`,
    );
  }

  return {
    count: negativeMonthsCount + overdueGoalsCount,
    reasons,
  };
}

/** Agregacao final consumida pelo hook -- orquestra as funcoes acima. */
export function buildReportsSnapshot({ transactions = [], goals = [], monthsBack = 6 } = {}) {
  const monthlySeries = calcMonthlySeries(transactions, monthsBack);
  const averages = calcMonthlyAverages(monthlySeries);
  const balanceEvolution = calcBalanceEvolutionIndicator(monthlySeries);
  const expenseVariation = calcExpenseVariationIndicator(monthlySeries);
  const goalsProgress = calcGoalsProgressIndicator(goals);
  const attentionSignals = calcAttentionSignals(monthlySeries, goals);

  return {
    monthlySeries,
    averages,
    balanceEvolution,
    expenseVariation,
    goalsProgress,
    attentionSignals,
  };
}
