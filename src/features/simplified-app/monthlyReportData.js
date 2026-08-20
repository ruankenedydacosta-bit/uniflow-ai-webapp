import { formatCurrency } from '../../utils/formatters.js';
import { buildAgendaItemPresentation } from '../../pages/agenda/agendaItemPresentation.js';
import { resolveReminderIndicator } from '../agenda-push/agendaReminderIndicator.js';
import { filterRecordTransactions, getMonthRange, summarizeMonth } from './simplifiedRecordsData.js';

/**
 * RELATORIO1: modelo de dados NEUTRO do Relatório da Uni -- sem React,
 * HTML, XLSX ou PDF. Esta função (e as auxiliares abaixo) é a ÚNICA
 * interpretação do relatório: a mesma estrutura que alimenta a UI hoje
 * poderá alimentar XLSX/WhatsApp nas próximas fases, sem duplicar a
 * matemática financeira ou a leitura da Agenda.
 *
 * Os totais delegam para summarizeMonth/filterRecordTransactions
 * (simplifiedRecordsData.js) -- as MESMAS funções que Registros e o
 * gráfico financeiro da Home já usam. Nunca recalcula receita/despesa por
 * conta própria; nunca inclui saldo/patrimônio no resultado.
 */

const STATUS_LABELS = Object.freeze({
  scheduled: 'Agendado',
  completed: 'Concluído',
  cancelled: 'Cancelado',
});

const DAY_GROUP_FORMATTER = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long' });
const TIME_FORMATTER = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit', month: '2-digit', year: '2-digit',
});

function parseDateKey(dateKey) {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1, 12);
}

function formatReportDayLabel(dateKey) {
  return DAY_GROUP_FORMATTER.format(parseDateKey(dateKey)).toUpperCase();
}

/** "19/08/26" -- formato de célula de planilha, distinto do rótulo de
    agrupamento por dia ("19 DE AGOSTO") usado pela V1 em card. */
function formatShortDate(date) {
  return SHORT_DATE_FORMATTER.format(date);
}

/**
 * Uma linha de movimentação. Sinal e rótulo seguem EXATAMENTE a mesma
 * regra já usada pela linha de Registros (SimplifiedRecordsPage.jsx):
 * income ou ajuste positivo = Entrada; o resto = Saída (adjustment_delta
 * decide o sinal do ajuste, nunca o tipo sozinho -- um ajuste pode
 * corrigir entradas OU saídas). Terminologia pública sempre Entrada/
 * Saída, nunca os tipos internos (income/expense/adjustment).
 */
function buildTransactionRow(transaction, categoryById) {
  const isIncome = transaction.transaction_type === 'income';
  const isTransfer = transaction.transaction_type === 'transfer';
  const isPositiveAdjustment = transaction.transaction_type === 'adjustment'
    && Number(transaction.adjustment_delta) > 0;
  const isPositive = isIncome || isPositiveAdjustment;
  const createdAt = new Date(transaction.created_at);
  const amount = Number(transaction.amount || 0);
  const transactionDate = parseDateKey(transaction.transaction_date);

  return {
    id: transaction.id,
    description: (transaction.description || '').trim() || 'Lançamento',
    categoryName: categoryById.get(transaction.category_id) ?? 'Sem categoria',
    dateKey: transaction.transaction_date,
    // RELATORIO-SPREADSHEET1: "DD/MM/AA" para a célula da planilha/XLSX --
    // dateKey (YYYY-MM-DD) segue servindo pro agrupamento/ordenação, nunca
    // exibido cru na UI.
    dateShort: formatShortDate(transactionDate),
    timeLabel: Number.isNaN(createdAt.getTime()) ? '' : TIME_FORMATTER.format(createdAt),
    typeLabel: isTransfer ? 'Transferência' : isPositive ? 'Entrada' : 'Saída',
    isPositive,
    formattedAmount: `${isPositive ? '+ ' : isTransfer ? '' : '- '}${formatCurrency(amount)}`,
    // Numérico com sinal -- só para o XLSX (célula numérica real, nunca uma
    // string "R$ 50,00"). A UI continua usando formattedAmount/isPositive.
    signedAmount: isTransfer ? amount : isPositive ? amount : -amount,
  };
}

/**
 * Todas as movimentações do período (nunca limitadas a 2 -- essa
 * limitação pertence só ao resumo da Home). Ordem herdada de
 * filterRecordTransactions: mais recente primeiro por transaction_date,
 * desempate por created_at -- a MESMA ordem visual de Registros.
 */
export function buildMonthlyReportTransactions(transactions, categories) {
  const categoryById = new Map((categories ?? []).map((category) => [category.id, category.name]));
  return filterRecordTransactions(transactions ?? [], { sort: 'recent' })
    .map((transaction) => buildTransactionRow(transaction, categoryById));
}

/** Agrupa as linhas (já ordenadas) por dia, preservando a ordem recebida. */
export function groupReportTransactionsByDay(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const list = grouped.get(row.dateKey) ?? [];
    list.push(row);
    grouped.set(row.dateKey, list);
  }
  return [...grouped.entries()].map(([dateKey, items]) => ({
    dateKey,
    label: formatReportDayLabel(dateKey),
    items,
  }));
}

/**
 * Itens de Agenda do período, mais próximo primeiro. Reaproveita
 * buildAgendaItemPresentation (data/hora) e resolveReminderIndicator
 * (lembrete configurado) -- as mesmas fontes já usadas pela Agenda
 * visual e pelo card de lembrete, nunca um novo cálculo de horário/
 * timezone (Date local do navegador, America/Sao_Paulo para o usuário
 * real). Status reaproveita o lifecycle já existente
 * (scheduled/completed/cancelled) -- só traduz o rótulo.
 */
export function buildMonthlyReportAgenda(agendaItems, reminderStatesByItemId = new Map()) {
  return [...(agendaItems ?? [])]
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
    .map((item) => {
      const presentation = buildAgendaItemPresentation(item);
      const reminder = resolveReminderIndicator(reminderStatesByItemId.get(item.id));
      const startsAt = new Date(item.starts_at);
      return {
        id: item.id,
        title: item.title,
        dateLabel: presentation.dateLabel,
        // RELATORIO-SPREADSHEET1: "DD/MM/AA" para a célula da planilha/XLSX
        // -- dateLabel ("20 AGO") continua existindo pro card da V1.
        dateShort: Number.isNaN(startsAt.getTime()) ? '' : formatShortDate(startsAt),
        timeLabel: presentation.timeLabel,
        status: item.status,
        statusLabel: STATUS_LABELS[item.status] ?? item.status,
        reminderLabel: reminder?.label ?? null,
      };
    });
}

/**
 * Estrutura neutra completa do Relatório da Uni. `period`/`summary.income`/
 * `summary.expense` vêm de getMonthRange/summarizeMonth -- se Registros
 * mostra R$ 192,80 de Saídas em agosto, o relatório mostra exatamente o
 * mesmo valor para o mesmo mês, sempre.
 *
 * NUNCA inclui saldo/patrimônio/balance -- só entradas, saídas e as duas
 * contagens (movimentações, compromissos).
 */
export function buildMonthlyReportData({
  transactions = [],
  categories = [],
  agendaItems = [],
  reminderStatesByItemId = new Map(),
  now = new Date(),
} = {}) {
  const period = getMonthRange(now);
  const totals = summarizeMonth(transactions);
  const transactionRows = buildMonthlyReportTransactions(transactions, categories);
  const agendaRows = buildMonthlyReportAgenda(agendaItems, reminderStatesByItemId);

  return {
    period,
    summary: {
      income: totals.income,
      expense: totals.expense,
      incomeLabel: formatCurrency(totals.income),
      expenseLabel: formatCurrency(totals.expense),
      transactionCount: transactionRows.length,
      agendaCount: agendaRows.length,
    },
    // RELATORIO-SPREADSHEET1: lista plana (mesma ordem de
    // buildMonthlyReportTransactions) -- a planilha/XLSX mostra linhas
    // sequenciais, não agrupadas por dia como o card da V1.
    // transactionsByDay é preservado (ainda testado/correto) mas não é mais
    // consumido pela UI nesta fase.
    transactions: transactionRows,
    transactionsByDay: groupReportTransactionsByDay(transactionRows),
    hasTransactions: transactionRows.length > 0,
    agenda: agendaRows,
    hasAgenda: agendaRows.length > 0,
  };
}
