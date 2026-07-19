import { useCallback, useEffect, useMemo } from 'react';
import { useSession } from '../../../app/SessionContext';
import { useCategories, useFinancialBalances, useTransactions } from '../../../hooks';
import { buildFinanceiroMobileData } from '../../../pages/financeiro/mobile/financeiroMobileData';
import { FINANCIAL_DATA_CHANGED_EVENT } from '../../../services/financialDataEvents';

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

  const {
    workspaceBalance,
    isLoading: balanceLoading,
    error: balanceError,
    refresh: refreshBalance,
  } = useFinancialBalances({ workspaceId });

  const {
    transactions,
    isLoading: transactionsLoading,
    error: transactionsError,
    refresh: refreshTransactions,
  } = useTransactions({ workspaceId });

  const { categories } = useCategories({ workspaceId });

  const isLoading = balanceLoading || transactionsLoading;
  const error = balanceError ?? transactionsError;

  const refresh = useCallback(() => {
    refreshBalance();
    refreshTransactions();
  }, [refreshBalance, refreshTransactions]);

  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener(FINANCIAL_DATA_CHANGED_EVENT, handler);
    return () => window.removeEventListener(FINANCIAL_DATA_CHANGED_EVENT, handler);
  }, [refresh]);

  const financeiroData = useMemo(
    () => buildFinanceiroMobileData({ transactions, workspaceBalance, categories }),
    [transactions, workspaceBalance, categories],
  );

  const hasBalance = workspaceBalance != null && Number(workspaceBalance) !== 0;
  const hasIncome = transactions.some((t) => t.transaction_type === 'income');
  const hasExpense = transactions.some((t) => t.transaction_type === 'expense');

  const summary = useMemo(() => [
    {
      id: 'balance',
      label: 'Saldo',
      value: financeiroData.balance,
      hasData: hasBalance,
    },
    {
      id: 'income',
      label: 'Receita',
      value: financeiroData.income,
      hasData: hasIncome,
    },
    {
      id: 'expense',
      label: 'Despesa',
      value: financeiroData.expense,
      hasData: hasExpense,
    },
    {
      id: 'reserve',
      label: 'Reserva',
      value: '—',
      hasData: false,
    },
  ], [financeiroData, hasBalance, hasIncome, hasExpense]);

  const recentTransactions = useMemo(
    () => {
      const categoriesById = new Map(categories.map((c) => [c.id, c.name]));
      return [...transactions]
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

  const hasData = transactions.length > 0 || hasBalance;

  return {
    summary,
    recentTransactions,
    isLoading,
    error,
    hasData,
    refresh,
  };
}
