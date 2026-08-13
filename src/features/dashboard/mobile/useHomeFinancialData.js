import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '../../../app/SessionContext';
import { useAccounts, useCategories, useFinancialBalances, useTransactions } from '../../../hooks';
import { useGoals } from '../../goals/useGoals';
import { buildFinanceiroMobileData } from '../../../pages/financeiro/mobile/financeiroMobileData';
import { FINANCIAL_DATA_CHANGED_EVENT } from '../../../services/financialDataEvents';
import { buildFutureProjections } from '../../future/futureService.js';

const DATE_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
});

const CURRENCY_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export function useHomeFinancialData() {
  const { workspace } = useSession();
  const workspaceId = workspace?.id;

  const [showSkeleton, setShowSkeleton] = useState(true);
  const prevWorkspaceRef = useRef(workspaceId);

  const {
    accountBalances,
    workspaceBalance,
    isLoading: balanceLoading,
    error: balanceError,
    refresh: refreshBalance,
  } = useFinancialBalances({ workspaceId });

  const {
    accounts,
    isLoading: accountsLoading,
    error: accountsError,
    refresh: refreshAccounts,
  } = useAccounts({ workspaceId });

  const {
    transactions,
    isLoading: transactionsLoading,
    error: transactionsError,
    refresh: refreshTransactions,
  } = useTransactions({ workspaceId });

  const {
    categories,
    isLoading: categoriesLoading,
    error: categoriesError,
    refresh: refreshCategories,
  } = useCategories({ workspaceId });

  const {
    goals,
    isLoading: goalsLoading,
    error: goalsError,
    refresh: refreshGoals,
  } = useGoals({ workspaceId });

  const isLoading = balanceLoading || transactionsLoading || categoriesLoading || goalsLoading || accountsLoading;
  const error = balanceError ?? transactionsError ?? categoriesError ?? goalsError ?? accountsError;

  useEffect(() => {
    if (showSkeleton && !isLoading) {
      Promise.resolve().then(() => setShowSkeleton(false));
    }
  }, [showSkeleton, isLoading]);

  useEffect(() => {
    if (prevWorkspaceRef.current !== workspaceId) {
      prevWorkspaceRef.current = workspaceId;
      Promise.resolve().then(() => setShowSkeleton(true));
    }
  }, [workspaceId]);

  const refresh = useCallback(() => {
    refreshBalance();
    refreshTransactions();
    refreshCategories();
    refreshGoals();
    refreshAccounts();
  }, [refreshBalance, refreshTransactions, refreshCategories, refreshGoals, refreshAccounts]);

  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener(FINANCIAL_DATA_CHANGED_EVENT, handler);
    return () => window.removeEventListener(FINANCIAL_DATA_CHANGED_EVENT, handler);
  }, [refresh]);

  const financeiroData = useMemo(
    () => buildFinanceiroMobileData({ transactions, workspaceBalance, categories, accounts, accountBalances }),
    [transactions, workspaceBalance, categories, accounts, accountBalances],
  );

  const projections = useMemo(
    () => buildFutureProjections({ workspaceBalance, transactions, goals }),
    [workspaceBalance, transactions, goals],
  );

  const hasDerivedFinancialData = workspaceBalance != null;
  const hasIncome = transactions.some((t) => t.transaction_type === 'income');
  const hasExpense = transactions.some((t) => t.transaction_type === 'expense');

  const summary = useMemo(() => [
    {
      id: 'income',
      label: 'Entrada',
      value: financeiroData.income,
      hasData: hasIncome,
    },
    {
      id: 'expense',
      label: 'Saída',
      value: financeiroData.expense,
      hasData: hasExpense,
    },
    {
      id: 'reserve',
      label: 'Reserva',
      value: '—',
      hasData: false,
    },
  ], [financeiroData, hasIncome, hasExpense]);

  const recentTransactions = useMemo(
    () => {
      const categoriesById = new Map(categories.map((c) => [c.id, c.name]));
      return [...transactions]
        .filter((transaction) => transaction.status === 'completed')
        .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date))
        .slice(0, 5)
        .map((tx) => {
          const isIncome = tx.transaction_type === 'income';
          const isExpense = tx.transaction_type === 'expense';
          const sign = isIncome ? '+' : isExpense ? '-' : '↔';
          const category = categoriesById.get(tx.category_id)
            ?? (tx.transaction_type === 'transfer' ? 'Transferência' : 'Sem categoria');
          const date = DATE_FORMATTER.format(new Date(
            Number(tx.transaction_date.split('-')[0]),
            Number(tx.transaction_date.split('-')[1]) - 1,
            Number(tx.transaction_date.split('-')[2]),
            12,
          ));
          return {
            id: tx.id,
            description: tx.description,
            category,
            date,
            amount: `${sign} ${CURRENCY_FORMATTER.format(Number(tx.amount || 0))}`,
            tone: isIncome ? 'income' : isExpense ? 'expense' : 'neutral',
            transaction_type: tx.transaction_type,
          };
        });
    },
    [transactions, categories],
  );

  const homeGoals = useMemo(
    () => goals.map((g) => ({
      id: g.id,
      title: g.name,
      progress: g.target_amount > 0
        ? Math.round((Number(g.current_amount || 0) / Number(g.target_amount)) * 100)
        : 0,
    })),
    [goals],
  );

  const hasData = transactions.length > 0 || hasDerivedFinancialData || goals.length > 0;

  return {
    summary,
    recentTransactions,
    goals: homeGoals,
    rawGoals: goals,
    transactions,
    categories,
    workspaceBalance,
    financialPeriod: financeiroData,
    projections,
    chart: financeiroData.chart,
    isLoading: showSkeleton,
    error,
    hasData,
    refresh,
  };
}
