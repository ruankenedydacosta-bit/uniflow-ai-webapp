export const UNI_OS_CONTEXT_SCHEMA_VERSION = '1.0';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function nullableIdentifier(value) {
  if (typeof value !== 'string') return null;
  const identifier = value.trim();
  return identifier && identifier.length <= 128 ? identifier : null;
}

export function createUniOSContext(input = {}) {
  return deepFreeze({
    timestamp: typeof input.timestamp === 'string' ? input.timestamp : '',
    session: {
      authenticated: input.session?.authenticated === true,
      sessionId: nullableIdentifier(input.session?.sessionId),
      state: input.session?.state ?? 'anonymous',
    },
    user: {
      id: nullableIdentifier(input.user?.id),
      profileCompleted: input.user?.profileCompleted === true,
    },
    workspace: {
      id: nullableIdentifier(input.workspace?.id),
      role: input.workspace?.role ?? null,
    },
    conversation: {
      channel: input.conversation?.channel ?? 'text',
      language: input.conversation?.language ?? 'pt-BR',
      timezone: input.conversation?.timezone ?? 'UTC',
    },
    personality: {
      mode: input.personality?.mode ?? 'balanced',
    },
    featureFlags: {
      uniOS: input.featureFlags?.uniOS === true,
      premiumVoice: input.featureFlags?.premiumVoice === true,
    },
    metadata: {
      version: UNI_OS_CONTEXT_SCHEMA_VERSION,
    },
  });
}
