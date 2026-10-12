import { toDateKey } from './simplifiedAgendaCalendar.js';

// Lançamento previsto do Financeiro (status pending, data depois de hoje ou
// ainda sem confirmação) aparece na Agenda como conta. Não é compromisso: o
// registro continua sendo a transação, e o item é só uma projeção de leitura
// (id com prefixo, sem edição, exclusão nem lembrete).
//
// O critério é o status: confirmado (completed) já aconteceu e sai da Agenda.
// Previsto vencido e não confirmado continua nela, no dia do vencimento.

export const TRANSACTION_AGENDA_ID_PREFIX = 'transaction:';

const PROJECTED_ITEM_TYPES = Object.freeze({
  expense: 'payment_due',
  income: 'receivable',
});

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
 * Despesas e receitas previstas, vistas como itens de dia inteiro no dia da
 * transação.
 */
export function buildScheduledTransactionAgendaItems(transactions) {
  return (transactions ?? []).flatMap((transaction) => {
    const itemType = PROJECTED_ITEM_TYPES[transaction?.transaction_type];
    if (!itemType) return [];
    if (transaction.status !== 'pending') return [];

    const [year, month, day] = transaction.transaction_date.split('-').map(Number);
    return [{
      id: `${TRANSACTION_AGENDA_ID_PREFIX}${transaction.id}`,
      source: 'transaction',
      item_type: itemType,
      title: transaction.description,
      description: null,
      location: null,
      // Meia-noite local, como o formulário grava dia inteiro: na ordenação
      // por horário, a conta abre o dia em vez de cair entre compromissos.
      starts_at: new Date(year, month - 1, day).toISOString(),
      ends_at: null,
      is_all_day: true,
      has_explicit_time: false,
      status: 'scheduled',
      created_at: transaction.created_at,
      updated_at: transaction.updated_at,
    }];
  });
}
