import { useMemo } from 'react';
import { buildFinancialSnapshot } from './financialSnapshot.js';

function getCurrentMonthYear() {
  const now = new Date();
  return { month: now.getMonth(), year: now.getFullYear() };
}

function isInCurrentMonth(tx, month, year) {
  const parts = (tx.transaction_date || '').split('-');
  if (parts.length < 2) return false;
  const [y, m] = parts.map(Number);
  return y === year && m === month + 1;
}

export function buildFinancialContext({
  accounts,
  transactions,
  categories,
  workspaceBalance,
  accountBalances,
} = {}) {
  const safeAccounts = accounts || [];
  const safeTransactions = transactions || [];
  const safeCategories = categories || [];

  const currentMonth = getCurrentMonthYear();

  const monthlyTransactions = safeTransactions.filter((tx) =>
    isInCurrentMonth(tx, currentMonth.month, currentMonth.year),
  );

  const monthlyIncome = monthlyTransactions
    .filter((tx) => tx.transaction_type === 'income')
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

  const monthlyExpense = monthlyTransactions
    .filter((tx) => tx.transaction_type === 'expense')
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

  const balance = workspaceBalance != null
    ? Number(workspaceBalance)
    : safeAccounts.reduce((sum, acct) => sum + Number(acct.current_balance || 0), 0);

  const result = monthlyIncome - monthlyExpense;

  const recentTransactions = [...safeTransactions]
    .sort((a, b) => (b.transaction_date || '').localeCompare(a.transaction_date || ''))
    .slice(0, 5);

  const categoriesById = new Map(safeCategories.map((c) => [c.id, c.name]));
  const accountsById = new Map(safeAccounts.map((account) => [account.id, account.name]));

  const expensesByCategory = {};
  monthlyTransactions
    .filter((tx) => tx.transaction_type === 'expense')
    .forEach((tx) => {
      const catName = categoriesById.get(tx.category_id) || 'Sem categoria';
      expensesByCategory[catName] = (expensesByCategory[catName] || 0) + Number(tx.amount || 0);
    });

  const entries = Object.entries(expensesByCategory);
  entries.sort(([, a], [, b]) => b - a);
  const topCategory = entries.length > 0
    ? { name: entries[0][0], amount: entries[0][1] }
    : null;

  const hasData = safeTransactions.length > 0
    || (workspaceBalance != null && Number(workspaceBalance) !== 0)
    || safeAccounts.some((a) => Number(a.current_balance || 0) !== 0);

  return {
    balance,
    monthlyIncome,
    monthlyExpense,
    result,
    recentTransactions,
    expensesByCategory,
    topCategory,
    categoriesById,
    accountsById,
    hasData,
    // Snapshot financeiro completo (Fase 2): estrutura única que representa
    // todo o estado financeiro do usuário para as consultas inteligentes.
    snapshot: buildFinancialSnapshot({
      accounts: safeAccounts,
      categories: safeCategories,
      transactions: safeTransactions,
      workspaceBalance,
      accountBalances,
    }),
  };
}

export function useUniChatFinancialData({
  accounts,
  transactions,
  categories,
  workspaceBalance,
  accountBalances,
}) {
  return useMemo(
    () => buildFinancialContext({
      accounts,
      transactions,
      categories,
      workspaceBalance,
      accountBalances,
    }),
    [accounts, transactions, categories, workspaceBalance, accountBalances],
  );
}
