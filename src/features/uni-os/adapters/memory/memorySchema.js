export const UNI_OS_MEMORY_SCHEMA_VERSION = '1.0';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [key, cloneValue(nestedValue)]),
  );
}

function copyList(value) {
  return Array.isArray(value) ? value.map(cloneValue) : [];
}

export function createUniOSMemory(input = {}) {
  return deepFreeze({
    timestamp: typeof input.timestamp === 'string' ? input.timestamp : '',
    explicit: {
      items: copyList(input.explicit?.items),
    },
    conversation: {
      items: copyList(input.conversation?.items),
    },
    financial: {
      accounts: copyList(input.financial?.accounts),
      categories: copyList(input.financial?.categories),
      merchants: copyList(input.financial?.merchants),
      goals: copyList(input.financial?.goals),
    },
    preferences: {
      account: copyList(input.preferences?.account),
      category: copyList(input.preferences?.category),
      conversation: copyList(input.preferences?.conversation),
    },
    metadata: {
      version: UNI_OS_MEMORY_SCHEMA_VERSION,
      providers: Array.isArray(input.metadata?.providers) ? [...input.metadata.providers] : [],
    },
  });
}
