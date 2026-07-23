import { getNextBestAction } from '../personalization/onboardingHomeRules.js';
import {
  buildSignalCandidates,
  getCompletedTransactions,
  getGoalProgress,
  getPeriodTotals,
} from './financialClarityRules.js';

const CURRENCY_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function formatCurrency(value) {
  return CURRENCY_FORMATTER.format(Number(value) || 0);
}

function buildPrimarySummary({ balance, financialPeriod, goals, projections, workspaceType, hasTransactions }) {
  const { income, expense } = getPeriodTotals(financialPeriod);
  const activeGoals = goals.filter((goal) => goal?.status === 'active');
  const likelyProjection = projections?.scenarioProjections?.likely;
  const title = workspaceType === 'business'
    ? 'Clareza financeira da empresa'
    : 'Clareza financeira pessoal';

  let status = 'Em construção';
  let variant = 'secondary';
  let message = 'Ainda não há histórico suficiente para uma leitura financeira do período.';

  if (hasTransactions || activeGoals.length > 0 || balance !== 0) {
    status = balance < 0 || (expense > income && expense > 0) ? 'Acompanhar' : 'Em acompanhamento';
    variant = status === 'Acompanhar' ? 'warning' : 'success';
    message = balance < 0
      ? 'O saldo derivado está abaixo de zero. Uma revisão dos lançamentos pode ajudar a entender o período.'
      : expense > income && expense > 0
        ? 'As despesas confirmadas estão acima das receitas confirmadas neste período.'
        : 'Os dados confirmados permitem acompanhar saldo, movimentações e metas sem estimar valores ausentes.';
  }

  const projectionValue = likelyProjection?.hasData
    ? formatCurrency(likelyProjection.projectedBalance)
    : 'Sem histórico suficiente';

  return {
    title,
    status,
    variant,
    message,
    metrics: [
      { id: 'derived-balance', label: 'Saldo derivado', value: formatCurrency(balance), hasData: true },
      { id: 'period-result', label: 'Resultado do período', value: formatCurrency(income - expense), hasData: hasTransactions },
      { id: 'likely-projection', label: 'Cenário provável', value: projectionValue, hasData: Boolean(likelyProjection?.hasData) },
      { id: 'active-goals', label: 'Metas ativas', value: String(activeGoals.length), hasData: activeGoals.length > 0 },
    ],
    forecast: likelyProjection?.hasData
      ? `Cenário provável: ${projectionValue}`
      : 'Projeção aguardando histórico',
    signal: hasTransactions
      ? `${financialPeriod?.insight ?? 'Dados confirmados disponíveis.'}`
      : 'Nenhuma movimentação confirmada',
  };
}

function buildNextAction({ signals, onboardingData, hasTransactions, goals, workspaceType }) {
  const fallbackAction = getNextBestAction({
    onboardingData,
    hasTransactions,
    hasGoals: goals.length > 0,
    currentWorkspace: workspaceType,
  });
  const primarySignal = signals[0];

  if (!primarySignal || primarySignal.id === 'building-history') return fallbackAction;
  if (primarySignal.href === '/objetivos') {
    return { title: 'Revisar o progresso da meta', cta: 'Ver objetivos', href: '/objetivos' };
  }

  return {
    title: primarySignal.title,
    cta: 'Revisar no Financeiro',
    href: '/financeiro',
  };
}

export function buildFinancialClaritySnapshot({
  workspaceType = 'personal',
  onboardingData = null,
  workspaceBalance = null,
  transactions = [],
  goals = [],
  financialPeriod = {},
  projections = {},
} = {}) {
  const completedTransactions = getCompletedTransactions(transactions);
  const activeGoals = goals.filter((goal) => goal?.status === 'active');
  const balance = Number(workspaceBalance) || 0;
  const hasTransactions = completedTransactions.length > 0;
  const hasData = hasTransactions || activeGoals.length > 0 || workspaceBalance !== null;
  const signals = buildSignalCandidates({
    balance,
    financialPeriod,
    goals,
    hasTransactions,
  });
  const primarySummary = buildPrimarySummary({
    balance,
    financialPeriod,
    goals,
    projections,
    workspaceType,
    hasTransactions,
  });
  const nextAction = buildNextAction({
    signals,
    onboardingData,
    hasTransactions,
    goals: activeGoals,
    workspaceType,
  });
  const bestGoal = [...activeGoals].sort((left, right) => getGoalProgress(right) - getGoalProgress(left))[0] ?? null;

  return deepFreeze({
    workspaceType,
    hasData,
    primarySummary: {
      ...primarySummary,
      nextStep: nextAction.title,
    },
    signals,
    nextAction,
    mobile: {
      briefing: {
        eyebrow: 'Uni Briefing',
        message: primarySummary.message,
        actionLabel: hasData ? 'Ver detalhes' : 'Começar agora',
        href: nextAction.href,
      },
      nextStep: {
        title: nextAction.title,
        actionLabel: nextAction.cta,
        href: nextAction.href,
      },
      insights: signals.map((signal) => ({
        id: signal.id,
        icon: signal.icon,
        label: signal.label,
        tone: signal.tone,
        href: signal.href,
      })),
    },
    metadata: {
      completedTransactions: completedTransactions.length,
      activeGoals: activeGoals.length,
      leadingGoalId: bestGoal?.id ?? null,
      source: 'workspace-real-data',
    },
  });
}
