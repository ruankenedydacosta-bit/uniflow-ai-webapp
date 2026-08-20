const CURRENCY_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const MONTH_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
  month: 'long',
  year: 'numeric',
});

const DATE_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
});

const ACCOUNT_TYPE_LABELS = Object.freeze({
  checking: 'Conta corrente',
  savings: 'Poupança',
  payment: 'Conta de pagamento',
  cash: 'Dinheiro',
  investment: 'Investimento',
  credit_card: 'Cartão de crédito',
  other: 'Outra conta',
});

const COLORS = Object.freeze(['violet', 'green', 'cyan']);
const CATEGORY_COLORS = Object.freeze(['cyan', 'violet', 'green']);

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateKey(value) {
  const [year, month, day] = String(value).split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

function addDays(date, amount) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function differenceInDays(start, end) {
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

export function getFinancialPeriod({ mode = 'Mês', offset = 0, now = new Date() } = {}) {
  if (mode === 'Semana') {
    const dayOfWeek = now.getDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday + (offset * 7), 12);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 12);
    const effectiveEnd = offset === 0 && now < end ? now : end;

    return {
      start,
      end,
      effectiveEnd,
      startKey: toDateKey(start),
      endKey: toDateKey(end),
      label: `${String(start.getDate()).padStart(2, '0')}/${String(start.getMonth() + 1).padStart(2, '0')} a ${String(end.getDate()).padStart(2, '0')}/${String(end.getMonth() + 1).padStart(2, '0')}`,
    };
  }

  if (mode === 'Trimestre') {
    const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
    const start = new Date(now.getFullYear(), quarterMonth + (offset * 3), 1, 12);
    const end = new Date(start.getFullYear(), start.getMonth() + 3, 0, 12);
    const effectiveEnd = offset === 0 && now < end ? now : end;
    const quarterNumber = Math.floor(start.getMonth() / 3) + 1;

    return {
      start,
      end,
      effectiveEnd,
      startKey: toDateKey(start),
      endKey: toDateKey(end),
      label: `${quarterNumber}º trimestre de ${start.getFullYear()}`,
    };
  }

  const isYear = mode === 'Ano';
  const start = isYear
    ? new Date(now.getFullYear() + offset, 0, 1, 12)
    : new Date(now.getFullYear(), now.getMonth() + offset, 1, 12);
  const end = isYear
    ? new Date(start.getFullYear(), 11, 31, 12)
    : new Date(start.getFullYear(), start.getMonth() + 1, 0, 12);
  const effectiveEnd = offset === 0 && now < end ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12) : end;

  return {
    start,
    end,
    effectiveEnd,
    startKey: toDateKey(start),
    endKey: toDateKey(end),
    label: isYear
      ? String(start.getFullYear())
      : MONTH_FORMATTER.format(start).replace(/^./, (letter) => letter.toUpperCase()),
  };
}

// HOME-GRAPH1: exportadas (sem nenhuma mudança de lógica) para reuso pelo
// gráfico financeiro da Home -- mesma matemática de período/série
// acumulada, uma única fonte, nunca duplicada.
export function isCompleted(transaction) {
  return transaction?.status === 'completed';
}

export function selectPeriodTransactions(transactions, period) {
  return transactions.filter((transaction) =>
    isCompleted(transaction)
      && transaction.transaction_date >= period.startKey
      && transaction.transaction_date <= period.endKey);
}

export function totalByType(transactions, type) {
  return transactions
    .filter((transaction) => transaction.transaction_type === type)
    .reduce((total, transaction) => total + Number(transaction.amount || 0), 0);
}

export function buildCumulativeSeries(transactions, period) {
  const maxDay = Math.max(1, differenceInDays(period.start, period.effectiveEnd) + 1);
  const pointDays = new Set([1, maxDay]);
  transactions.forEach((transaction) => {
    const date = parseDateKey(transaction.transaction_date);
    pointDays.add(Math.min(maxDay, Math.max(1, differenceInDays(period.start, date) + 1)));
  });

  return [...pointDays].sort((left, right) => left - right).map((day) => {
    const pointDate = addDays(period.start, day - 1);
    const pointKey = toDateKey(pointDate);
    const eligible = transactions.filter((transaction) => transaction.transaction_date <= pointKey);
    return {
      day,
      label: DATE_FORMATTER.format(pointDate),
      receita: totalByType(eligible, 'income'),
      despesa: totalByType(eligible, 'expense'),
    };
  });
}

function buildAccounts(accounts, accountBalances) {
  const balanceById = new Map(accountBalances.map((balance) => [balance.account_id, balance]));
  return accounts.filter((account) => account.is_active !== false).map((account, index) => {
    const officialBalance = balanceById.get(account.id)?.derived_balance;
    const derivedBalance = Number(officialBalance ?? account.initial_balance ?? 0);
    return {
      ...account,
      derived_balance: derivedBalance,
      type: ACCOUNT_TYPE_LABELS[account.account_type] ?? account.account_type,
      balance: CURRENCY_FORMATTER.format(derivedBalance),
      color: COLORS[index % COLORS.length],
    };
  });
}

function buildTransactions(transactions, categories) {
  const categoriesById = new Map(categories.map((category) => [category.id, category.name]));
  return [...transactions]
    .sort((left, right) => `${right.transaction_date}${right.created_at ?? ''}`.localeCompare(`${left.transaction_date}${left.created_at ?? ''}`))
    .map((transaction) => {
      const isIncome = transaction.transaction_type === 'income';
      const isExpense = transaction.transaction_type === 'expense';
      const tone = isIncome ? 'income' : isExpense ? 'expense' : 'neutral';
      const sign = isIncome ? '+' : isExpense ? '-' : '↔';
      return {
        ...transaction,
        category: categoriesById.get(transaction.category_id) ?? (transaction.transaction_type === 'transfer' ? 'Transferência' : 'Sem categoria'),
        date: DATE_FORMATTER.format(parseDateKey(transaction.transaction_date)),
        amount: Number(transaction.amount || 0),
        amountLabel: `${sign} ${CURRENCY_FORMATTER.format(Number(transaction.amount || 0))}`,
        tone,
        icon: isIncome ? 'R' : isExpense ? 'D' : 'T',
      };
    });
}

function buildCategories(transactions, categories) {
  const totals = new Map();
  transactions.filter((transaction) => transaction.transaction_type === 'expense').forEach((transaction) => {
    const key = transaction.category_id ?? 'uncategorized';
    totals.set(key, (totals.get(key) ?? 0) + Number(transaction.amount || 0));
  });
  const categoryById = new Map(categories.map((category) => [category.id, category.name]));
  const totalExpense = [...totals.values()].reduce((total, value) => total + value, 0);

  return [...totals.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([id, value], index) => ({
      id,
      label: categoryById.get(id) ?? 'Sem categoria',
      value: CURRENCY_FORMATTER.format(value),
      percent: totalExpense > 0 ? Math.round((value / totalExpense) * 100) : 0,
      color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
    }));
}

export function buildFinanceiroMobileData({
  accounts = [],
  accountBalances = [],
  categories = [],
  transactions = [],
  workspaceBalance = null,
  mode = 'Mês',
  periodOffset = 0,
  now = new Date(),
} = {}) {
  const period = getFinancialPeriod({ mode, offset: periodOffset, now });
  const previousPeriod = getFinancialPeriod({ mode, offset: periodOffset - 1, now });
  const periodTransactions = selectPeriodTransactions(transactions, period);
  const previousTransactions = selectPeriodTransactions(transactions, previousPeriod);
  const income = totalByType(periodTransactions, 'income');
  const expense = totalByType(periodTransactions, 'expense');
  const previousExpense = totalByType(previousTransactions, 'expense');
  const comparisonPercent = previousExpense > 0
    ? Math.round(((expense - previousExpense) / previousExpense) * 100)
    : null;
  const data = buildCumulativeSeries(periodTransactions, period);
  const comparisonData = buildCumulativeSeries(previousTransactions, previousPeriod);
  const lastPoint = data[data.length - 1];

  return {
    label: period.label,
    insight: periodTransactions.length
      ? `Foram encontrados ${periodTransactions.length} lançamentos confirmados neste período.`
      : 'Ainda não há lançamentos confirmados neste período.',
    balance: CURRENCY_FORMATTER.format(Number(workspaceBalance ?? 0)),
    comparison: comparisonPercent === null
      ? 'Sem base anterior para comparação'
      : `${comparisonPercent > 0 ? '+' : ''}${comparisonPercent}% em saídas vs. período anterior`,
    income: CURRENCY_FORMATTER.format(income),
    expense: CURRENCY_FORMATTER.format(expense),
    accounts: buildAccounts(accounts, accountBalances),
    transactions: buildTransactions(periodTransactions, categories),
    categories: buildCategories(periodTransactions, categories),
    chart: {
      data,
      comparisonData,
      forecastData: data,
      todayDay: lastPoint.day,
      insightHighlight: {
        startDay: Math.max(1, lastPoint.day - 2),
        endDay: lastPoint.day,
        message: periodTransactions.length ? 'Dados reais do período atual.' : 'Nenhum movimento confirmado no período.',
        detail: 'A leitura considera apenas lançamentos concluídos do workspace atual.',
      },
      comparisonMeta: {
        message: comparisonPercent === null ? 'Ainda não há base anterior para comparação.' : 'Comparação calculada com o período anterior.',
        detail: 'Valores baseados exclusivamente em saídas confirmadas.',
        deltaPercent: comparisonPercent ?? 0,
        currentValue: expense,
        previousValue: previousExpense,
      },
      forecastMeta: {
        message: 'Previsão financeira ainda não disponível.',
        detail: 'O gráfico mantém os dados confirmados sem inventar valores futuros.',
        projectedBalance: Number(workspaceBalance ?? 0),
      },
    },
  };
}
