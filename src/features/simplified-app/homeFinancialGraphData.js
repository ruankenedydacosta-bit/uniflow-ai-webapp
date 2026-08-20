import {
  buildCumulativeSeries,
  getFinancialPeriod,
  selectPeriodTransactions,
  totalByType,
} from '../../pages/financeiro/mobile/financeiroMobileData.js';

const CURRENCY_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

/**
 * HOME-GRAPH1: agregação de categorias por tipo (income/expense),
 * generalizando o equivalente privado de financeiroMobileData.js (que só
 * cobre despesa) -- a UniFlow abandonou Entradas/Saídas como conceitos
 * misturáveis na mesma lista, então o usuário alterna entre as duas via
 * `type`, nunca as duas juntas na mesma agregação.
 *
 * REGRA DE ZERO: categorias sem nenhum lançamento > 0 no período nunca
 * aparecem -- nunca uma lista cheia de categorias vazias.
 */
export function buildCategoryBreakdown(transactions, categories, type) {
  const totals = new Map();
  transactions
    .filter((transaction) => transaction.transaction_type === type)
    .forEach((transaction) => {
      const key = transaction.category_id ?? 'uncategorized';
      totals.set(key, (totals.get(key) ?? 0) + Number(transaction.amount || 0));
    });

  const categoryById = new Map(categories.map((category) => [category.id, category.name]));

  return [...totals.entries()]
    .filter(([, value]) => value > 0)
    .sort((left, right) => right[1] - left[1])
    .map(([id, value]) => ({
      id,
      name: categoryById.get(id) ?? 'Sem categoria',
      value,
      formattedValue: CURRENCY_FORMATTER.format(value),
    }));
}

/**
 * HOME-GRAPH1: monta os dados do gráfico financeiro da Home a partir da
 * MESMA fonte real (transactions/categories, vindas de useTransactions/
 * useCategories) já usada por Registros/Financeiro -- nunca um segundo
 * estado/fetch paralelo. Reaproveita getFinancialPeriod/
 * buildCumulativeSeries de financeiroMobileData.js sem alteração.
 *
 * NUNCA calcula ou expõe o total consolidado que a UniFlow abandonou na UI
 * -- só entradas (income) e saídas (expense) agregadas separadamente, e a
 * série acumulada do período para o gráfico. Contas/saldos por conta
 * propositalmente nunca entram aqui -- só workspaceId.
 */
export function buildHomeFinancialGraphData({
  transactions = [],
  categories = [],
  now = new Date(),
} = {}) {
  const period = getFinancialPeriod({ mode: 'Mês', offset: 0, now });
  const periodTransactions = selectPeriodTransactions(transactions, period);
  const income = totalByType(periodTransactions, 'income');
  const expense = totalByType(periodTransactions, 'expense');
  const data = buildCumulativeSeries(periodTransactions, period);
  const lastPoint = data[data.length - 1];

  return {
    period,
    hasMovements: periodTransactions.length > 0,
    income,
    expense,
    incomeLabel: CURRENCY_FORMATTER.format(income),
    expenseLabel: CURRENCY_FORMATTER.format(expense),
    chart: {
      data,
      todayDay: lastPoint.day,
    },
    categories: {
      expense: buildCategoryBreakdown(periodTransactions, categories, 'expense'),
      income: buildCategoryBreakdown(periodTransactions, categories, 'income'),
    },
  };
}
