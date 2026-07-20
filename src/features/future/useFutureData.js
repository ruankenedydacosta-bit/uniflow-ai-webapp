import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSession } from '../../app/SessionContext';
import { useFinancialBalances } from '../../hooks/useFinancialBalances';
import { useTransactions } from '../../hooks/useTransactions';
import { useGoals } from '../goals/useGoals';
import { FINANCIAL_DATA_CHANGED_EVENT } from '../../services/financialDataEvents';
import { buildFutureProjections } from './futureService';
import { SCENARIOS } from './futureConstants';

export function useFutureData({ selectedScenario = SCENARIOS.LIKELY, selectedHorizon = 6 } = {}) {
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

  const {
    goals,
    isLoading: goalsLoading,
    error: goalsError,
    refresh: refreshGoals,
  } = useGoals({ workspaceId });

  const refreshAll = useCallback(() => {
    refreshBalance();
    refreshTransactions();
    refreshGoals();
  }, [refreshBalance, refreshTransactions, refreshGoals]);

  const prevWorkspaceRef = useRef(workspaceId);
  useEffect(() => {
    if (prevWorkspaceRef.current !== workspaceId) {
      prevWorkspaceRef.current = workspaceId;
    }
  }, [workspaceId]);

  useEffect(() => {
    const handler = () => refreshAll();
    window.addEventListener(FINANCIAL_DATA_CHANGED_EVENT, handler);
    return () => window.removeEventListener(FINANCIAL_DATA_CHANGED_EVENT, handler);
  }, [refreshAll]);

  const isLoading = balanceLoading || transactionsLoading || goalsLoading;
  const error = balanceError || transactionsError || goalsError;

  const projections = useMemo(() => {
    return buildFutureProjections({
      workspaceBalance,
      transactions,
      goals,
      selectedHorizon,
    });
  }, [workspaceBalance, transactions, goals, selectedHorizon]);

  const selectedScenarioProjection = projections.scenarioProjections[selectedScenario] || null;

  const selectedGoalProjections = projections.goalProjections;

  return {
    isLoading,
    error,
    projections,
    selectedScenario,
    selectedHorizon,
    selectedScenarioProjection,
    selectedGoalProjections,
    hasData: projections.hasHistory,
    totalTransactions: projections.totalTransactions,
    activeGoals: projections.activeGoals,
  };
}
