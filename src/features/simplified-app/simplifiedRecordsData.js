import { normalizeSearchText } from '../../utils/searchText.js';
import { toDateKey } from './simplifiedAgendaCalendar.js';
import {
  resolveCategoryIconKey,
  resolveCategoryTone,
} from '../categories/categoryIconCatalog.js';

const KNOWN_CATEGORY_ORDER = Object.freeze([
  'alimentacao',
  'transporte',
  'moradia',
  'saude',
  'lazer',
  'educacao',
  'assinaturas',
  'outros',
]);

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('pt-BR');
}

function normalizeCategoryKey(value) {
  const normalized = normalizeText(value);

  if (/aliment|restaurante|mercado/.test(normalized)) return 'alimentacao';
  if (/transport|combust|uber|mobilidade/.test(normalized)) return 'transporte';
  if (/moradia|casa|aluguel|habitacao/.test(normalized)) return 'moradia';
  if (/saude|farmacia|medic/.test(normalized)) return 'saude';
  if (/lazer|entretenimento|viagem/.test(normalized)) return 'lazer';
  if (/educacao|curso|escola|faculdade/.test(normalized)) return 'educacao';
  if (/assinatura|recorrente/.test(normalized)) return 'assinaturas';
  if (/outro|sem categoria/.test(normalized)) return 'outros';
  return normalized || 'outros';
}

function toIsoDate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function getMonthRange(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const lastDay = new Date(year, month, 0).getDate();

  return Object.freeze({
    date,
    dateFrom: toIsoDate(year, month, 1),
    dateTo: toIsoDate(year, month, lastDay),
    inputValue: `${year}-${String(month).padStart(2, '0')}`,
    label: new Intl.DateTimeFormat('pt-BR', {
      month: 'long',
      year: 'numeric',
    }).format(date),
  });
}

export function dateFromMonthInput(value) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value ?? ''));
  if (!match) return new Date();
  return new Date(Number(match[1]), Number(match[2]) - 1, 1);
}

// BLOCO SALDO/RECEITA/DESPESA EDITAVEIS: um ajuste (transaction_type
// 'adjustment') com adjustment_target 'income'/'expense' corrige o total
// exibido daquele card SEM alterar nenhum lançamento real -- soma o delta
// assinado (pode ser negativo, reduzindo o total) aos lançamentos de fato
// daquele tipo no mês. Ajustes com adjustment_target null/'balance'
// (o caso original, ainda o mais comum) nunca entram nessa soma -- só
// afetam o saldo total (workspaceBalance, já calculado no servidor).
function sumAdjustmentDeltaForTarget(completedTransactions, target) {
  return completedTransactions
    .filter(
      (transaction) =>
        transaction.transaction_type === 'adjustment'
        && transaction.adjustment_target === target,
    )
    .reduce((total, transaction) => total + Number(transaction.adjustment_delta || 0), 0);
}

export function summarizeMonth(transactions, workspaceBalance) {
  const completed = transactions.filter((transaction) => transaction.status === 'completed');
  const income = completed
    .filter((transaction) => transaction.transaction_type === 'income')
    .reduce((total, transaction) => total + Number(transaction.amount || 0), 0)
    + sumAdjustmentDeltaForTarget(completed, 'income');
  const expense = completed
    .filter((transaction) => transaction.transaction_type === 'expense')
    .reduce((total, transaction) => total + Number(transaction.amount || 0), 0)
    + sumAdjustmentDeltaForTarget(completed, 'expense');

  return Object.freeze({
    income,
    expense,
    balance: Number(workspaceBalance ?? 0),
  });
}

export function buildCategorySummaries(categories, transactions) {
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const totals = new Map();

  transactions
    .filter(
      (transaction) =>
        transaction.status === 'completed'
        && transaction.transaction_type === 'expense',
    )
    .forEach((transaction) => {
      const category = categoryMap.get(transaction.category_id);
      const id = category?.id ?? 'uncategorized';
      const current = totals.get(id) ?? { amount: 0, count: 0 };
      totals.set(id, {
        amount: current.amount + Number(transaction.amount || 0),
        count: current.count + 1,
      });
    });

  const visibleCategories = categories
    .filter((category) => category.is_active !== false)
    .map((category) => {
      const key = normalizeCategoryKey(category.name);
      const aggregate = totals.get(category.id) ?? { amount: 0, count: 0 };

      return Object.freeze({
        id: category.id,
        name: category.name,
        category_type: category.category_type,
        amount: aggregate.amount,
        count: aggregate.count,
        key,
        icon: resolveCategoryIconKey(category),
        tone: resolveCategoryTone(category),
      });
    });

  if (totals.has('uncategorized')) {
    const aggregate = totals.get('uncategorized');
    const uncategorized = { name: 'Outros', category_type: 'expense' };
    visibleCategories.push(Object.freeze({
      id: 'uncategorized',
      name: 'Outros',
      category_type: 'expense',
      amount: aggregate.amount,
      count: aggregate.count,
      key: 'outros',
      icon: resolveCategoryIconKey(uncategorized),
      tone: resolveCategoryTone(uncategorized),
    }));
  }

  return visibleCategories.sort((left, right) => {
    const leftOrder = KNOWN_CATEGORY_ORDER.indexOf(left.key);
    const rightOrder = KNOWN_CATEGORY_ORDER.indexOf(right.key);
    const normalizedLeft = leftOrder === -1 ? KNOWN_CATEGORY_ORDER.length : leftOrder;
    const normalizedRight = rightOrder === -1 ? KNOWN_CATEGORY_ORDER.length : rightOrder;
    return normalizedLeft - normalizedRight || left.name.localeCompare(right.name, 'pt-BR');
  });
}

export function filterRecordTransactions(
  transactions,
  {
    categoryId = 'all',
    query = '',
    sort = 'recent',
    status = 'completed',
    type = 'all',
  } = {},
) {
  // Busca sem acento e sem caixa nos DOIS lados (termo e campo), com o
  // helper compartilhado de src/utils/searchText.js.
  const normalizedQuery = normalizeSearchText(query);
  const filtered = transactions.filter((transaction) => {
    if (transaction.status !== status) return false;
    if (type !== 'all' && transaction.transaction_type !== type) return false;
    if (categoryId !== 'all') {
      if (categoryId === 'uncategorized' && transaction.category_id) return false;
      if (categoryId !== 'uncategorized' && transaction.category_id !== categoryId) return false;
    }
    return !normalizedQuery || normalizeSearchText(transaction.description).includes(normalizedQuery);
  });

  return filtered.sort((left, right) => {
    const direction = sort === 'oldest' ? 1 : -1;
    const dateComparison = String(left.transaction_date).localeCompare(
      String(right.transaction_date),
    );
    if (dateComparison !== 0) return dateComparison * direction;
    return String(left.created_at ?? left.id).localeCompare(
      String(right.created_at ?? right.id),
    ) * direction;
  });
}

export function formatRelativeTransactionDate(value, referenceDate = new Date()) {
  if (!value) return '';
  const transactionDate = new Date(`${value}T12:00:00`);
  const reference = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
    12,
  );
  const dayDifference = Math.round((reference - transactionDate) / 86400000);

  if (dayDifference === 0) return 'Hoje';
  if (dayDifference === 1) return 'Ontem';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
  }).format(transactionDate);
}


// Previstos vencidos de meses anteriores esperam confirmação, então só o mês
// que contém hoje os carrega. Nos outros (passados e futuros) vale a data do
// mês, senão a parcela de julho reaparece em agosto, setembro...
export function monthContainsToday(monthRange, todayKey) {
  return monthRange.dateFrom <= todayKey && todayKey <= monthRange.dateTo;
}

export function plannedQueryDateFrom(monthRange, todayKey) {
  return monthContainsToday(monthRange, todayKey) ? undefined : monthRange.dateFrom;
}

// Previstos que pertencem à tela do mês. Também descarta o que sobrou de um
// mês anterior enquanto a nova consulta carrega.
export function selectPlannedForMonth(transactions, monthRange, todayKey) {
  const includesOverdue = monthContainsToday(monthRange, todayKey);
  return transactions.filter((transaction) => {
    const date = String(transaction.transaction_date);
    if (date > monthRange.dateTo) return false;
    return date >= monthRange.dateFrom || (includesOverdue && date < todayKey);
  });
}

// Previsto cuja data é hoje ou já passou espera confirmação.
export function isPlannedDue(transaction, referenceDate = new Date()) {
  return String(transaction.transaction_date) <= toDateKey(referenceDate);
}

// Linha de apoio do previsto: data e categoria; se a data chegou, o aviso
// para confirmar.
export function describePlannedTransaction(transaction, categoryName, referenceDate = new Date()) {
  const date = new Date(`${transaction.transaction_date}T12:00:00`);
  const reference = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
    12,
  );
  const daysLate = Math.round((reference - date) / 86400000);

  if (daysLate < 0) {
    const day = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(date);
    return { due: false, text: `${day} · ${categoryName}` };
  }
  const dueText = daysLate === 0 ? 'Vence hoje' : daysLate === 1 ? 'Venceu ontem' : `Venceu há ${daysLate} dias`;
  return { due: true, dueText, text: `${dueText} · Confirme` };
}

// Saldo dos previstos: entradas somam, saídas subtraem, transferência não
// muda o total.
export function summarizePlannedBalance(transactions) {
  return transactions.reduce((total, transaction) => {
    const amount = Number(transaction.amount || 0);
    if (transaction.transaction_type === 'income') return total + amount;
    if (transaction.transaction_type === 'expense') return total - amount;
    return total;
  }, 0);
}

// Entradas e saídas previstas; transferência e ajuste ficam de fora.
export function summarizePlannedTotals(transactions) {
  return transactions.reduce((totals, transaction) => {
    const amount = Number(transaction.amount || 0);
    if (transaction.transaction_type === 'income') totals.income += amount;
    if (transaction.transaction_type === 'expense') totals.expense += amount;
    return totals;
  }, { income: 0, expense: 0 });
}

// O aviso fica o tempo de ler: 1,5 s de reação mais 50 ms por caractere,
// entre 4 e 15 s. O X dispensa antes.
export function transactionNoticeDuration(message) {
  return Math.min(15000, Math.max(4000, 1500 + message.length * 50));
}
