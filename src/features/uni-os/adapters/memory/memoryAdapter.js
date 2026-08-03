import { uniOS } from '../../orchestrator/index.js';
import { UNI_OS_ENABLED } from '../featureFlags.js';
import {
  normalizeFinancialType,
  normalizeMemoryEntity,
  normalizeMemoryIdentifier,
  readMemoryValue,
} from './memoryNormalizer.js';
import { createUniOSMemory } from './memorySchema.js';

const ACTIVE_STATUSES = new Set(['candidate', 'confirmed']);
const EXPLICIT_SOURCES = new Set(['explicit_user', 'user_correction']);
const ALLOWED_TYPES = new Set([
  'category_preference',
  'account_preference',
  'merchant_category_mapping',
  'financial_goal_context',
  'conversation_preference',
]);

const PROVIDERS = Object.freeze([
  ['explicit_memory', 'explicitMemory'],
  ['conversation_memory', 'conversationMemory'],
  ['financial_memory', 'financialMemory'],
  ['category_preferences', 'categoryPreferences'],
  ['account_preferences', 'accountPreferences'],
  ['merchant_mapping', 'merchantMappings'],
  ['financial_goal_context', 'financialGoalContext'],
  ['conversation_preferences', 'conversationPreferences'],
]);

function readProviderMemories(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.memories)) return value.memories;
  return [];
}

function canonicalMemory(memory, providerName, currentWorkspaceId, currentTime) {
  const type = memory?.memory_type ?? memory?.type;
  const source = memory?.source;
  const status = memory?.status ?? (memory?.confirmed ? 'confirmed' : 'candidate');
  const workspaceId = memory?.workspace_id ?? memory?.workspaceId ?? currentWorkspaceId ?? null;
  const expiresAt = memory?.expires_at ?? memory?.expiresAt ?? null;
  const value = memory?.memory_value ?? memory?.value;
  const id = normalizeMemoryIdentifier(memory?.id);

  if (!id || !ALLOWED_TYPES.has(type) || !EXPLICIT_SOURCES.has(source)) return null;
  if (!ACTIVE_STATUSES.has(status)) return null;
  if (!workspaceId || workspaceId !== currentWorkspaceId) return null;
  const currentTimestamp = new Date(currentTime).getTime();
  const expirationTimestamp = expiresAt ? new Date(expiresAt).getTime() : null;

  if (!Number.isFinite(currentTimestamp)) return null;
  if (expiresAt && !Number.isFinite(expirationTimestamp)) return null;
  if (expirationTimestamp !== null && expirationTimestamp <= currentTimestamp) return null;
  if (!value || Array.isArray(value) || typeof value !== 'object') return null;

  return { id, type, source, status, value, providerName };
}

function summaryItem(memory) {
  return {
    id: memory.id,
    type: memory.type,
    source: memory.source,
    confirmed: memory.status === 'confirmed',
  };
}

function accountItem(memory) {
  const name = readMemoryValue(memory.value, ['account_name', 'accountName']);
  const account = normalizeMemoryEntity(name, 'account');
  const institution = normalizeMemoryEntity(
    readMemoryValue(memory.value, ['institution_name', 'institutionName']),
    'institution',
  );
  const id = normalizeMemoryIdentifier(readMemoryValue(memory.value, ['account_id', 'accountId']));
  if (!id && !account) return null;
  return {
    id,
    account,
    institution,
    financialType: normalizeFinancialType(
      readMemoryValue(memory.value, ['transaction_type', 'transactionType']),
    ),
  };
}

function categoryItem(memory) {
  const name = readMemoryValue(memory.value, ['category_name', 'categoryName']);
  const category = normalizeMemoryEntity(name, 'category');
  const id = normalizeMemoryIdentifier(readMemoryValue(memory.value, ['category_id', 'categoryId']));
  if (!id && !category) return null;
  return {
    id,
    category,
    financialType: normalizeFinancialType(
      readMemoryValue(memory.value, ['transaction_type', 'transactionType']),
    ),
  };
}

function merchantItem(memory) {
  const merchant = normalizeMemoryEntity(readMemoryValue(memory.value, ['merchant']), 'merchant');
  const category = categoryItem(memory);
  return merchant && category ? { merchant, category } : null;
}

function goalItem(memory) {
  const id = normalizeMemoryIdentifier(readMemoryValue(memory.value, ['goal_id', 'goalId']));
  const goal = normalizeMemoryEntity(
    readMemoryValue(memory.value, ['goal_name', 'goalName', 'name']),
    'goal',
  );
  return id || goal ? { id, goal } : null;
}

function conversationPreferenceItem(memory) {
  const mode = readMemoryValue(memory.value, ['profile_id', 'profileId', 'tone', 'preference']);
  const normalized = typeof mode === 'string' ? mode.trim().toLowerCase() : null;
  return ['balanced', 'direct', 'warm', 'strategic'].includes(normalized)
    ? { mode: normalized }
    : null;
}

function addUnique(list, item) {
  if (!item) return;
  const serialized = JSON.stringify(item);
  if (!list.some((current) => JSON.stringify(current) === serialized)) list.push(item);
}

export function adaptMemorySources(sources = {}, options = {}) {
  const source = sources && typeof sources === 'object' ? sources : {};
  const workspaceId = source.workspaceId ?? null;
  const now = typeof options.now === 'function' ? options.now : () => new Date().toISOString();
  const currentTime = now();
  const valid = [];
  const providers = [];

  PROVIDERS.forEach(([providerName, sourceKey]) => {
    if (source[sourceKey] === undefined) return;
    providers.push(providerName);
    readProviderMemories(source[sourceKey]).forEach((memory) => {
      const normalized = canonicalMemory(memory, providerName, workspaceId, currentTime);
      if (normalized) valid.push(normalized);
    });
  });

  const explicitItems = [];
  const conversationItems = [];
  const accounts = [];
  const categories = [];
  const merchants = [];
  const goals = [];
  const accountPreferences = [];
  const categoryPreferences = [];
  const conversationPreferences = [];

  valid.forEach((memory) => {
    addUnique(explicitItems, summaryItem(memory));
    if (memory.providerName === 'conversation_memory') addUnique(conversationItems, summaryItem(memory));
    if (memory.type === 'account_preference') {
      const item = accountItem(memory);
      addUnique(accounts, item);
      addUnique(accountPreferences, item);
    } else if (memory.type === 'category_preference') {
      const item = categoryItem(memory);
      addUnique(categories, item);
      addUnique(categoryPreferences, item);
    } else if (memory.type === 'merchant_category_mapping') {
      addUnique(merchants, merchantItem(memory));
    } else if (memory.type === 'financial_goal_context') {
      addUnique(goals, goalItem(memory));
    } else if (memory.type === 'conversation_preference') {
      addUnique(conversationPreferences, conversationPreferenceItem(memory));
    }
  });

  return createUniOSMemory({
    timestamp: currentTime,
    explicit: { items: explicitItems },
    conversation: { items: conversationItems },
    financial: { accounts, categories, merchants, goals },
    preferences: {
      account: accountPreferences,
      category: categoryPreferences,
      conversation: conversationPreferences,
    },
    metadata: { providers },
  });
}

export function createMemoryReadProvider(memory) {
  return Object.freeze({
    providerName: 'uni_os_memory_adapter',
    read: async () => memory,
  });
}

export function logMemorySummary(logger, memory) {
  logger.info?.('[UNI OS] Memory', {
    version: memory.metadata.version,
    providers: memory.metadata.providers,
  });
  logger.info?.('[UNI OS] Explicit', { count: memory.explicit.items.length });
  logger.info?.('[UNI OS] Conversation', { count: memory.conversation.items.length });
  logger.info?.('[UNI OS] Financial', {
    accountCount: memory.financial.accounts.length,
    categoryCount: memory.financial.categories.length,
    merchantCount: memory.financial.merchants.length,
    goalCount: memory.financial.goals.length,
  });
  logger.info?.('[UNI OS] Preferences', {
    accountCount: memory.preferences.account.length,
    categoryCount: memory.preferences.category.length,
    conversationCount: memory.preferences.conversation.length,
  });
}

export async function runMemoryAdapterShadow(sources, options = {}) {
  const enabled = options.enabled ?? UNI_OS_ENABLED;
  if (!enabled) return Object.freeze({ status: 'DISABLED', memory: null, result: null });

  try {
    const memory = adaptMemorySources(sources, options.adapterOptions);
    const processor = options.processor ?? ((input) => uniOS.process(input));
    await processor({
      parsedIntent: options.parsedIntent ?? {},
      context: options.context,
      memoryProviders: [createMemoryReadProvider(memory)],
    });
    if (options.isDevelopment === true) logMemorySummary(options.logger ?? console, memory);
    return Object.freeze({ status: 'OBSERVED', memory, result: null });
  } catch {
    if (options.isDevelopment === true) {
      (options.logger ?? console).warn?.('[UNI OS] Memory shadow validation failed safely.');
    }
    return Object.freeze({ status: 'FAILED_SAFE', memory: null, result: null });
  }
}
