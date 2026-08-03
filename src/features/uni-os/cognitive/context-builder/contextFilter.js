const FORBIDDEN_KEYS = new Set([
  'prompt',
  'prompttemplate',
  'systemprompt',
  'originaltext',
  'rawtext',
  'transcript',
  'transcription',
  'token',
  'accesstoken',
  'refreshtoken',
  'jwt',
  'password',
  'secret',
  'servicerole',
]);
const MEMORY_TYPES = new Set([
  'category_preference', 'account_preference', 'merchant_category_mapping',
  'recurring_income', 'recurring_expense', 'spending_pattern',
  'financial_goal_context', 'conversation_preference',
]);
const INSIGHT_TYPES = new Set([
  'GOAL_PROGRESS', 'GOAL_DELAY', 'SPENDING_PATTERN', 'INCOME_PATTERN',
  'INVESTMENT_OPPORTUNITY', 'EMERGENCY_RESERVE', 'RECURRING_EXPENSE',
  'CATEGORY_CONCENTRATION', 'MEMORY_CONFLICT', 'CONTEXT_CHANGE', 'NO_INSIGHT',
]);

function isRecord(value) {
  return Boolean(value && !Array.isArray(value) && typeof value === 'object');
}

export function sanitizeStructuredValue(value, seen = new WeakSet()) {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') {
    return undefined;
  }
  if (typeof value !== 'object' || seen.has(value)) return undefined;
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeStructuredValue(item, seen))
      .filter((item) => item !== undefined);
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !FORBIDDEN_KEYS.has(key.toLowerCase().replace(/[^a-z0-9]/g, '')))
      .map(([key, nested]) => [key, sanitizeStructuredValue(nested, seen)])
      .filter(([, nested]) => nested !== undefined),
  );
}

function validScore(value, minimum = 0) {
  return Number.isFinite(value) && value >= minimum && value <= 100;
}

function validExpiration(value, now) {
  if (value === null || value === undefined) return true;
  const expiration = new Date(value).getTime();
  const current = new Date(now).getTime();
  return Number.isFinite(expiration) && Number.isFinite(current) && expiration > current;
}

export function isValidRankedGoal(value) {
  return isRecord(value)
    && typeof value.goalId === 'string'
    && Boolean(value.goalId.trim())
    && validScore(value.score, 1)
    && ['LOW', 'MEDIUM', 'HIGH'].includes(value.relevance);
}

export function isValidRankedMemory(value, now) {
  return isRecord(value)
    && typeof value.memoryId === 'string'
    && Boolean(value.memoryId.trim())
    && typeof value.type === 'string'
    && MEMORY_TYPES.has(value.type)
    && validScore(value.score, 20)
    && Number.isFinite(value.confidence)
    && value.confidence >= 0
    && value.confidence <= 1
    && value.eligible !== false
    && validExpiration(value.expiresAt, now);
}

export function isValidRankedContext(value, now) {
  return isRecord(value)
    && typeof value.key === 'string'
    && Boolean(value.key.trim())
    && value.value !== null
    && value.value !== undefined
    && validScore(value.score, 1)
    && validExpiration(value.expiresAt, now);
}

export function isValidInsight(value) {
  return isRecord(value)
    && typeof value.insightId === 'string'
    && Boolean(value.insightId.trim())
    && typeof value.type === 'string'
    && INSIGHT_TYPES.has(value.type)
    && validScore(value.score, 0);
}

export function sanitizeRecord(value) {
  return isRecord(value) ? sanitizeStructuredValue(value) : {};
}
