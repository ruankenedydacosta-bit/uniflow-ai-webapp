export const MEMORY_TYPES = Object.freeze([
  'category_preference',
  'account_preference',
  'merchant_category_mapping',
  'recurring_income',
  'recurring_expense',
  'spending_pattern',
  'financial_goal_context',
  'conversation_preference',
]);

export const MEMORY_STATUSES = Object.freeze([
  'candidate',
  'confirmed',
  'rejected',
  'expired',
  'superseded',
]);

export const MEMORY_SOURCES = Object.freeze({
  EXPLICIT_USER: 'explicit_user',
  USER_CORRECTION: 'user_correction',
  TRANSACTION_PATTERN: 'transaction_pattern',
  CONVERSATION_CONTEXT: 'conversation_context',
});

export const FORBIDDEN_MEMORY_KEYS = Object.freeze([
  'token',
  'secret',
  'password',
  'certificate',
  'private_key',
  'raw_provider_data',
  'audio',
  'transcript',
  'health',
  'religion',
  'politics',
]);

export function normalizeMemoryText(value) {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function roundMoney(value) {
  return Number((Number(value) || 0).toFixed(2));
}

export function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

export function isValidMemoryType(value) {
  return MEMORY_TYPES.includes(value);
}

export function toIsoDate(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  if (!match) return null;
  const date = new Date(`${match[0]}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : match[0];
}

export function daysBetween(left, right) {
  const leftDate = toIsoDate(left);
  const rightDate = toIsoDate(right);
  if (!leftDate || !rightDate) return null;
  return Math.round(
    Math.abs(new Date(`${rightDate}T00:00:00Z`) - new Date(`${leftDate}T00:00:00Z`)) /
      86400000,
  );
}
