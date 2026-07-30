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

const CATEGORY_PRESENTATION = Object.freeze({
  alimentacao: Object.freeze({ icon: 'food', tone: 'orange' }),
  transporte: Object.freeze({ icon: 'transport', tone: 'blue' }),
  moradia: Object.freeze({ icon: 'home', tone: 'green' }),
  saude: Object.freeze({ icon: 'health', tone: 'red' }),
  lazer: Object.freeze({ icon: 'leisure', tone: 'purple' }),
  educacao: Object.freeze({ icon: 'education', tone: 'yellow' }),
  assinaturas: Object.freeze({ icon: 'subscription', tone: 'cyan' }),
  outros: Object.freeze({ icon: 'other', tone: 'gray' }),
});

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

export function summarizeMonth(transactions, workspaceBalance) {
  const completed = transactions.filter((transaction) => transaction.status === 'completed');
  const income = completed
    .filter((transaction) => transaction.transaction_type === 'income')
    .reduce((total, transaction) => total + Number(transaction.amount || 0), 0);
  const expense = completed
    .filter((transaction) => transaction.transaction_type === 'expense')
    .reduce((total, transaction) => total + Number(transaction.amount || 0), 0);

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
      const presentation = CATEGORY_PRESENTATION[key] ?? {
        icon: 'custom',
        tone: 'blue',
      };
      const aggregate = totals.get(category.id) ?? { amount: 0, count: 0 };

      return Object.freeze({
        id: category.id,
        name: category.name,
        amount: aggregate.amount,
        count: aggregate.count,
        key,
        ...presentation,
      });
    });

  if (totals.has('uncategorized')) {
    const aggregate = totals.get('uncategorized');
    visibleCategories.push(Object.freeze({
      id: 'uncategorized',
      name: 'Outros',
      amount: aggregate.amount,
      count: aggregate.count,
      key: 'outros',
      ...CATEGORY_PRESENTATION.outros,
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
    accountId = 'all',
    categoryId = 'all',
    query = '',
    sort = 'recent',
    type = 'all',
  } = {},
) {
  const normalizedQuery = normalizeText(query);
  const filtered = transactions.filter((transaction) => {
    if (transaction.status !== 'completed') return false;
    if (type !== 'all' && transaction.transaction_type !== type) return false;
    if (categoryId !== 'all') {
      if (categoryId === 'uncategorized' && transaction.category_id) return false;
      if (categoryId !== 'uncategorized' && transaction.category_id !== categoryId) return false;
    }
    if (
      accountId !== 'all'
      && transaction.account_id !== accountId
      && transaction.destination_account_id !== accountId
    ) {
      return false;
    }
    return !normalizedQuery || normalizeText(transaction.description).includes(normalizedQuery);
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

