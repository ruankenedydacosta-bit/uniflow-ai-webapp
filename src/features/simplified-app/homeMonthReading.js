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
 * Orçamento (#121): o teto mensal que a pessoa definiu para a categoria ou,
 * sem teto, a média das saídas dos 3 meses anteriores completos.
 *
 * buildHomeMonthFacts devolve só números; buildHomeMonthReading escreve as
 * frases a partir deles.
 */

export const HOME_MONTH_READING_KINDS = Object.freeze({
  OVER_BUDGET: 'over-budget',
  NEAR_BUDGET: 'near-budget',
  INCREASE: 'increase',
  TOP: 'top',
  ON_TRACK: 'on-track',
  DECREASE: 'decrease',
});

export const BUDGET_SOURCES = Object.freeze({ LIMIT: 'limit', AVERAGE: 'average' });

// Meses completos que entram na média.
export const HOME_MONTH_AVERAGE_MONTHS = 3;
// A partir de 80% do orçamento usado, a leitura avisa.
export const HOME_MONTH_NEAR_BUDGET_SHARE = 0.8;

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
 * Período que a Home busca, numa consulta só: do primeiro dia do mais antigo
 * dos meses da média ao último dia do mês corrente.
 */
export function buildHomeMonthReadingRange(now = new Date()) {
  const current = getMonthRange(now);
  const oldest = getMonthRange(new Date(now.getFullYear(), now.getMonth() - HOME_MONTH_AVERAGE_MONTHS, 1));
  return Object.freeze({
    dateFrom: oldest.dateFrom,
    dateTo: current.dateTo,
  });
}

// "de 1 a 8 de outubro"; no dia 1, "em 1º de outubro".
function describeRange(lastDay, monthName) {
  return lastDay === 1 ? `em 1º de ${monthName}` : `de 1 a ${lastDay} de ${monthName}`;
}

function capitalize(value) {
  return value.charAt(0).toLocaleUpperCase('pt-BR') + value.slice(1);
}

function buildComparisonWindow(now) {
  const year = now.getFullYear();
  const monthIndex = now.getMonth();
  const day = now.getDate();
  const previousDate = new Date(year, monthIndex - 1, 1);
  const previousLastDay = new Date(year, monthIndex, 0).getDate();
  const previousCutoff = Math.min(day, previousLastDay);

  const averageFrom = new Date(year, monthIndex - HOME_MONTH_AVERAGE_MONTHS, 1);

  return {
    day,
    daysInMonth: new Date(year, monthIndex + 1, 0).getDate(),
    averageFrom: toDateKey(averageFrom.getFullYear(), averageFrom.getMonth(), 1),
    averageTo: toDateKey(previousDate.getFullYear(), previousDate.getMonth(), previousLastDay),
    currentLabel: describeRange(day, MONTH_NAME_FORMATTER.format(now)),
    previousLabel: describeRange(previousCutoff, MONTH_NAME_FORMATTER.format(previousDate)),
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
    if (delta > 0) return `${formatCurrency(delta)} a mais que no mesmo período de ${period.previousMonthName}.`;
    if (delta < 0) return `${formatCurrency(-delta)} a menos que no mesmo período de ${period.previousMonthName}.`;
    return `O mesmo valor do mesmo período de ${period.previousMonthName}.`;
  }
  return `${share}% das suas saídas ${period.currentLabel}.`;
}

function isExpense(transaction) {
  return transaction.status === 'completed' && transaction.transaction_type === 'expense';
}

/**
 * Média mensal de cada categoria nos meses completos anteriores. O divisor é
 * o número desses meses em que o espaço teve alguma saída: quem começou a usar
 * o app no mês passado tem média de um mês, não um terço dela.
 */
function buildAverages(categories, transactions, period) {
  const inAverage = transactions.filter((transaction) => (
    isExpense(transaction) && inWindow(transaction, period.averageFrom, period.averageTo)
  ));
  const monthsWithExpense = new Set(inAverage.map((transaction) => String(transaction.transaction_date).slice(0, 7)));
  if (monthsWithExpense.size === 0) return new Map();
  return new Map(
    buildCategorySummaries(categories, inAverage)
      .map((row) => [row.id, Math.round((row.amount / monthsWithExpense.size) * 100) / 100]),
  );
}

/**
 * Números da leitura, sem texto: por categoria, o gasto do mês até hoje, o do
 * mês anterior até o mesmo dia, a média, o teto e o orçamento que vale.
 * `budgets` são as linhas de category_budgets ({ category_id, monthly_limit }).
 */
export function buildHomeMonthFacts({ transactions = [], categories = [], budgets = [], now = new Date() } = {}) {
  const period = buildComparisonWindow(now);
  const current = transactions.filter((transaction) => inWindow(transaction, period.currentFrom, period.currentTo));
  const previous = transactions.filter((transaction) => inWindow(transaction, period.previousFrom, period.previousTo));

  const previousAmountById = new Map(
    buildCategorySummaries(categories, previous).map((row) => [row.id, row.amount]),
  );
  const averageById = buildAverages(categories, transactions, period);
  const limitById = new Map(
    budgets
      .filter((budget) => Number(budget.monthly_limit) > 0)
      .map((budget) => [budget.category_id, Number(budget.monthly_limit)]),
  );

  const rows = buildCategorySummaries(categories, current).map((row) => {
    const previousAmount = previousAmountById.get(row.id) ?? 0;
    const average = averageById.get(row.id) ?? 0;
    const limit = limitById.get(row.id) ?? null;
    // Média pequena demais não é orçamento: R$ 12 de média faria qualquer
    // compra virar "passou do orçamento".
    let budget = null;
    if (limit) budget = { amount: limit, source: BUDGET_SOURCES.LIMIT };
    else if (average >= HOME_MONTH_READING_MIN_DELTA) budget = { amount: average, source: BUDGET_SOURCES.AVERAGE };
    return Object.freeze({
      ...row,
      previousAmount,
      delta: row.amount - previousAmount,
      average,
      budget,
      usedShare: budget ? row.amount / budget.amount : null,
    });
  });

  return Object.freeze({
    period,
    monthExpense: rows.reduce((total, row) => total + row.amount, 0),
    rows,
  });
}

function toReading(kind, row, title, detail) {
  if (!row) {
    return Object.freeze({ id: kind, kind, categoryId: null, category: null, title, detail });
  }
  return Object.freeze({
    id: `${kind}:${row.id}`,
    kind,
    categoryId: row.id,
    category: { name: row.name, category_type: row.category_type, icon: row.icon },
    title,
    detail,
  });
}

function describeOverBudget(row, period) {
  const over = formatCurrency(row.amount - row.budget.amount);
  if (row.budget.source === BUDGET_SOURCES.LIMIT) {
    return [
      `Você passou ${over} do orçamento de ${row.name}.`,
      `O teto é ${formatCurrency(row.budget.amount)} por mês. ${capitalize(period.currentLabel)}: ${formatCurrency(row.amount)}.`,
    ];
  }
  return [
    `Você já gastou ${over} a mais que a sua média com ${row.name}.`,
    `Média dos últimos ${HOME_MONTH_AVERAGE_MONTHS} meses: ${formatCurrency(row.budget.amount)}. `
      + `${capitalize(period.currentLabel)}: ${formatCurrency(row.amount)}.`,
  ];
}

function describeNearBudget(row) {
  const percent = Math.floor(row.usedShare * 100);
  const left = formatCurrency(row.budget.amount - row.amount);
  if (row.budget.source === BUDGET_SOURCES.LIMIT) {
    return [
      `Você já usou ${percent}% do orçamento de ${row.name}.`,
      `Restam ${left} até o fim do mês.`,
    ];
  }
  return [
    `Você já gastou ${percent}% do que costuma gastar com ${row.name} no mês.`,
    `Restam ${left} para chegar à média dos últimos ${HOME_MONTH_AVERAGE_MONTHS} meses.`,
  ];
}

function joinNames(names) {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

/**
 * Monta as leituras a partir das transações do período de
 * buildHomeMonthReadingRange. A ordem é a prioridade:
 *   1. a categoria que mais passou do orçamento;
 *   2. a categoria mais perto do orçamento (80% ou mais);
 *   3. a categoria que mais subiu em relação ao mês anterior;
 *   4. a categoria com mais saídas no mês;
 *   5. quantas categorias estão dentro do orçamento;
 *   6. a categoria que mais caiu.
 * Uma categoria aparece uma vez só, e ficam as três primeiras que existirem.
 */
export function buildHomeMonthReading({ transactions = [], categories = [], budgets = [], now = new Date() } = {}) {
  const facts = buildHomeMonthFacts({ transactions, categories, budgets, now });
  const { period, monthExpense } = facts;
  // Categoria sem saída em nenhum dos dois meses não tem o que ler. O balaio
  // "Outros" (saída sem categoria do Financeiro Pessoal) não é categoria que
  // o Financeiro consiga filtrar, então também fica de fora.
  const comparable = facts.rows.filter((row) => (
    row.id !== 'uncategorized' && (row.amount > 0 || row.previousAmount > 0)
  ));
  const budgeted = facts.rows.filter((row) => row.id !== 'uncategorized' && row.budget);

  const readings = [];
  const used = new Set();
  const pick = (candidates, compare) => candidates
    .filter((row) => !used.has(row.id))
    .sort(compare)[0];
  const push = (kind, row, [title, detail]) => {
    if (row) used.add(row.id);
    readings.push(toReading(kind, row, title, detail));
  };
  const comparisonDetail = (row) => (
    `${capitalize(period.currentLabel)}: ${formatCurrency(row.amount)}. `
    + `${capitalize(period.previousLabel)}: ${formatCurrency(row.previousAmount)}.`
  );

  const over = pick(
    budgeted.filter((row) => row.amount > row.budget.amount),
    (left, right) => (right.amount - right.budget.amount) - (left.amount - left.budget.amount),
  );
  if (over) push(HOME_MONTH_READING_KINDS.OVER_BUDGET, over, describeOverBudget(over, period));

  const near = pick(
    budgeted.filter((row) => row.usedShare >= HOME_MONTH_NEAR_BUDGET_SHARE && row.amount <= row.budget.amount),
    (left, right) => right.usedShare - left.usedShare,
  );
  if (near) push(HOME_MONTH_READING_KINDS.NEAR_BUDGET, near, describeNearBudget(near));

  const increase = pick(
    comparable.filter((row) => row.delta > 0 && isSignificantChange(row.delta, row.previousAmount)),
    (left, right) => right.delta - left.delta,
  );
  if (increase) {
    push(HOME_MONTH_READING_KINDS.INCREASE, increase, [
      `Você gastou ${formatCurrency(increase.delta)} a mais com ${increase.name} que no mesmo período de ${period.previousMonthName}.`,
      comparisonDetail(increase),
    ]);
  }

  const top = pick(
    comparable.filter((row) => row.amount > 0),
    (left, right) => right.amount - left.amount,
  );
  if (top) {
    const share = monthExpense > 0 ? Math.round((top.amount / monthExpense) * 100) : 0;
    push(HOME_MONTH_READING_KINDS.TOP, top, [
      `Você gastou ${formatCurrency(top.amount)} com ${top.name} ${period.currentLabel}.`,
      describeTopComparison(top.delta, top.previousAmount, period, share),
    ]);
  }

  // Resumo do orçamento: só com duas ou mais categorias com orçamento, senão
  // repetiria a frase da própria categoria.
  if (budgeted.length >= 2) {
    const outside = budgeted.filter((row) => row.amount > row.budget.amount);
    const within = budgeted.length - outside.length;
    push(HOME_MONTH_READING_KINDS.ON_TRACK, null, [
      `Você está dentro do orçamento em ${within} de ${budgeted.length} categorias.`,
      outside.length === 0
        ? 'Até agora você tem ido bem no seu orçamento.'
        : `Fora do orçamento: ${joinNames(outside.map((row) => row.name))}.`,
    ]);
  }

  const decrease = pick(
    comparable.filter((row) => row.delta < 0 && isSignificantChange(row.delta, row.previousAmount)),
    (left, right) => left.delta - right.delta,
  );
  if (decrease) {
    push(HOME_MONTH_READING_KINDS.DECREASE, decrease, [
      `Você gastou ${formatCurrency(-decrease.delta)} a menos com ${decrease.name} que no mesmo período de ${period.previousMonthName}.`,
      comparisonDetail(decrease),
    ]);
  }

  return Object.freeze({
    readings: readings.slice(0, HOME_MONTH_READING_LIMIT),
    currentMonthName: period.currentMonthName,
  });
}
