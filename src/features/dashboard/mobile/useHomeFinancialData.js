import { useCallback, useEffect, useMemo } from 'react';
import { useSession } from '../../../app/SessionContext';
import { useFinancialBalances, useTransactions } from '../../../hooks';
import { buildFinanceiroMobileData } from '../../../pages/financeiro/mobile/financeiroMobileData';
import { FINANCIAL_DATA_CHANGED_EVENT } from '../../../services/financialDataEvents';

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
    () => buildFinanceiroMobileData({ transactions, workspaceBalance }),
    [transactions, workspaceBalance],
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
    () => transactions.slice(0, 5),
    [transactions],
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
