import {
  deepFreeze,
  normalizeMemoryText,
  roundMoney,
  toIsoDate,
} from './memoryTypes.js';

function incrementAggregate(map, key, base, amount) {
  const current = map.get(key) ?? { ...base, total: 0, count: 0 };
  current.total = roundMoney(current.total + amount);
  current.count += 1;
  current.average = roundMoney(current.total / current.count);
  map.set(key, current);
}

function inPeriod(date, periodStart, periodEnd) {
  return date && (!periodStart || date >= periodStart) && (!periodEnd || date <= periodEnd);
}

export function createFinancialSnapshot({
  accounts = [],
  categories = [],
  transactions = [],
  periodStart = null,
  periodEnd = null,
} = {}) {
  const accountMap = new Map(accounts.map((account) => [account.id, account]));
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const validTransactions = transactions
    .map((transaction) => ({ ...transaction, date: toIsoDate(transaction.transaction_date) }))
    .filter((transaction) =>
      ['income', 'expense'].includes(transaction.transaction_type) &&
      Number(transaction.amount) > 0 &&
      transaction.status !== 'canceled' &&
      transaction.status !== 'pending' &&
      inPeriod(transaction.date, periodStart, periodEnd),
    );
  const dates = validTransactions.map((transaction) => transaction.date).sort();
  const categoryTotals = new Map();
  const accountTotals = new Map();
  const descriptions = new Map();
  let income = 0;
  let expenses = 0;

  validTransactions.forEach((transaction) => {
    const amount = Number(transaction.amount);
    if (transaction.transaction_type === 'income') income += amount;
    if (transaction.transaction_type === 'expense') expenses += amount;

    const category = categoryMap.get(transaction.category_id);
    const categoryKey = transaction.category_id ?? 'uncategorized';
    incrementAggregate(categoryTotals, categoryKey, {
      id: transaction.category_id ?? null,
      name: category?.name ?? 'Sem categoria',
      type: transaction.transaction_type,
    }, amount);

    const account = accountMap.get(transaction.account_id);
    const accountKey = transaction.account_id ?? 'unknown';
    incrementAggregate(accountTotals, accountKey, {
      id: transaction.account_id ?? null,
      name: account?.name ?? 'Conta não identificada',
    }, amount);

    const descriptionKey = normalizeMemoryText(transaction.description);
    if (descriptionKey) {
      incrementAggregate(descriptions, descriptionKey, {
        description: transaction.description.trim(),
        normalizedDescription: descriptionKey,
      }, amount);
    }
  });

  const sortAggregates = (map) => [...map.values()].sort(
    (left, right) => right.count - left.count || right.total - left.total,
  );
  const snapshot = {
    period: {
      start: periodStart ?? dates[0] ?? null,
      end: periodEnd ?? dates.at(-1) ?? null,
    },
    totals: {
      income: roundMoney(income),
      expenses: roundMoney(expenses),
      netFlow: roundMoney(income - expenses),
      transactionCount: validTransactions.length,
    },
    categoryTotals: sortAggregates(categoryTotals),
    accountTotals: sortAggregates(accountTotals),
    frequentDescriptions: sortAggregates(descriptions),
  };

  return deepFreeze(snapshot);
}
