import { useEffect, useState } from 'react';
import { dashboardService } from '../../services/supabase/dashboard.service';

/**
 * useDashboardData — uma única busca paralela para os 4 widgets de dados
 * do Painel de Clareza. Evita 4 hooks separados fazendo 4 loadings
 * independentes (o que faria os cards "piscarem" fora de sincronia).
 */
export function useDashboardData(userId) {
  const [state, setState] = useState({
    loading: true,
    error: null,
    financialSummary: null,
    goals: [],
    recentActivity: [],
    uniInsights: [],
  });

  useEffect(() => {
    if (!userId) return undefined;
    let active = true;

    Promise.all([
      dashboardService.getFinancialSummary(userId),
      dashboardService.getGoals(userId),
      dashboardService.getRecentActivity(userId),
      dashboardService.getUniInsights(userId),
    ])
      .then(([financialSummary, goals, recentActivity, uniInsights]) => {
        if (!active) return;
        setState({ loading: false, error: null, financialSummary, goals, recentActivity, uniInsights });
      })
      .catch((error) => {
        if (!active) return;
        setState((prev) => ({ ...prev, loading: false, error: error.message }));
      });

    return () => {
      active = false;
    };
  }, [userId]);

  return state;
}
