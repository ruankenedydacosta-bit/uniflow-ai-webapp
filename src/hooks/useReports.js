import { useCallback, useEffect, useMemo } from 'react';
import { useSession } from '../app/SessionContext';
import { useTransactions } from './useTransactions.js';
import { useFinancialBalances } from './useFinancialBalances.js';
import { useGoals } from '../features/goals/useGoals.js';
import { FINANCIAL_DATA_CHANGED_EVENT } from '../services/financialDataEvents.js';
import { buildReportsSnapshot } from '../pages/relatorios/reportsCalculations.js';

/**
 * Orquestra apenas dados ja existentes (useTransactions/useFinancialBalances/
 * useGoals) e delega toda a agregacao/matematica a reportsCalculations.js.
 * O hook nao contem logica de calculo propria -- so combina loading/error
 * dos 3 hooks e memoiza o snapshot derivado. Mesmo padrao estrutural de
 * useFutureData.js, porem sem nenhuma dependencia de features/future.
 */
export function useReports({ monthsBack = 6 } = {}) {
  const { workspace } = useSession();
  const workspaceId = workspace?.id;

  const {
    transactions,
    isLoading: transactionsLoading,
    error: transactionsError,
    refresh: refreshTransactions,
  } = useTransactions({ workspaceId });

  const {
    workspaceBalance,
    isLoading: balanceLoading,
    error: balanceError,
    refresh: refreshBalance,
  } = useFinancialBalances({ workspaceId });

  const {
    goals,
    isLoading: goalsLoading,
    error: goalsError,
    refresh: refreshGoals,
  } = useGoals({ workspaceId });

  const refreshAll = useCallback(() => {
    refreshTransactions();
    refreshBalance();
    refreshGoals();
  }, [refreshTransactions, refreshBalance, refreshGoals]);

  useEffect(() => {
    const handler = () => refreshAll();
    window.addEventListener(FINANCIAL_DATA_CHANGED_EVENT, handler);
    return () => window.removeEventListener(FINANCIAL_DATA_CHANGED_EVENT, handler);
  }, [refreshAll]);

  const isLoading = transactionsLoading || balanceLoading || goalsLoading;
  const error = transactionsError || balanceError || goalsError;

  const snapshot = useMemo(
    () => buildReportsSnapshot({ transactions, goals, monthsBack }),
    [transactions, goals, monthsBack],
  );

  return {
    isLoading,
    error,
    workspaceBalance,
    snapshot,
    hasData: snapshot.monthlySeries.length > 0,
    refresh: refreshAll,
  };
}
