import {
  daysBetween,
  deepFreeze,
  normalizeMemoryText,
  roundMoney,
  toIsoDate,
} from './memoryTypes.js';

function descriptionSimilarity(left, right) {
  const normalizedLeft = normalizeMemoryText(left);
  const normalizedRight = normalizeMemoryText(right);
  if (normalizedLeft === normalizedRight) return 1;
  return normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft) ? 0.8 : 0;
}

function amountClose(left, right, tolerance = 0.02) {
  const maximum = Math.max(Number(left), Number(right));
  return maximum > 0 && Math.abs(Number(left) - Number(right)) / maximum <= tolerance;
}

export function detectFinancialAnomalies(transactions = []) {
  const comparable = transactions
    .map((transaction) => ({ ...transaction, date: toIsoDate(transaction.transaction_date), amount: Number(transaction.amount) }))
    .filter((transaction) => transaction.date && transaction.amount > 0);
  const anomalies = [];

  comparable.forEach((transaction) => {
    const baseline = comparable.filter((item) =>
      item.id !== transaction.id &&
      item.transaction_type === transaction.transaction_type &&
      item.category_id === transaction.category_id,
    );
    if (baseline.length < 3) return;
    const average = baseline.reduce((sum, item) => sum + item.amount, 0) / baseline.length;
    if (transaction.amount >= average * 2 && transaction.amount - average >= 50) {
      anomalies.push({
        type: 'amount_above_category_average',
        transactionId: transaction.id ?? null,
        confidence: Math.min(0.97, 0.68 + (transaction.amount / average - 2) * 0.08),
        evidence: { amount: transaction.amount, categoryAverage: roundMoney(average), baselineCount: baseline.length, categoryId: transaction.category_id ?? null },
      });
    }
  });

  comparable.forEach((transaction, index) => {
    comparable.slice(index + 1).forEach((candidate) => {
      if (transaction.account_id !== candidate.account_id ||
          transaction.transaction_type !== candidate.transaction_type ||
          !amountClose(transaction.amount, candidate.amount) ||
          descriptionSimilarity(transaction.description, candidate.description) < 0.8 ||
          daysBetween(transaction.date, candidate.date) > 1) return;
      anomalies.push({
        type: 'probable_duplicate',
        transactionId: candidate.id ?? null,
        confidence: 0.9,
        evidence: { transactionIds: [transaction.id, candidate.id].filter(Boolean), amount: transaction.amount, dates: [transaction.date, candidate.date] },
      });
    });
  });

  const merchantGroups = new Map();
  comparable.forEach((transaction) => {
    const key = `${transaction.transaction_type}:${normalizeMemoryText(transaction.description)}`;
    const group = merchantGroups.get(key) ?? [];
    group.push(transaction);
    merchantGroups.set(key, group);
  });
  merchantGroups.forEach((group) => {
    if (group.length < 3) return;
    const accountCounts = new Map();
    group.forEach((item) => accountCounts.set(item.account_id, (accountCounts.get(item.account_id) ?? 0) + 1));
    const dominant = [...accountCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (!dominant || dominant[1] < 2) return;
    group.filter((item) => item.account_id !== dominant[0]).forEach((item) => {
      anomalies.push({
        type: 'unusual_account_for_description',
        transactionId: item.id ?? null,
        confidence: 0.72,
        evidence: { usualAccountId: dominant[0], observedAccountId: item.account_id, description: item.description, baselineCount: dominant[1] },
      });
    });
  });

  return deepFreeze(anomalies);
}
