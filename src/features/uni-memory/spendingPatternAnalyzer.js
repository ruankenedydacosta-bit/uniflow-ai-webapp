import { deepFreeze, roundMoney, toIsoDate } from './memoryTypes.js';

function shiftDate(date, days) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function aggregate(transactions, field) {
  const map = new Map();
  transactions.forEach((transaction) => {
    const key = transaction[field] ?? 'unknown';
    const current = map.get(key) ?? { key, total: 0, count: 0 };
    current.total += Number(transaction.amount);
    current.count += 1;
    map.set(key, current);
  });
  return map;
}

export function analyzeSpendingPatterns(transactions = [], {
  referenceDate,
  periodDays = 30,
} = {}) {
  const safeReference = toIsoDate(referenceDate) ?? transactions
    .map((transaction) => toIsoDate(transaction.transaction_date))
    .filter(Boolean)
    .sort()
    .at(-1);
  if (!safeReference) return deepFreeze([]);

  const currentStart = shiftDate(safeReference, -(periodDays - 1));
  const previousEnd = shiftDate(currentStart, -1);
  const previousStart = shiftDate(previousEnd, -(periodDays - 1));
  const expenses = transactions
    .map((transaction) => ({ ...transaction, date: toIsoDate(transaction.transaction_date) }))
    .filter((transaction) => transaction.transaction_type === 'expense' && transaction.date);
  const current = expenses.filter((item) => item.date >= currentStart && item.date <= safeReference);
  const previous = expenses.filter((item) => item.date >= previousStart && item.date <= previousEnd);
  const currentCategories = aggregate(current, 'category_id');
  const previousCategories = aggregate(previous, 'category_id');
  const patterns = [];

  currentCategories.forEach((category, categoryId) => {
    const before = previousCategories.get(categoryId);
    if (!before || before.total <= 0) return;
    const changePercent = ((category.total - before.total) / before.total) * 100;
    if (Math.abs(changePercent) < 20) return;
    patterns.push({
      type: changePercent > 0 ? 'category_increase' : 'category_decrease',
      categoryId: categoryId === 'unknown' ? null : categoryId,
      currentTotal: roundMoney(category.total),
      previousTotal: roundMoney(before.total),
      changePercent: Number(changePercent.toFixed(1)),
      confidence: Math.min(0.95, 0.62 + Math.min(category.count + before.count, 8) * 0.04),
      evidence: { currentCount: category.count, previousCount: before.count, periodDays },
    });
  });

  const currentAccounts = [...aggregate(current, 'account_id').values()].sort((a, b) => b.total - a.total);
  const previousAccounts = [...aggregate(previous, 'account_id').values()].sort((a, b) => b.total - a.total);
  if (currentAccounts[0] && previousAccounts[0] && currentAccounts[0].key !== previousAccounts[0].key) {
    patterns.push({
      type: 'main_account_change',
      previousAccountId: previousAccounts[0].key,
      currentAccountId: currentAccounts[0].key,
      confidence: 0.76,
      evidence: { previousTotal: roundMoney(previousAccounts[0].total), currentTotal: roundMoney(currentAccounts[0].total) },
    });
  }

  const currentTotal = current.reduce((sum, item) => sum + Number(item.amount), 0);
  if (currentTotal > 0 && currentCategories.size) {
    const concentrated = [...currentCategories.values()].sort((a, b) => b.total - a.total)[0];
    const share = concentrated.total / currentTotal;
    if (share >= 0.45 && concentrated.count >= 2) {
      patterns.push({
        type: 'expense_concentration',
        categoryId: concentrated.key === 'unknown' ? null : concentrated.key,
        share: Number(share.toFixed(2)),
        confidence: Math.min(0.94, 0.6 + share * 0.35),
        evidence: { categoryTotal: roundMoney(concentrated.total), totalExpenses: roundMoney(currentTotal), count: concentrated.count },
      });
    }
  }

  return deepFreeze(patterns);
}
