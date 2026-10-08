import { toDateKey } from './simplifiedAgendaCalendar.js';

// Lançamento do Financeiro com data futura aparece na Agenda como conta.
// Não é compromisso: o registro continua sendo a transação, e o item é só
// uma projeção de leitura (id com prefixo, sem edição nem exclusão aqui).

export const TRANSACTION_AGENDA_ID_PREFIX = 'transaction:';

const PROJECTED_ITEM_TYPES = Object.freeze({
  expense: 'payment_due',
  income: 'receivable',
});

const EXCLUDED_STATUSES = new Set(['canceled', 'failed']);

export function isProjectedTransactionItem(item) {
  return item?.source === 'transaction';
}

/** Intervalo YYYY-MM-DD do mês visível, no formato que listTransactionsForPeriod espera. */
export function buildMonthTransactionRange(year, month) {
  return {
    dateFrom: toDateKey(new Date(year, month, 1)),
    dateTo: toDateKey(new Date(year, month + 1, 0)),
  };
}

/**
 * Transações de despesa e receita com data depois de hoje, vistas como itens
 * de dia inteiro. Comparação por string: transaction_date é YYYY-MM-DD.
 */
export function buildFutureTransactionAgendaItems(transactions, { now = new Date() } = {}) {
  const todayKey = toDateKey(now);

  return (transactions ?? []).flatMap((transaction) => {
    const itemType = PROJECTED_ITEM_TYPES[transaction?.transaction_type];
    if (!itemType) return [];
    if (EXCLUDED_STATUSES.has(transaction.status)) return [];
    if (!(transaction.transaction_date > todayKey)) return [];

    const [year, month, day] = transaction.transaction_date.split('-').map(Number);
    return [{
      id: `${TRANSACTION_AGENDA_ID_PREFIX}${transaction.id}`,
      source: 'transaction',
      item_type: itemType,
      title: transaction.description,
      description: null,
      location: null,
      starts_at: new Date(year, month - 1, day, 12).toISOString(),
      ends_at: null,
      is_all_day: true,
      has_explicit_time: false,
      status: 'scheduled',
      created_at: transaction.created_at,
      updated_at: transaction.updated_at,
    }];
  });
}
