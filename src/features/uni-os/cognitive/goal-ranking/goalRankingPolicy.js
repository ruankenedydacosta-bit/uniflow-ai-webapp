const PRIORITY_WEIGHT = Object.freeze({ LOW: 4, NORMAL: 8, HIGH: 12, CRITICAL: 16 });

const INTENT_TYPE_MATCHES = Object.freeze({
  register_income: Object.freeze(['IncomeGrowth', 'BusinessGrowth']),
  register_expense: Object.freeze(['Savings', 'EmergencyFund', 'DebtReduction']),
  register_transfer: Object.freeze(['Savings', 'Investment', 'EmergencyFund']),
  check_balance: Object.freeze(['Savings', 'Investment', 'EmergencyFund']),
  forecast: Object.freeze([
    'Savings', 'Investment', 'EmergencyFund', 'DebtReduction',
    'IncomeGrowth', 'BusinessGrowth', 'Custom',
  ]),
  create_goal: Object.freeze([
    'Savings', 'Investment', 'EmergencyFund', 'DebtReduction',
    'IncomeGrowth', 'BusinessGrowth', 'Custom',
  ]),
  planning: Object.freeze([
    'Savings', 'Investment', 'EmergencyFund', 'DebtReduction',
    'IncomeGrowth', 'BusinessGrowth', 'Custom',
  ]),
});

const CATEGORY_TYPE_MATCHES = Object.freeze({
  poupanca: Object.freeze(['Savings']),
  reserva: Object.freeze(['Savings', 'EmergencyFund']),
  emergencia: Object.freeze(['EmergencyFund']),
  investimento: Object.freeze(['Investment']),
  divida: Object.freeze(['DebtReduction']),
  financiamento: Object.freeze(['DebtReduction']),
  renda: Object.freeze(['IncomeGrowth']),
  salario: Object.freeze(['IncomeGrowth']),
  vendas: Object.freeze(['BusinessGrowth']),
  empresa: Object.freeze(['BusinessGrowth']),
  negocio: Object.freeze(['BusinessGrowth']),
});

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ');
}

function daysUntil(deadline, now) {
  if (typeof deadline !== 'string') return null;
  const deadlineTime = new Date(`${deadline}T00:00:00.000Z`).getTime();
  const nowTime = new Date(now).getTime();
  if (!Number.isFinite(deadlineTime) || !Number.isFinite(nowTime)) return null;
  return Math.ceil((deadlineTime - nowTime) / 86_400_000);
}

function collectCategories(parsedIntent = {}) {
  const categories = Array.isArray(parsedIntent?.entities?.categories)
    ? parsedIntent.entities.categories
    : [];
  return categories.flatMap((category) => {
    if (typeof category === 'string') return [normalizeText(category)];
    return [category?.normalized, category?.display, category?.value]
      .map(normalizeText)
      .filter(Boolean);
  });
}

function hasCategoryMatch(goal, parsedIntent) {
  const categories = collectCategories(parsedIntent);
  const goalText = normalizeText(`${goal?.type ?? ''} ${goal?.title ?? ''}`);
  return categories.some((category) => {
    if (goalText.includes(category)) return true;
    return Object.entries(CATEGORY_TYPE_MATCHES).some(([keyword, types]) => (
      category.includes(keyword) && types.includes(goal?.type)
    ));
  });
}

function hasContextMatch(goal, contextSnapshot = {}, parsedIntent = {}) {
  const workspaceValue = contextSnapshot?.workspace?.type
    ?? contextSnapshot?.workspace?.mode
    ?? contextSnapshot?.currentWorkspace
    ?? parsedIntent?.entities?.workspaces?.[0]?.normalized
    ?? parsedIntent?.entities?.workspaces?.[0]?.display;
  const workspace = normalizeText(workspaceValue);
  if (!workspace) return false;
  if (workspace.includes('business') || workspace.includes('empresa')) {
    return goal?.type === 'BusinessGrowth';
  }
  return !['BusinessGrowth'].includes(goal?.type)
    && (workspace.includes('personal') || workspace.includes('pessoal'));
}

function isCorroborated(goal, memorySnapshot = {}) {
  if (!goal?.id) return false;
  const goals = memorySnapshot?.financial?.goals ?? memorySnapshot?.goals ?? [];
  return Array.isArray(goals) && goals.some((candidate) => (
    candidate?.id === goal.id || candidate?.goal?.id === goal.id
  ));
}

function relevanceFromScore(score) {
  if (score >= 60) return 'HIGH';
  if (score >= 30) return 'MEDIUM';
  return 'LOW';
}

export function scoreGoalRelevance(goal = {}, input = {}, options = {}) {
  const reasons = [];
  let score = 0;
  const intent = String(input.parsedIntent?.intent ?? '').trim().toLowerCase();

  if (goal.status === 'ACTIVE') {
    score += 10;
    reasons.push('ACTIVE_GOAL');
  }

  const priorityScore = PRIORITY_WEIGHT[goal.priority] ?? PRIORITY_WEIGHT.NORMAL;
  score += priorityScore;
  reasons.push('PRIORITY_WEIGHT');

  if (INTENT_TYPE_MATCHES[intent]?.includes(goal.type)) {
    score += intent === 'create_goal' || intent === 'planning' || intent === 'forecast' ? 18 : 30;
    reasons.push('INTENT_MATCH');
  }

  if (hasCategoryMatch(goal, input.parsedIntent)) {
    score += 22;
    reasons.push('CATEGORY_MATCH');
  }

  if (hasContextMatch(goal, input.contextSnapshot, input.parsedIntent)) {
    score += 12;
    reasons.push('CONTEXT_MATCH');
  }

  const remainingDays = daysUntil(goal.deadline, options.now ?? new Date().toISOString());
  if (remainingDays !== null && remainingDays <= 30) {
    score += remainingDays < 0 ? 14 : 10;
    reasons.push('DEADLINE_PROXIMITY');
  } else if (remainingDays !== null && remainingDays <= 90) {
    score += 5;
    reasons.push('DEADLINE_PROXIMITY');
  }

  if (isCorroborated(goal, input.memorySnapshot)) {
    score += 4;
    reasons.push('MEMORY_CORROBORATED');
  }

  const safeScore = Math.min(100, Math.max(0, score));
  return {
    goalId: typeof goal.id === 'string' ? goal.id : null,
    relevance: relevanceFromScore(safeScore),
    priority: PRIORITY_WEIGHT[goal.priority] ? goal.priority : 'NORMAL',
    score: safeScore,
    reasons,
  };
}

export function rankGoals(goals = [], input = {}, options = {}) {
  if (!Array.isArray(goals)) return [];
  return goals
    .map((goal, index) => ({
      ranking: scoreGoalRelevance(goal, input, options),
      deadline: goal?.deadline ?? null,
      index,
    }))
    .sort((first, second) => (
      second.ranking.score - first.ranking.score
      || PRIORITY_WEIGHT[second.ranking.priority] - PRIORITY_WEIGHT[first.ranking.priority]
      || String(first.deadline ?? '9999-12-31').localeCompare(
        String(second.deadline ?? '9999-12-31'),
      )
      || first.index - second.index
    ))
    .map(({ ranking }) => ranking);
}

export { PRIORITY_WEIGHT };
