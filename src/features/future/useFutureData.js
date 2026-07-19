import { useMemo } from 'react';
import { useSession } from '../../app/SessionContext';
import { useFinancialBalances } from '../../hooks/useFinancialBalances';
import { useTransactions } from '../../hooks/useTransactions';
import { useGoals } from '../goals/useGoals';
import { buildFutureProjections } from './futureService';
import { SCENARIOS } from './futureConstants';

export function useFutureData({ selectedScenario = SCENARIOS.LIKELY, selectedHorizon = 6 } = {}) {
  const { workspace } = useSession();
  const workspaceId = workspace?.id;

  const {
    workspaceBalance,
    isLoading: balanceLoading,
    error: balanceError,
  } = useFinancialBalances({ workspaceId });

  const {
    transactions,
    isLoading: transactionsLoading,
    error: transactionsError,
  } = useTransactions({ workspaceId });

  const {
    goals,
    isLoading: goalsLoading,
    error: goalsError,
  } = useGoals({ workspaceId });

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
