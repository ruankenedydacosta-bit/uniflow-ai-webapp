import { useMemo } from 'react';
import { useAccess } from '../../../app/AccessContext.jsx';
import { useSession } from '../../../app/SessionContext.jsx';
import { WORKSPACE_TYPES } from '../../../app/access.js';
import { buildFinancialClaritySnapshot } from './financialClarityEngine.js';

export function useDashboardClarity(financialData = {}) {
  const { access } = useAccess();
  const { profile, workspace } = useSession();
  const workspaceType = workspace?.workspace_type
    ?? access.currentWorkspace
    ?? WORKSPACE_TYPES.PERSONAL;

  return useMemo(() => buildFinancialClaritySnapshot({
    workspaceType,
    onboardingData: profile?.onboarding_data ?? null,
    workspaceBalance: financialData.workspaceBalance,
    transactions: financialData.transactions,
    goals: financialData.rawGoals,
    financialPeriod: financialData.financialPeriod,
    projections: financialData.projections,
  }), [
    workspaceType,
    profile?.onboarding_data,
    financialData.workspaceBalance,
    financialData.transactions,
    financialData.rawGoals,
    financialData.financialPeriod,
    financialData.projections,
  ]);
}
