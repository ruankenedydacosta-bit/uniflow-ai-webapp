import { useCallback, useEffect, useMemo } from 'react';
import { useSession } from '../app/SessionContext';
import { useTransactions } from './useTransactions.js';
import { useFinancialBalances } from './useFinancialBalances.js';
import { useGoals } from '../features/goals/useGoals.js';
import { FINANCIAL_DATA_CHANGED_EVENT } from '../services/financialDataEvents.js';
import { buildReportsSnapshot, calcReportsWindowStart } from '../pages/relatorios/reportsCalculations.js';

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

  // R2: pede ao banco somente transacoes completed (mesmo criterio ja
  // usado pelo Dashboard em useHomeFinancialData.js) e o periodo completo
  // de `monthsBack` meses via dateFrom -- nunca depende do `limit` padrao
  // de useTransactions (50, no maximo 100), que podia truncar a janela em
  // workspaces com maior volume. dateFrom fixo por render (so recalcula se
  // monthsBack mudar) -- mesma tecnica de "referencia congelada" ja usada
  // em AgendaPage.jsx/FuturePage.jsx.
  const dateFrom = useMemo(
    () => calcReportsWindowStart(new Date(), monthsBack),
    [monthsBack],
  );

  const {
    transactions,
    isLoading: transactionsLoading,
    error: transactionsError,
    refresh: refreshTransactions,
  } = useTransactions({ workspaceId, status: 'completed', dateFrom });

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
