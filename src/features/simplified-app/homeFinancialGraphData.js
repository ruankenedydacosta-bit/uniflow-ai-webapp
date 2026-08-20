import { formatCurrency } from '../../utils/formatters.js';
import {
  filterRecordTransactions,
  getMonthRange,
  summarizeMonth,
} from './simplifiedRecordsData.js';

/**
 * HOME-GRAPH2 -- FONTE ÚNICA DE VERDADE.
 *
 * A V1 derivava os totais com `totalByType` (financeiroMobileData.js), que
 * soma APENAS lançamentos `transaction_type` income/expense. Registros usa
 * `summarizeMonth`, que soma esses lançamentos MAIS o delta dos ajustes
 * (`transaction_type: 'adjustment'` com `adjustment_target` income/expense).
 * Quem tivesse usado "Atualizar entradas/saídas" veria Registros e o
 * gráfico discordarem para sempre -- inclusive depois de recarregar o app,
 * porque a divergência era de REGRA, não de cache.
 *
 * Por isso este módulo não tem mais matemática financeira própria: período,
 * totais e ordenação vêm todos de simplifiedRecordsData.js, exatamente as
 * mesmas funções que a tela de Registros chama. Qualquer regra nova
 * (ajustes, estornos, etc.) passa a valer nos dois lugares de uma vez.
 */

const DAY_LABEL_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
});

function dayOfMonth(dateKey) {
  return Number(String(dateKey).slice(8, 10));
}

function dateKeyForDay(monthRange, day) {
  return `${String(monthRange.dateFrom).slice(0, 8)}${String(day).padStart(2, '0')}`;
}

function labelForDay(monthRange, day) {
  const [year, month] = String(monthRange.dateFrom).split('-').map(Number);
  return DAY_LABEL_FORMATTER.format(new Date(year, month - 1, day, 12));
}

/**
 * Série acumulada do mês. Cada ponto usa `summarizeMonth` sobre os
 * lançamentos até aquele dia -- ou seja, a curva e os cards de total saem
 * da MESMA regra, então o último ponto sempre bate com o total exibido.
 */
export function buildHomeSeries(transactions, monthRange, effectiveLastDay) {
  const pointDays = new Set([1, effectiveLastDay]);
  transactions.forEach((transaction) => {
    const day = dayOfMonth(transaction.transaction_date);
    if (day >= 1 && day <= effectiveLastDay) pointDays.add(day);
  });

  return [...pointDays]
    .sort((left, right) => left - right)
    .map((day) => {
      const pointKey = dateKeyForDay(monthRange, day);
      const eligible = transactions.filter(
        (transaction) => transaction.transaction_date <= pointKey,
      );
      const totals = summarizeMonth(eligible);
      return {
        day,
        label: labelForDay(monthRange, day),
        receita: totals.income,
        despesa: totals.expense,
      };
    });
}

/**
 * Últimas movimentações de um tipo, na MESMA ordem visual de Registros
 * (`filterRecordTransactions` já filtra status completed e ordena por
 * transaction_date desc, desempatando por created_at). Limitado a `limit`
 * para a Home continuar sendo um resumo, nunca uma segunda tela de lista.
 */
export function buildRecentMovements(transactions, categories, type, limit = 2) {
  const categoryById = new Map(categories.map((category) => [category.id, category.name]));

  return filterRecordTransactions(transactions, { type, sort: 'recent' })
    .slice(0, limit)
    .map((transaction) => ({
      id: transaction.id,
      description: transaction.description,
      categoryName: categoryById.get(transaction.category_id) ?? 'Sem categoria',
      amount: Number(transaction.amount || 0),
      formattedAmount: formatCurrency(Number(transaction.amount || 0)),
      dateKey: transaction.transaction_date,
    }));
}

export function buildHomeFinancialGraphData({
  transactions = [],
  categories = [],
  now = new Date(),
} = {}) {
  const monthRange = getMonthRange(now);
  const lastDayOfMonth = dayOfMonth(monthRange.dateTo);
  // Mês corrente => a curva para em hoje; mês passado => mês inteiro.
  const isCurrentMonth = String(monthRange.dateFrom).slice(0, 7)
    === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const effectiveLastDay = isCurrentMonth
    ? Math.min(now.getDate(), lastDayOfMonth)
    : lastDayOfMonth;

  const totals = summarizeMonth(transactions);

  return {
    monthRange,
    periodLabel: monthRange.label,
    hasMovements: transactions.some((transaction) => transaction.status === 'completed'),
    income: totals.income,
    expense: totals.expense,
    incomeLabel: formatCurrency(totals.income),
    expenseLabel: formatCurrency(totals.expense),
    chart: {
      data: buildHomeSeries(transactions, monthRange, effectiveLastDay),
      todayDay: effectiveLastDay,
    },
    recent: {
      income: buildRecentMovements(transactions, categories, 'income'),
      expense: buildRecentMovements(transactions, categories, 'expense'),
    },
  };
}
