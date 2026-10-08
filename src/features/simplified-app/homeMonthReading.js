import { formatCurrency } from '../../utils/formatters.js';
import { buildCategorySummaries, getMonthRange } from './simplifiedRecordsData.js';

/**
 * Leitura do mês na Home (design 20b): até três leituras sobre as saídas por
 * categoria, em ordem de prioridade. Cada leitura aponta para uma categoria,
 * e tocar nela abre o Financeiro filtrado.
 *
 * A comparação com o mês anterior é sempre "até o mesmo dia": no dia 8 de
 * outubro, outubro até o dia 8 contra setembro até o dia 8. Comparar o mês
 * corrente com o mês anterior inteiro faria todo começo de mês parecer
 * economia.
 *
 * Não há orçamento por categoria no banco, então nenhuma leitura fala em
 * orçamento.
 */

export const HOME_MONTH_READING_KINDS = Object.freeze({
  INCREASE: 'increase',
  TOP: 'top',
  DECREASE: 'decrease',
});

export const HOME_MONTH_READING_LIMIT = 3;

// Uma variação só vira leitura se for grande nos dois sentidos: em reais e em
// proporção. Só a proporção faria R$ 10 → R$ 20 virar "dobrou".
export const HOME_MONTH_READING_MIN_DELTA = 50;
export const HOME_MONTH_READING_MIN_RATIO = 0.2;

const MONTH_NAME_FORMATTER = new Intl.DateTimeFormat('pt-BR', { month: 'long' });

function toDateKey(year, monthIndex, day) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Período que a Home busca: do primeiro dia do mês anterior ao último dia do
 * mês corrente, numa consulta só.
 */
export function buildHomeMonthReadingRange(now = new Date()) {
  const current = getMonthRange(now);
  const previous = getMonthRange(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  return Object.freeze({
    dateFrom: previous.dateFrom,
    dateTo: current.dateTo,
  });
}

function buildComparisonWindow(now) {
  const year = now.getFullYear();
  const monthIndex = now.getMonth();
  const day = now.getDate();
  const previousDate = new Date(year, monthIndex - 1, 1);
  const previousLastDay = new Date(year, monthIndex, 0).getDate();
  const previousCutoff = Math.min(day, previousLastDay);

  return {
    day,
    currentFrom: toDateKey(year, monthIndex, 1),
    currentTo: toDateKey(year, monthIndex, day),
    previousFrom: toDateKey(previousDate.getFullYear(), previousDate.getMonth(), 1),
    previousTo: toDateKey(previousDate.getFullYear(), previousDate.getMonth(), previousCutoff),
    currentMonthName: MONTH_NAME_FORMATTER.format(now),
    previousMonthName: MONTH_NAME_FORMATTER.format(previousDate),
  };
}

function inWindow(transaction, from, to) {
  const key = String(transaction.transaction_date ?? '').slice(0, 10);
  return key >= from && key <= to;
}

function isSignificantChange(delta, previous) {
  return Math.abs(delta) >= HOME_MONTH_READING_MIN_DELTA
    && previous > 0
    && Math.abs(delta) / previous >= HOME_MONTH_READING_MIN_RATIO;
}

function describeTopComparison(delta, previous, period, share) {
  if (previous > 0) {
    if (delta > 0) return `${formatCurrency(delta)} a mais que no mesmo dia de ${period.previousMonthName}.`;
    if (delta < 0) return `${formatCurrency(-delta)} a menos que no mesmo dia de ${period.previousMonthName}.`;
    return `O mesmo valor do mesmo dia de ${period.previousMonthName}.`;
  }
  return `${share}% das suas saídas de ${period.currentMonthName}.`;
}

function toReading(kind, row, title, detail) {
  return Object.freeze({
    id: `${kind}:${row.id}`,
    kind,
    categoryId: row.id,
    category: { name: row.name, category_type: row.category_type, icon: row.icon },
    title,
    detail,
  });
}

/**
 * Monta as leituras a partir das transações do período de
 * buildHomeMonthReadingRange. A ordem é a prioridade:
 *   1. a categoria que mais subiu em relação ao mês anterior;
 *   2. a categoria com mais saídas no mês;
 *   3. a categoria que mais caiu.
 * Uma categoria aparece uma vez só. Leitura sem base (subida ou queda pequena)
 * fica de fora, então a lista pode ter menos de três itens.
 */
export function buildHomeMonthReading({ transactions = [], categories = [], now = new Date() } = {}) {
  const period = buildComparisonWindow(now);
  const current = transactions.filter((transaction) => inWindow(transaction, period.currentFrom, period.currentTo));
  const previous = transactions.filter((transaction) => inWindow(transaction, period.previousFrom, period.previousTo));

  const previousAmountById = new Map(
    buildCategorySummaries(categories, previous).map((row) => [row.id, row.amount]),
  );
  const rows = buildCategorySummaries(categories, current)
    .map((row) => {
      const previousAmount = previousAmountById.get(row.id) ?? 0;
      return { ...row, previousAmount, delta: row.amount - previousAmount };
    });
  // Categoria sem saída em nenhum dos dois meses não tem o que ler.
  const comparable = rows.filter((row) => row.amount > 0 || row.previousAmount > 0);
  const monthExpense = rows.reduce((total, row) => total + row.amount, 0);

  const readings = [];
  const used = new Set();
  const comparisonDetail = (row) => (
    `Até o dia ${period.day}: ${formatCurrency(row.amount)} em ${period.currentMonthName} e `
    + `${formatCurrency(row.previousAmount)} em ${period.previousMonthName}.`
  );

  const increase = comparable
    .filter((row) => row.delta > 0 && isSignificantChange(row.delta, row.previousAmount))
    .sort((left, right) => right.delta - left.delta)[0];
  if (increase) {
    used.add(increase.id);
    readings.push(toReading(
      HOME_MONTH_READING_KINDS.INCREASE,
      increase,
      `Você gastou ${formatCurrency(increase.delta)} a mais com ${increase.name} que em ${period.previousMonthName}.`,
      comparisonDetail(increase),
    ));
  }

  const top = comparable
    .filter((row) => row.amount > 0 && !used.has(row.id))
    .sort((left, right) => right.amount - left.amount)[0];
  if (top) {
    used.add(top.id);
    const share = monthExpense > 0 ? Math.round((top.amount / monthExpense) * 100) : 0;
    readings.push(toReading(
      HOME_MONTH_READING_KINDS.TOP,
      top,
      `Você gastou ${formatCurrency(top.amount)} com ${top.name} em ${period.currentMonthName}.`,
      describeTopComparison(top.delta, top.previousAmount, period, share),
    ));
  }

  const decrease = comparable
    .filter((row) => row.delta < 0 && !used.has(row.id) && isSignificantChange(row.delta, row.previousAmount))
    .sort((left, right) => left.delta - right.delta)[0];
  if (decrease) {
    readings.push(toReading(
      HOME_MONTH_READING_KINDS.DECREASE,
      decrease,
      `Você gastou ${formatCurrency(-decrease.delta)} a menos com ${decrease.name} que em ${period.previousMonthName}.`,
      comparisonDetail(decrease),
    ));
  }

  return Object.freeze({
    readings: readings.slice(0, HOME_MONTH_READING_LIMIT),
    currentMonthName: period.currentMonthName,
  });
}
