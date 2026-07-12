import {
  daysBetween,
  deepFreeze,
  normalizeMemoryText,
  roundMoney,
  toIsoDate,
} from './memoryTypes.js';

const NOISE_WORDS = new Set([
  'pagamento', 'compra', 'mensalidade', 'janeiro', 'fevereiro', 'marco',
  'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro',
  'novembro', 'dezembro',
]);

function canonicalDescription(value) {
  return normalizeMemoryText(value)
    .split(' ')
    .filter((word) => word.length > 1 && !NOISE_WORDS.has(word) && !/^\d+$/.test(word))
    .join(' ');
}

function descriptionSimilarity(left, right) {
  if (left === right) return 1;
  const leftWords = new Set(left.split(' ').filter(Boolean));
  const rightWords = new Set(right.split(' ').filter(Boolean));
  const intersection = [...leftWords].filter((word) => rightWords.has(word)).length;
  const union = new Set([...leftWords, ...rightWords]).size;
  return union ? intersection / union : 0;
}

function amountSimilarity(left, right) {
  const maximum = Math.max(left, right);
  return maximum ? Math.min(left, right) / maximum : 0;
}

function classifyInterval(intervals) {
  if (!intervals.length) return { frequency: 'unknown', fit: 0 };
  const average = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
  if (average >= 25 && average <= 35) return { frequency: 'monthly', fit: 1 };
  if (average >= 5 && average <= 9) return { frequency: 'weekly', fit: 1 };
  return { frequency: 'irregular', fit: 0.35 };
}

export function detectRecurrences(transactions = []) {
  const comparable = transactions
    .map((transaction) => ({
      ...transaction,
      amount: Number(transaction.amount),
      date: toIsoDate(transaction.transaction_date),
      canonicalDescription: canonicalDescription(transaction.description),
    }))
    .filter((transaction) =>
      ['income', 'expense'].includes(transaction.transaction_type) &&
      transaction.amount > 0 && transaction.date && transaction.canonicalDescription,
    )
    .sort((left, right) => left.date.localeCompare(right.date));
  const clusters = [];

  comparable.forEach((transaction) => {
    const cluster = clusters.find((candidate) => {
      const sample = candidate[0];
      return sample.transaction_type === transaction.transaction_type &&
        sample.category_id === transaction.category_id &&
        sample.account_id === transaction.account_id &&
        descriptionSimilarity(sample.canonicalDescription, transaction.canonicalDescription) >= 0.5 &&
        amountSimilarity(sample.amount, transaction.amount) >= 0.8;
    });
    if (cluster) cluster.push(transaction);
    else clusters.push([transaction]);
  });

  const recurrences = clusters
    .filter((cluster) => cluster.length >= 2)
    .map((cluster) => {
      const intervals = cluster.slice(1).map((item, index) =>
        daysBetween(cluster[index].date, item.date),
      );
      const interval = classifyInterval(intervals);
      const averageAmount = roundMoney(
        cluster.reduce((sum, item) => sum + item.amount, 0) / cluster.length,
      );
      const confidence = Math.min(
        0.98,
        0.38 + Math.min(cluster.length, 5) * 0.1 + interval.fit * 0.22,
      );
      return {
        transactionType: cluster[0].transaction_type,
        description: cluster[0].description,
        normalizedDescription: cluster[0].canonicalDescription,
        categoryId: cluster[0].category_id ?? null,
        accountId: cluster[0].account_id ?? null,
        frequency: interval.frequency,
        averageAmount,
        averageIntervalDays: intervals.length
          ? Math.round(intervals.reduce((sum, value) => sum + value, 0) / intervals.length)
          : null,
        occurrences: cluster.length,
        confidence: Number(confidence.toFixed(2)),
        evidence: {
          transactionIds: cluster.map((item) => item.id).filter(Boolean),
          dates: cluster.map((item) => item.date),
          amounts: cluster.map((item) => item.amount),
          intervals,
        },
      };
    })
    .sort((left, right) => right.confidence - left.confidence);

  return deepFreeze(recurrences);
}
