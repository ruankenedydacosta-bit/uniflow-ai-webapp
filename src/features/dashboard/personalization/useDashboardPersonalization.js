import { useMemo } from 'react';
import { useSession } from '../../../app/SessionContext.jsx';
import { useAccess } from '../../../app/AccessContext.jsx';
import { WORKSPACE_TYPES } from '../../../app/access.js';
import { getGreeting, getNextBestAction, getActivationSteps, shouldShowActivation } from './onboardingHomeRules.js';

const WORKSPACE_LABELS = {
  [WORKSPACE_TYPES.PERSONAL]: 'Espaço pessoal',
  [WORKSPACE_TYPES.BUSINESS]: 'Espaço empresarial',
};

export function useDashboardPersonalization(financialData) {
  const { profile } = useSession();
  const { access } = useAccess();

  return useMemo(() => {
    const onboardingData = profile?.onboarding_data || null;
    const userName = profile?.full_name || null;
    const rawData = onboardingData || {};
    const currentWorkspace = access.currentWorkspace || WORKSPACE_TYPES.PERSONAL;
    const userMode = access.userMode || 'personal';

    const hasTransactions = financialData?.recentTransactions?.length > 0;
    const hasGoals = financialData?.goals?.length > 0;
    const hasData = financialData?.hasData ?? false;

    const greeting = getGreeting({
      userName,
      onboardingData: rawData,
      currentWorkspace,
      hour: new Date().getHours(),
    });

    const nextAction = getNextBestAction({
      onboardingData: rawData,
      hasTransactions,
      hasGoals,
      currentWorkspace,
    });

    const onboardingCompleted = Boolean(rawData.completedAt);
    const activation = getActivationSteps({
      hasTransactions,
      hasGoals,
      hasFutureProjection: hasData,
    });

    const showActivation = shouldShowActivation({
      onboardingCompleted,
      hasTransactions,
      hasGoals,
    });

    return {
      greeting,
      nextAction,
      activation,
      showActivation,
      workspaceLabel: WORKSPACE_LABELS[currentWorkspace] || 'Espaço pessoal',
      currentWorkspace,
      userMode,
      userName,
    };
  }, [
    profile?.onboarding_data,
    profile?.full_name,
    access.currentWorkspace,
    access.userMode,
    financialData?.recentTransactions,
    financialData?.goals,
    financialData?.hasData,
  ]);
}
