// Snapshot financeiro completo da Uni.
//
// Estrutura única que representa TODO o estado financeiro do usuário para as
// consultas financeiras inteligentes (Fase 2 do bloco "Consultas Financeiras
// Inteligentes"):
//
// - contas (com saldo resolvido por conta)
// - saldo total
// - receitas e despesas (do mês corrente)
// - categorias (resolvidas por id)
// - histórico recente ordenado
// - última movimentação / receita / despesa
// - accountName / categoryName resolvidos na própria estrutura
// - datas e valores normalizados
//
// É uma função pura: nunca acessa React, Supabase nem rede. Toda consulta
// financeira da Uni deve consumir este snapshot, nunca depender do texto da
// conversa isoladamente.

const VALID_TRANSACTION_TYPES = new Set(['income', 'expense']);

export function normalizeFinancialText(value) {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function roundMoney(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * 100) / 100;
}

export function monthKeyOf(dateStr) {
  if (typeof dateStr !== 'string') return null;
  return dateStr.slice(0, 7);
}

function getToday(referenceDate) {
  if (typeof referenceDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(referenceDate)) {
    return referenceDate.slice(0, 10);
  }
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isInCurrentMonth(tx, currentMonth) {
  return monthKeyOf(tx.transaction_date) === currentMonth;
}

function sortTransactionsDesc(transactions) {
  return [...transactions].sort(
    (a, b) =>
      (b.transaction_date || '').localeCompare(a.transaction_date || '')
      || (b.created_at || '').localeCompare(a.created_at || '')
      || String(b.id || '').localeCompare(String(a.id || '')),
  );
}

function buildAccountsById(accounts) {
  return new Map((accounts || []).map((account) => [account.id, account]));
}

function buildCategoriesById(categories) {
  return new Map((categories || []).map((category) => [category.id, category]));
}

function buildAccountBalancesById(accounts, accountBalances) {
  const derived = new Map(
    (accountBalances || [])
      .filter((balance) => balance && balance.account_id)
      .map((balance) => [balance.account_id, roundMoney(balance.derived_balance)]),
  );
  const balancesById = new Map();
  for (const account of accounts || []) {
    const value = derived.get(account.id);
    balancesById.set(
      account.id,
      value != null ? value : roundMoney(account.current_balance),
    );
  }
  return balancesById;
}

export function buildFinancialSnapshot({
  accounts = [],
  categories = [],
  transactions = [],
  workspaceBalance = null,
  accountBalances = null,
  referenceDate = null,
} = {}) {
  const safeAccounts = Array.isArray(accounts) ? accounts : [];
  const safeCategories = Array.isArray(categories) ? categories : [];
  const safeTransactions = Array.isArray(transactions) ? transactions : [];

  const today = getToday(referenceDate);
  const currentMonth = monthKeyOf(today);
  const accountsById = buildAccountsById(safeAccounts);
  const categoriesById = buildCategoriesById(safeCategories);
  const accountBalancesById = buildAccountBalancesById(safeAccounts, accountBalances);

  const totalBalance = workspaceBalance != null
    ? roundMoney(workspaceBalance)
    : roundMoney([...accountBalancesById.values()].reduce((sum, value) => sum + value, 0));

  const validTransactions = sortTransactionsDesc(
    safeTransactions.filter(
      (tx) =>
        VALID_TRANSACTION_TYPES.has(tx.transaction_type)
        && roundMoney(tx.amount) > 0
        && tx.status !== 'canceled',
    ),
  );

  const recentTransactions = validTransactions.slice(0, 5);
  const lastTransaction = validTransactions[0] ?? null;
  const lastIncome = validTransactions.find((tx) => tx.transaction_type === 'income') ?? null;
  const lastExpense = validTransactions.find((tx) => tx.transaction_type === 'expense') ?? null;

  const currentMonthTransactions = validTransactions.filter((tx) =>
    isInCurrentMonth(tx, currentMonth),
  );

  let monthlyIncome = 0;
  let monthlyExpense = 0;
  const expensesByCategory = new Map();
  for (const tx of currentMonthTransactions) {
    const amount = roundMoney(tx.amount);
    if (tx.transaction_type === 'income') monthlyIncome += amount;
    if (tx.transaction_type === 'expense') monthlyExpense += amount;
    if (tx.transaction_type === 'expense') {
      const category = tx.category_id ? categoriesById.get(tx.category_id) : null;
      const key = category ? category.name : 'Sem categoria';
      expensesByCategory.set(key, roundMoney((expensesByCategory.get(key) ?? 0) + amount));
    }
  }
  monthlyIncome = roundMoney(monthlyIncome);
  monthlyExpense = roundMoney(monthlyExpense);

  const hasData = validTransactions.length > 0
    || (workspaceBalance != null && roundMoney(workspaceBalance) !== 0)
    || [...accountBalancesById.values()].some((value) => value !== 0);

  return {
    referenceDate: today,
    currentMonth,
    accounts: safeAccounts,
    accountsById,
    accountBalancesById,
    totalBalance,
    categories: safeCategories,
    categoriesById,
    transactions: validTransactions,
    recentTransactions,
    lastTransaction,
    lastIncome,
    lastExpense,
    currentMonthTransactions,
    monthlyIncome,
    monthlyExpense,
    monthlyResult: roundMoney(monthlyIncome - monthlyExpense),
    expensesByCategory,
    hasData,
  };
}
