import { deepFreeze, normalizeMemoryText } from '../uni-memory/memoryTypes.js';

export const CONVERSATION_MEMORY_TYPES = Object.freeze([
  'merchant_category_mapping',
  'category_preference',
  'account_preference',
  'conversation_preference',
  'financial_goal_context',
]);

const EXPLICIT_SOURCES = new Set(['explicit_user', 'user_correction']);
const VALUE_FIELDS = Object.freeze({
  merchant_category_mapping: [
    'merchant', 'description', 'category_id', 'categoryId', 'category_name', 'categoryName',
  ],
  category_preference: [
    'category_id', 'categoryId', 'category_name', 'categoryName', 'transaction_type', 'transactionType',
  ],
  account_preference: [
    'account_id', 'accountId', 'account_name', 'accountName', 'transaction_type', 'transactionType',
  ],
  conversation_preference: ['profile_id', 'profileId', 'tone'],
  financial_goal_context: ['goal_id', 'goalId', 'goal_name', 'goalName', 'summary'],
});

function pickValue(memory) {
  const value = memory?.memory_value;
  if (!value || Array.isArray(value) || typeof value !== 'object') return null;
  return Object.fromEntries(
    VALUE_FIELDS[memory.memory_type]
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, value[key]]),
  );
}

function isActive(memory, now) {
  if (!['candidate', 'confirmed'].includes(memory?.status)) return false;
  if (memory.expires_at && new Date(memory.expires_at).getTime() <= now.getTime()) return false;
  if (memory.status === 'confirmed') return true;
  if (!EXPLICIT_SOURCES.has(memory.source)) return false;
  return memory.source !== 'user_correction' ||
    memory.memory_type === 'merchant_category_mapping';
}

export function createConversationMemoryContext(memories, {
  currentUserId,
  now = new Date(),
} = {}) {
  if (!currentUserId) {
    return deepFreeze({ version: '1.0', memories: [] });
  }

  const safeMemories = (Array.isArray(memories) ? memories : [])
    .filter((memory) => CONVERSATION_MEMORY_TYPES.includes(memory?.memory_type))
    .filter((memory) => memory.user_id === currentUserId)
    .filter((memory) => isActive(memory, now))
    .map((memory) => ({
      id: memory.id,
      type: memory.memory_type,
      key: normalizeMemoryText(memory.memory_key),
      value: pickValue(memory),
      source: memory.source,
      confirmed: memory.status === 'confirmed' || memory.user_confirmed === true,
      explanation:
        memory.source === 'user_correction'
          ? 'Correção informada pelo usuário.'
          : memory.status === 'confirmed'
            ? 'Preferência confirmada pelo usuário.'
            : 'Preferência informada explicitamente pelo usuário.',
    }))
    .filter((memory) => memory.id && memory.key && memory.value);

  return deepFreeze({ version: '1.0', memories: safeMemories });
}
