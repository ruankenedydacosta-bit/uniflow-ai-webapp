import { toDateKey } from './simplifiedAgendaCalendar.js';

// Lançamento do Financeiro feito com antecedência (data da transação depois
// do dia em que foi registrado) aparece na Agenda como conta. Não é
// compromisso: o registro continua sendo a transação, e o item é só uma
// projeção de leitura (id com prefixo, sem edição, exclusão nem lembrete).
//
// O critério é a data de registro, não a de hoje: a conta continua na Agenda
// no dia do vencimento e depois dele, como qualquer compromisso passado.

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

/** Data do registro em hora local. created_at inválido devolve null. */
function registeredDateKey(transaction) {
  const time = Date.parse(transaction?.created_at ?? '');
  return Number.isFinite(time) ? toDateKey(new Date(time)) : null;
}

/**
 * Despesas e receitas lançadas com data futura, vistas como itens de dia
 * inteiro no dia da transação. Comparação por string: as duas datas são
 * YYYY-MM-DD.
 */
export function buildScheduledTransactionAgendaItems(transactions) {
  return (transactions ?? []).flatMap((transaction) => {
    const itemType = PROJECTED_ITEM_TYPES[transaction?.transaction_type];
    if (!itemType) return [];
    if (EXCLUDED_STATUSES.has(transaction.status)) return [];

    const registeredKey = registeredDateKey(transaction);
    if (!registeredKey || !(transaction.transaction_date > registeredKey)) return [];

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
