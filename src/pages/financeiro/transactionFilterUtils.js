// Lógica pura de busca, filtros e ordenação de lançamentos financeiros.
// Nenhuma dependência de React/Supabase — testável via node --test.
// Opera inteiramente sobre a lista de transações já carregada no cliente
// (client-side, sobre os dados já retornados por `useTransactions`), depois
// que o seletor de período existente já restringiu o conjunto.

// --- Busca por texto -------------------------------------------------------

/**
 * Normaliza texto para busca: minúsculas + remoção de diacríticos (NFD).
 * "Café ação" -> "cafe acao".
 */
export function normalizeSearchText(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Verifica se a transação corresponde ao texto buscado, olhando em
 * descrição, observação (notes), nome da categoria e nome da conta.
 * `categoriesById`/`accountsById` são Maps opcionais (id -> registro com
 * `.name`) para resolver os nomes reais; sem eles, a busca ignora esses
 * campos (continua funcionando só com descrição/observação).
 */
export function matchesSearchQuery(transaction, query, { categoriesById, accountsById } = {}) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;
  if (!transaction) return false;

  const categoryName = categoriesById?.get(transaction.category_id)?.name;
  const accountName = accountsById?.get(transaction.account_id)?.name;

  const haystacks = [
    transaction.description,
    transaction.notes,
    categoryName,
    accountName,
  ];

  return haystacks.some((value) => normalizeSearchText(value).includes(normalizedQuery));
}

// --- Derivações sobre uma transação ----------------------------------------

/**
 * Uma transação é considerada "parcelada" se tiver installment_total > 1
 * OU metadata.installment_group_id presente (convenção da Fase 5.2).
 */
export function isInstallmentTransaction(transaction) {
  if (!transaction) return false;
  const total = Number(transaction.installment_total);
  if (Number.isFinite(total) && total > 1) return true;
  return Boolean(transaction?.metadata?.installment_group_id);
}

export function isRecurringTransaction(transaction) {
  return transaction?.is_recurring === true;
}

// --- Opções de filtro derivadas dos dados reais -----------------------------

/**
 * Lista de formas de pagamento realmente usadas nos dados (payment_method é
 * texto livre — nunca inventar uma lista fixa). Ordenada alfabeticamente
 * (pt-BR), sem duplicatas, ignorando valores vazios/nulos.
 */
export function derivePaymentMethodOptions(transactions = []) {
  const seen = new Set();
  for (const transaction of transactions) {
    const value = typeof transaction?.payment_method === 'string' ? transaction.payment_method.trim() : '';
    if (value) seen.add(value);
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

// --- Filtro combinado --------------------------------------------------------

export const DEFAULT_TRANSACTION_FILTERS = Object.freeze({
  search: '',
  type: 'all', // all | income | expense | transfer | adjustment
  accountId: 'all',
  categoryId: 'all',
  paymentMethod: 'all',
  installment: 'all', // all | installment | single
  recurring: 'all', // all | recurring | single
  sortOrder: 'recent', // recent | oldest | highest | lowest
});

export function hasActiveTransactionFilters(filters = {}) {
  const merged = { ...DEFAULT_TRANSACTION_FILTERS, ...filters };
  return (
    (merged.search ?? '').trim() !== ''
    || merged.type !== 'all'
    || merged.accountId !== 'all'
    || merged.categoryId !== 'all'
    || merged.paymentMethod !== 'all'
    || merged.installment !== 'all'
    || merged.recurring !== 'all'
  );
}

function compareByDate(a, b, direction) {
  const dateA = String(a.transaction_date ?? '');
  const dateB = String(b.transaction_date ?? '');
  return direction === 'recent' ? dateB.localeCompare(dateA) : dateA.localeCompare(dateB);
}

function compareByAmount(a, b, direction) {
  const amountA = Number(a.amount) || 0;
  const amountB = Number(b.amount) || 0;
  return direction === 'highest' ? amountB - amountA : amountA - amountB;
}

/**
 * Restringe uma lista de transações a um intervalo de datas (inclusive),
 * comparando `transaction_date` (string 'YYYY-MM-DD') com `startKey`/`endKey`
 * no mesmo formato. Sem `startKey`/`endKey`, retorna a lista sem alterações.
 *
 * Função genérica e independente de qualquer noção de "período" (mês,
 * semana, trimestre...) — quem calcula o intervalo é `getFinancialPeriod`
 * (`mobile/financeiroMobileData.js`), já usado pelo seletor de período do
 * mobile. Existe aqui só para o desktop poder reaproveitar esse mesmo
 * intervalo sem duplicar a lógica de comparação de datas.
 */
export function filterTransactionsByDateRange(transactions = [], { startKey, endKey } = {}) {
  if (!startKey || !endKey) return transactions;
  return transactions.filter(
    (transaction) => transaction.transaction_date >= startKey && transaction.transaction_date <= endKey,
  );
}

export function sortTransactions(transactions = [], sortOrder = 'recent') {
  const list = [...transactions];
  if (sortOrder === 'highest' || sortOrder === 'lowest') {
    return list.sort((a, b) => compareByAmount(a, b, sortOrder));
  }
  return list.sort((a, b) => compareByDate(a, b, sortOrder));
}

/**
 * Aplica busca + filtros + ordenação sobre uma lista de transações já
 * carregada (tipicamente já restrita ao período ativo pelo seletor de
 * período existente — esta função NÃO conhece período, só o que recebe).
 *
 * `categoriesById`/`accountsById` são Maps (id -> registro com `.name`)
 * usados para a busca por nome de categoria/conta.
 */
export function applyTransactionFilters(transactions = [], filters = {}, { categoriesById, accountsById } = {}) {
  const merged = { ...DEFAULT_TRANSACTION_FILTERS, ...filters };
  let result = transactions;

  if (merged.type !== 'all') {
    result = result.filter((t) => t.transaction_type === merged.type);
  }

  if (merged.accountId !== 'all') {
    result = result.filter((t) => t.account_id === merged.accountId);
  }

  if (merged.categoryId !== 'all') {
    result = result.filter((t) => t.category_id === merged.categoryId);
  }

  if (merged.paymentMethod !== 'all') {
    result = result.filter((t) => (t.payment_method ?? '').trim() === merged.paymentMethod);
  }

  if (merged.installment === 'installment') {
    result = result.filter((t) => isInstallmentTransaction(t));
  } else if (merged.installment === 'single') {
    result = result.filter((t) => !isInstallmentTransaction(t));
  }

  if (merged.recurring === 'recurring') {
    result = result.filter((t) => isRecurringTransaction(t));
  } else if (merged.recurring === 'single') {
    result = result.filter((t) => !isRecurringTransaction(t));
  }

  if ((merged.search ?? '').trim()) {
    result = result.filter((t) => matchesSearchQuery(t, merged.search, { categoriesById, accountsById }));
  }

  return sortTransactions(result, merged.sortOrder);
}
