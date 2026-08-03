const FINANCIAL_INTENTS = new Set([
  'register_income',
  'register_expense',
  'register_transfer',
  'create_goal',
  'check_balance',
  'forecast',
  'planning',
]);
const CONVERSATIONAL_INTENTS = new Set(['question', 'casual', 'explanation']);
const VALID_CHANNELS = new Set(['text', 'voice']);
const VALID_ROLES = new Set(['owner', 'admin', 'member', 'viewer']);
const VALID_SESSION_STATES = new Set(['anonymous', 'authenticated', 'loading', 'error']);

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function normalizeUserMode(value) {
  const normalized = normalizeText(value).replace(/[^a-z]+/g, '');
  const aliases = {
    pessoal: 'personal',
    personal: 'personal',
    empresa: 'business',
    empresarial: 'business',
    business: 'business',
    ambos: 'both',
    both: 'both',
    pessoalempresa: 'both',
    personalbusiness: 'both',
  };
  return aliases[normalized] ?? null;
}

function timestampOf(value) {
  if (typeof value !== 'string' || !value.trim()) return Number.NaN;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.NaN;
}

function isSafeValue(value) {
  if (typeof value === 'boolean' || typeof value === 'number') return true;
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 160;
}

function candidate(key, value, source, overrides = {}) {
  if (!isSafeValue(value)) return null;
  return {
    key,
    value,
    workspaceId: overrides.workspaceId ?? null,
    scope: overrides.scope ?? 'global',
    observedAt: overrides.observedAt ?? source.timestamp ?? null,
    expiresAt: overrides.expiresAt ?? source.expiresAt ?? source.metadata?.expiresAt ?? null,
  };
}

export function extractContextCandidates(contextSnapshot = {}) {
  const source = contextSnapshot && typeof contextSnapshot === 'object' ? contextSnapshot : {};
  const workspaceId = typeof source.workspace?.id === 'string' && source.workspace.id.trim()
    ? source.workspace.id.trim()
    : null;
  const items = [
    candidate('session.authenticated', source.session?.authenticated, source),
    VALID_SESSION_STATES.has(source.session?.state)
      ? candidate('session.state', source.session.state, source)
      : null,
    candidate('user.profileCompleted', source.user?.profileCompleted, source),
    candidate('user.mode', normalizeUserMode(
      source.user?.mode ?? source.userMode ?? source.access?.userMode,
    ), source, { workspaceId, scope: 'workspace' }),
    candidate('workspace.id', workspaceId, source, { workspaceId, scope: 'workspace' }),
    VALID_ROLES.has(source.workspace?.role)
      ? candidate('workspace.role', source.workspace.role, source, { workspaceId, scope: 'workspace' })
      : null,
    candidate('workspace.type', normalizeUserMode(
      source.workspace?.type ?? source.workspace?.mode ?? source.currentWorkspace,
    ), source, { workspaceId, scope: 'workspace' }),
    VALID_CHANNELS.has(source.conversation?.channel)
      ? candidate('conversation.channel', source.conversation.channel, source)
      : null,
    /^[a-z]{2,3}(?:-[A-Z]{2}|-\d{3})?$/.test(source.conversation?.language ?? '')
      ? candidate('conversation.language', source.conversation.language, source)
      : null,
    candidate('conversation.timezone', source.conversation?.timezone, source),
    candidate('personality.mode', source.personality?.mode, source),
    candidate('featureFlags.uniOS', source.featureFlags?.uniOS, source),
    candidate('featureFlags.premiumVoice', source.featureFlags?.premiumVoice, source),
  ].filter(Boolean);

  const extensionItems = Array.isArray(source.items) ? source.items : [];
  extensionItems.forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const normalized = candidate(item.key, item.value, source, {
      workspaceId: item.workspace_id ?? item.workspaceId ?? null,
      scope: 'workspace',
      observedAt: item.observed_at ?? item.observedAt ?? item.updated_at ?? item.updatedAt,
      expiresAt: item.expires_at ?? item.expiresAt,
    });
    if (normalized) items.push(normalized);
  });

  return items;
}

export function isContextEligible(item, contextSnapshot = {}, options = {}) {
  if (!item?.key || !isSafeValue(item.value)) return false;
  const now = timestampOf(options.now ?? new Date().toISOString());
  const observedAt = timestampOf(item.observedAt);
  if (Number.isNaN(now) || Number.isNaN(observedAt)) return false;
  if (item.expiresAt !== null && item.expiresAt !== undefined) {
    const expiresAt = timestampOf(item.expiresAt);
    if (Number.isNaN(expiresAt) || expiresAt <= now) return false;
  }
  if (item.scope !== 'workspace') return true;
  const currentWorkspaceId = contextSnapshot?.workspace?.id ?? null;
  return Boolean(currentWorkspaceId && item.workspaceId === currentWorkspaceId);
}

function recencyScore(observedAt, now) {
  const elapsed = timestampOf(now) - timestampOf(observedAt);
  if (!Number.isFinite(elapsed) || elapsed < 0) return 0;
  const days = elapsed / 86_400_000;
  if (days <= 1) return 10;
  if (days <= 7) return 6;
  if (days <= 30) return 3;
  return 0;
}

function primaryGoal(goalSnapshot = {}, goalRankingSnapshot = {}) {
  return goalRankingSnapshot?.primaryGoal?.goalId
    ?? goalSnapshot?.primaryGoal?.id
    ?? null;
}

function primaryMemoryType(memoryRankingSnapshot = {}) {
  return memoryRankingSnapshot?.primaryMemory?.type ?? null;
}

function relevanceFromScore(score) {
  if (score >= 60) return 'HIGH';
  if (score >= 30) return 'MEDIUM';
  return 'LOW';
}

export function scoreContextRelevance(item, input = {}, options = {}) {
  const reasons = [];
  let score = 5;
  const intent = String(input.parsedIntent?.intent ?? '').trim().toLowerCase();

  if (FINANCIAL_INTENTS.has(intent) && (item.key.startsWith('workspace.') || item.key === 'user.mode')) {
    score += 20;
    reasons.push('INTENT_MATCH');
  } else if (intent === 'configuration'
    && (item.key === 'user.mode' || item.key.startsWith('personality.') || item.key.startsWith('featureFlags.'))) {
    score += 20;
    reasons.push('INTENT_MATCH');
  } else if (CONVERSATIONAL_INTENTS.has(intent)
    && (item.key.startsWith('conversation.') || item.key.startsWith('personality.'))) {
    score += 15;
    reasons.push('INTENT_MATCH');
  }

  if (item.key.startsWith('workspace.')) {
    score += item.key === 'workspace.id' ? 25 : 15;
    reasons.push('ACTIVE_WORKSPACE');
  }

  if (item.key === 'user.mode' || item.key === 'workspace.type') {
    score += 12;
    reasons.push('USER_MODE_MATCH');
  }

  if (item.key === 'conversation.channel') {
    const source = input.parsedIntent?.source;
    score += source === item.value ? 18 : 8;
    reasons.push('CHANNEL_MATCH');
  }

  if (item.key === 'conversation.language') {
    score += input.parsedIntent?.language === item.value ? 15 : 7;
    reasons.push('LANGUAGE_MATCH');
  }

  if ((item.key === 'session.authenticated' && item.value === true)
    || (item.key === 'session.state' && item.value === 'authenticated')) {
    score += item.key === 'session.authenticated' ? 20 : 15;
    reasons.push('SESSION_ACTIVE');
  }

  const recent = recencyScore(item.observedAt, options.now ?? new Date().toISOString());
  if (recent > 0) {
    score += recent;
    reasons.push('RECENT_CONTEXT');
  }

  if (primaryGoal(input.goalSnapshot, input.goalRankingSnapshot)
    && (item.key.startsWith('workspace.') || item.key === 'user.mode')) {
    score += 10;
    reasons.push('PRIMARY_GOAL_SIGNAL');
  }

  const memoryType = primaryMemoryType(input.memoryRankingSnapshot);
  const conversationMemory = memoryType === 'conversation_preference';
  const contextMatchesMemory = conversationMemory
    ? item.key.startsWith('conversation.') || item.key.startsWith('personality.')
    : memoryType && (item.key.startsWith('workspace.') || item.key === 'user.mode');
  if (contextMatchesMemory) {
    score += 10;
    reasons.push('RELEVANT_MEMORY_SIGNAL');
  }

  const safeScore = Math.min(100, Math.max(0, score));
  return {
    key: item.key,
    value: item.value,
    relevance: relevanceFromScore(safeScore),
    score: safeScore,
    reasons,
  };
}

export function rankContext(items = [], input = {}, options = {}) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item, index) => ({
      ranking: scoreContextRelevance(item, input, options),
      observedAt: timestampOf(item.observedAt),
      index,
    }))
    .sort((first, second) => (
      second.ranking.score - first.ranking.score
      || second.observedAt - first.observedAt
      || first.index - second.index
    ))
    .map(({ ranking }) => ranking);
}

export { normalizeUserMode };
