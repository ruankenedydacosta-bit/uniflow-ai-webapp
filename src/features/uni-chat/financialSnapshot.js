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
  // Sprint 4 (Bloco 4.2): agregados adicionais, mesmo padrão de
  // `expensesByCategory` já existente -- só somam o que já está em
  // `currentMonthTransactions`, nenhuma consulta nova, nenhum cálculo
  // duplicado em outro lugar.
  const incomeByCategory = new Map();
  const expensesByAccount = new Map();
  const incomeByAccount = new Map();
  for (const tx of currentMonthTransactions) {
    const amount = roundMoney(tx.amount);
    const account = tx.account_id ? accountsById.get(tx.account_id) : null;
    const accountKey = account ? account.name : 'Conta desconhecida';
    if (tx.transaction_type === 'income') {
      monthlyIncome += amount;
      const category = tx.category_id ? categoriesById.get(tx.category_id) : null;
      const key = category ? category.name : 'Sem categoria';
      incomeByCategory.set(key, roundMoney((incomeByCategory.get(key) ?? 0) + amount));
      incomeByAccount.set(accountKey, roundMoney((incomeByAccount.get(accountKey) ?? 0) + amount));
    }
    if (tx.transaction_type === 'expense') {
      monthlyExpense += amount;
      const category = tx.category_id ? categoriesById.get(tx.category_id) : null;
      const key = category ? category.name : 'Sem categoria';
      expensesByCategory.set(key, roundMoney((expensesByCategory.get(key) ?? 0) + amount));
      expensesByAccount.set(accountKey, roundMoney((expensesByAccount.get(accountKey) ?? 0) + amount));
    }
  }
  monthlyIncome = roundMoney(monthlyIncome);
  monthlyExpense = roundMoney(monthlyExpense);
  // Maiores despesas do mês corrente -- mesma fonte de dados
  // (currentMonthTransactions), só ordenada por valor. Nunca inventa: se
  // não há despesas, a lista vem vazia.
  const topExpensesCurrentMonth = currentMonthTransactions
    .filter((tx) => tx.transaction_type === 'expense')
    .slice()
    .sort((a, b) => roundMoney(b.amount) - roundMoney(a.amount));

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
    incomeByCategory,
    expensesByAccount,
    incomeByAccount,
    topExpensesCurrentMonth,
    hasData,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 4 (Bloco 4.5.1) — API de agregação por INTERVALO ARBITRÁRIO.
//
// Generaliza a agregação do mês corrente (acima) para qualquer intervalo
// [start, end] resolvido por resolveTemporalRange (uni-intents) — nenhum
// cálculo novo, mesma lógica de soma/agrupamento já usada para o mês
// corrente, só sem a restrição de mês. Reaproveita snapshot.transactions
// (já filtrado/validado/ordenado por buildFinancialSnapshot) e
// snapshot.accountsById/categoriesById (já resolvidos) -- nunca refaz a
// leitura/normalização de dados brutos.
// ─────────────────────────────────────────────────────────────────────────────

// Filtra transações reais do snapshot por intervalo de datas (inclusive) e
// filtros opcionais de conta/categoria/tipo. Nunca inventa: sem
// snapshot/transactions válidos, devolve lista vazia.
export function queryTransactionsInRange(snapshot, {
  start = null,
  end = null,
  accountIds = null,
  categoryIds = null,
  transactionTypes = null,
  limit = null,
} = {}) {
  if (!snapshot || !Array.isArray(snapshot.transactions)) return [];
  const accountFilter = Array.isArray(accountIds) && accountIds.length ? new Set(accountIds) : null;
  const categoryFilter = Array.isArray(categoryIds) && categoryIds.length ? new Set(categoryIds) : null;
  const typeFilter = Array.isArray(transactionTypes) && transactionTypes.length ? new Set(transactionTypes) : null;

  const filtered = snapshot.transactions.filter((tx) => {
    const date = tx.transaction_date;
    if (start && (!date || date < start)) return false;
    if (end && (!date || date > end)) return false;
    if (accountFilter && !accountFilter.has(tx.account_id)) return false;
    if (categoryFilter && !categoryFilter.has(tx.category_id)) return false;
    if (typeFilter && !typeFilter.has(tx.transaction_type)) return false;
    return true;
  });

  return Number.isInteger(limit) && limit > 0 ? filtered.slice(0, limit) : filtered;
}

// Agrega receitas/despesas/por-conta/por-categoria/maiores-despesas para
// QUALQUER intervalo real -- mesmo padrão de agregação já usado para o mês
// corrente (buildFinancialSnapshot), generalizado. `range` deve ser o
// retorno JÁ RESOLVIDO de resolveTemporalRange (status 'resolved'); esta
// função nunca resolve texto, só agrega dados reais para um intervalo já
// validado.
export function aggregateFinancialRange(snapshot, range) {
  const transactions = queryTransactionsInRange(snapshot, { start: range?.start, end: range?.end });
  let income = 0;
  let expense = 0;
  const expensesByCategory = new Map();
  const incomeByCategory = new Map();
  const expensesByAccount = new Map();
  const incomeByAccount = new Map();

  for (const tx of transactions) {
    const amount = roundMoney(tx.amount);
    const account = tx.account_id ? snapshot.accountsById?.get(tx.account_id) : null;
    const accountKey = account ? account.name : 'Conta desconhecida';
    const category = tx.category_id ? snapshot.categoriesById?.get(tx.category_id) : null;
    const categoryKey = category ? category.name : 'Sem categoria';

    if (tx.transaction_type === 'income') {
      income += amount;
      incomeByCategory.set(categoryKey, roundMoney((incomeByCategory.get(categoryKey) ?? 0) + amount));
      incomeByAccount.set(accountKey, roundMoney((incomeByAccount.get(accountKey) ?? 0) + amount));
    }
    if (tx.transaction_type === 'expense') {
      expense += amount;
      expensesByCategory.set(categoryKey, roundMoney((expensesByCategory.get(categoryKey) ?? 0) + amount));
      expensesByAccount.set(accountKey, roundMoney((expensesByAccount.get(accountKey) ?? 0) + amount));
    }
  }
  income = roundMoney(income);
  expense = roundMoney(expense);

  const topExpenses = transactions
    .filter((tx) => tx.transaction_type === 'expense')
    .slice()
    .sort((a, b) => roundMoney(b.amount) - roundMoney(a.amount));

  return {
    range: range ? { start: range.start, end: range.end, label: range.label } : null,
    transactions,
    transactionCount: transactions.length,
    income,
    expense,
    result: roundMoney(income - expense),
    expensesByCategory,
    incomeByCategory,
    expensesByAccount,
    incomeByAccount,
    topExpenses,
  };
}
