export function getTimeOfDay(hour) {
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'evening';
}

const TIME_LABELS = {
  morning: 'Bom dia',
  afternoon: 'Boa tarde',
  evening: 'Boa noite',
};

const GOAL_PHRASES = {
  organizar: {
    personal: 'organizar suas finan\u00E7as',
    business: 'organizar as finan\u00E7as',
  },
  dividas: {
    personal: 'sair das d\u00EDvidas',
    business: 'reduzir as d\u00EDvidas da empresa',
  },
  reserva: {
    personal: 'criar sua reserva de emerg\u00EAncia',
    business: 'construir a reserva da empresa',
  },
  meta: {
    personal: 'economizar para sua meta',
    business: 'atingir a meta da empresa',
  },
  investir: {
    personal: 'organizar seus investimentos',
    business: 'organizar o fluxo de caixa',
  },
  empresa: {
    personal: null,
    business: 'melhorar as finan\u00E7as da empresa',
  },
  outro: {
    personal: 'dar mais um passo hoje',
    business: 'dar mais um passo hoje',
  },
};

const GOAL_CTA_MAP = {
  organizar: {
    personal: { title: 'Organizar suas finan\u00E7as', cta: 'Registrar movimenta\u00E7\u00F5es', href: '/financeiro' },
    business: { title: 'Organizar finan\u00E7as da empresa', cta: 'Registrar movimenta\u00E7\u00F5es', href: '/financeiro' },
  },
  dividas: {
    personal: { title: 'Reduzir suas d\u00EDvidas', cta: 'Criar plano de redu\u00E7\u00E3o', href: '/objetivos' },
    business: { title: 'Reduzir d\u00EDvidas da empresa', cta: 'Criar plano de redu\u00E7\u00E3o', href: '/objetivos' },
  },
  reserva: {
    personal: { title: 'Criar reserva de emerg\u00EAncia', cta: 'Definir meta de reserva', href: '/objetivos' },
    business: { title: 'Criar reserva da empresa', cta: 'Definir meta de reserva', href: '/objetivos' },
  },
  meta: {
    personal: { title: 'Economizar para sua meta', cta: 'Criar ou acompanhar meta', href: '/objetivos' },
    business: { title: 'Acompanhar meta da empresa', cta: 'Criar ou acompanhar meta', href: '/objetivos' },
  },
  investir: {
    personal: { title: 'Come\u00E7ar a investir', cta: 'Organizar fluxo mensal', href: '/financeiro' },
    business: { title: 'Organizar fluxo da empresa', cta: 'Revisar capacidade mensal', href: '/financeiro' },
  },
  empresa: {
    personal: null,
    business: { title: 'Melhorar finan\u00E7as da empresa', cta: 'Revisar entradas e despesas', href: '/financeiro' },
  },
  outro: {
    personal: { title: 'Explorar a UniFlow', cta: 'Ir para o Financeiro', href: '/financeiro' },
    business: { title: 'Explorar a UniFlow', cta: 'Ir para o Financeiro', href: '/financeiro' },
  },
};

const DEFAULT_ACTION = {
  personal: { title: 'Conhecer suas finan\u00E7as', cta: 'Ir para o Financeiro', href: '/financeiro' },
  business: { title: 'Conhecer finan\u00E7as da empresa', cta: 'Ir para o Financeiro', href: '/financeiro' },
};

export function getGreeting({ userName, onboardingData, currentWorkspace, hour }) {
  const timeOfDay = getTimeOfDay(hour ?? new Date().getHours());
  const timeLabel = TIME_LABELS[timeOfDay];
  const name = userName?.trim() || '';
  const rawData = onboardingData || {};
  const goal = rawData.goal || null;
  const goalPhrases = goal ? GOAL_PHRASES[goal] : null;
  const goalText = goalPhrases?.[currentWorkspace] || null;

  const namePart = name ? `, ${name}` : '';
  const base = `${timeLabel}${namePart}.`;

  if (!goalText) {
    return `${base} Vamos explorar a UniFlow?`;
  }

  return `${base} Vamos ${goalText}?`;
}

export function getNextBestAction({ onboardingData, hasTransactions, hasGoals, currentWorkspace }) {
  const rawData = onboardingData || {};
  const goal = rawData.goal || null;

  const workspaceActions = goal ? GOAL_CTA_MAP[goal] : null;
  const actionForWorkspace = workspaceActions?.[currentWorkspace] || null;

  if (!actionForWorkspace) {
    return DEFAULT_ACTION[currentWorkspace] || DEFAULT_ACTION.personal;
  }

  if (hasTransactions && hasGoals) {
    return DEFAULT_ACTION[currentWorkspace] || DEFAULT_ACTION.personal;
  }

  return actionForWorkspace;
}

export function getActivationSteps({ hasTransactions, hasGoals, hasFutureProjection }) {
  const steps = [
    {
      key: 'first-transaction',
      title: 'Registrar primeira movimentação',
      description: 'Adicione sua primeira receita ou despesa para começar a acompanhar.',
      href: '/financeiro',
      cta: 'Registrar',
      completed: Boolean(hasTransactions),
    },
    {
      key: 'first-goal',
      title: 'Criar primeira meta',
      description: 'Defina um objetivo financeiro para acompanhar seu progresso.',
      href: '/objetivos',
      cta: 'Criar meta',
      completed: Boolean(hasGoals),
    },
    {
      key: 'explore-future',
      title: 'Explorar Visão de Futuro',
      description: 'Veja como suas finanças podem evoluir nos próximos meses.',
      href: '/futuro',
      cta: 'Explorar',
      completed: Boolean(hasFutureProjection || hasGoals),
    },
  ];

  const completed = steps.filter((s) => s.completed).length;
  const total = steps.length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return { steps, completed, total, percent };
}

export function shouldShowActivation({ onboardingCompleted, hasTransactions, hasGoals }) {
  return Boolean(onboardingCompleted) && !hasTransactions && !hasGoals;
}
