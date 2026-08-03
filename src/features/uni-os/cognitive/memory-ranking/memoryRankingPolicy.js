export const MIN_RELEVANT_MEMORY_SCORE = 20;

const ACTIVE_STATUSES = new Set(['candidate', 'confirmed']);
const EXPLICIT_SOURCES = new Set(['explicit_user', 'user_correction']);
const MEMORY_SOURCES = new Set([
  'explicit_user',
  'user_correction',
  'transaction_pattern',
  'conversation_context',
]);
const MEMORY_TYPES = new Set([
  'category_preference',
  'account_preference',
  'merchant_category_mapping',
  'recurring_income',
  'recurring_expense',
  'spending_pattern',
  'financial_goal_context',
  'conversation_preference',
]);

const INTENT_MEMORY_TYPES = Object.freeze({
  register_income: Object.freeze(['recurring_income', 'account_preference', 'category_preference']),
  register_expense: Object.freeze([
    'recurring_expense', 'spending_pattern', 'merchant_category_mapping',
    'account_preference', 'category_preference',
  ]),
  register_transfer: Object.freeze(['account_preference']),
  create_goal: Object.freeze(['financial_goal_context']),
  check_balance: Object.freeze(['account_preference', 'spending_pattern']),
  forecast: Object.freeze([
    'recurring_income', 'recurring_expense', 'spending_pattern', 'financial_goal_context',
  ]),
  planning: Object.freeze(['spending_pattern', 'financial_goal_context']),
  configuration: Object.freeze(['conversation_preference']),
});

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ');
}

function readFirst(source, keys) {
  if (!source || typeof source !== 'object') return null;
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key];
  }
  return null;
}

function safeTimestamp(value) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.NaN;
}

function normalizeConfidence(value, confirmed) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return Math.min(1, Math.max(0, numeric));
  return confirmed ? 1 : 0;
}

export function normalizeMemoryForRanking(memory = {}, options = {}) {
  const source = memory && typeof memory === 'object' ? memory : {};
  const hasValue = source.memory_value !== undefined || source.value !== undefined;
  const value = source.memory_value ?? source.value ?? null;
  const structuredValue = value && !Array.isArray(value) && typeof value === 'object';
  const confirmed = source.confirmed === true || source.status === 'confirmed';
  const type = source.memory_type ?? source.type ?? null;
  const status = source.status ?? (confirmed ? 'confirmed' : 'candidate');
  const workspaceId = source.workspace_id ?? source.workspaceId ?? null;
  const expiresAt = source.expires_at ?? source.expiresAt ?? null;
  const observedAt = source.last_observed_at
    ?? source.lastObservedAt
    ?? source.updated_at
    ?? source.updatedAt
    ?? source.created_at
    ?? source.createdAt
    ?? null;

  return {
    id: typeof source.id === 'string' && source.id.trim() ? source.id.trim() : null,
    type,
    status,
    source: source.source ?? null,
    workspaceId,
    expiresAt,
    observedAt,
    confidence: normalizeConfidence(source.confidence, confirmed),
    value: structuredValue ? value : {},
    validValue: structuredValue || (!hasValue && options.trustedProjection === true),
    trustedProjection: options.trustedProjection === true,
  };
}

export function isMemoryEligible(memory, contextSnapshot = {}, options = {}) {
  if (!memory?.id
    || !MEMORY_TYPES.has(memory.type)
    || !ACTIVE_STATUSES.has(memory.status)
    || !MEMORY_SOURCES.has(memory.source)
    || memory.validValue !== true) {
    return false;
  }

  const now = new Date(options.now ?? new Date().toISOString()).getTime();
  if (!Number.isFinite(now)) return false;
  const expiration = safeTimestamp(memory.expiresAt);
  if (Number.isNaN(expiration) || (expiration !== null && expiration <= now)) return false;
  const observed = safeTimestamp(memory.observedAt);
  if (Number.isNaN(observed)) return false;

  const currentWorkspaceId = contextSnapshot?.workspace?.id ?? null;
  if (!currentWorkspaceId) return false;
  if (memory.workspaceId) return memory.workspaceId === currentWorkspaceId;
  return memory.trustedProjection === true;
}

function collectCategoryNames(parsedIntent = {}) {
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

function memoryCategory(memory) {
  const category = readFirst(memory.value, ['category_name', 'categoryName', 'category']);
  if (typeof category === 'string') return normalizeText(category);
  return normalizeText(category?.normalized ?? category?.display);
}

function activeGoalIds(goalSnapshot = {}, goalRankingSnapshot = {}) {
  const ids = new Set();
  if (goalSnapshot?.primaryGoal?.id) ids.add(goalSnapshot.primaryGoal.id);
  if (goalRankingSnapshot?.primaryGoal?.goalId) ids.add(goalRankingSnapshot.primaryGoal.goalId);
  if (Array.isArray(goalSnapshot?.goals)) {
    goalSnapshot.goals.forEach((goal) => {
      if (goal?.status === 'ACTIVE' && goal?.id) ids.add(goal.id);
    });
  }
  return ids;
}

function hasGoalMatch(memory, input) {
  if (memory.type !== 'financial_goal_context') return false;
  const goalId = readFirst(memory.value, ['goal_id', 'goalId']);
  return typeof goalId === 'string'
    && activeGoalIds(input.goalSnapshot, input.goalRankingSnapshot).has(goalId);
}

function recencyScore(memory, now) {
  const observed = safeTimestamp(memory.observedAt);
  if (observed === null || Number.isNaN(observed)) return 0;
  const elapsedDays = Math.floor((new Date(now).getTime() - observed) / 86_400_000);
  if (elapsedDays < 0) return 0;
  if (elapsedDays <= 7) return 12;
  if (elapsedDays <= 30) return 8;
  if (elapsedDays <= 90) return 4;
  return 0;
}

function relevanceFromScore(score) {
  if (score >= 65) return 'HIGH';
  if (score >= 35) return 'MEDIUM';
  return 'LOW';
}

export function scoreMemoryRelevance(memory, input = {}, options = {}) {
  const reasons = ['WORKSPACE_MATCH'];
  let score = 8;
  const intent = String(input.parsedIntent?.intent ?? '').trim().toLowerCase();

  if (INTENT_MEMORY_TYPES[intent]?.includes(memory.type)) {
    score += 30;
    reasons.push('INTENT_MATCH');
  }

  const categories = collectCategoryNames(input.parsedIntent);
  const category = memoryCategory(memory);
  if (category && categories.includes(category)) {
    score += 22;
    reasons.push('CATEGORY_MATCH');
  }

  if (hasGoalMatch(memory, input)) {
    score += 18;
    reasons.push('ACTIVE_GOAL_MATCH');
  }

  if (memory.type === 'conversation_preference'
    && ['question', 'casual', 'explanation', 'configuration'].includes(intent)) {
    score += 12;
    reasons.push('CONTEXT_MATCH');
  }

  const recent = recencyScore(memory, options.now ?? new Date().toISOString());
  if (recent > 0) {
    score += recent;
    reasons.push('RECENT_MEMORY');
  }

  score += Math.round(memory.confidence * 10);
  if (memory.confidence > 0) reasons.push('CONFIDENCE_WEIGHT');

  if (EXPLICIT_SOURCES.has(memory.source)) {
    score += 12;
    reasons.push('EXPLICIT_SOURCE');
  }

  const safeScore = Math.min(100, Math.max(0, score));
  return {
    memoryId: memory.id,
    type: memory.type,
    relevance: relevanceFromScore(safeScore),
    score: safeScore,
    confidence: memory.confidence,
    reasons,
  };
}

export function rankMemories(memories = [], input = {}, options = {}) {
  if (!Array.isArray(memories)) return [];
  return memories
    .map((memory, index) => ({
      ranking: scoreMemoryRelevance(memory, input, options),
      observedAt: safeTimestamp(memory.observedAt) ?? 0,
      index,
    }))
    .filter(({ ranking }) => ranking.score >= MIN_RELEVANT_MEMORY_SCORE)
    .sort((first, second) => (
      second.ranking.score - first.ranking.score
      || second.ranking.confidence - first.ranking.confidence
      || second.observedAt - first.observedAt
      || first.index - second.index
    ))
    .map(({ ranking }) => ranking);
}
