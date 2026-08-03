export const CONVERSATION_WINDOW_VERSION = '1.0';

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [key, cloneValue(nested)]),
  );
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function collection(value) {
  return Array.isArray(value) ? cloneValue(value) : [];
}

function record(value) {
  return value && !Array.isArray(value) && typeof value === 'object' ? cloneValue(value) : {};
}

function count(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

export function createConversationWindowSchema(input = {}) {
  const selected = input.selected ?? {};
  const eligible = input.eligible ?? {};
  const limits = input.limits ?? {};
  const selectedCounts = {
    messages: collection(selected.messages).length,
    goals: collection(selected.goals).length,
    memory: collection(selected.memory).length,
    context: collection(selected.context).length,
    insights: collection(selected.insights).length,
  };

  return deepFreeze({
    conversationWindow: {
      messages: collection(selected.messages),
      goals: collection(selected.goals),
      memory: collection(selected.memory),
      context: collection(selected.context),
      insights: collection(selected.insights),
      reflection: record(selected.reflection),
      security: record(selected.security),
      permissions: record(selected.permissions),
      metadata: {
        version: CONVERSATION_WINDOW_VERSION,
        policy: input.policy ?? 'NORMAL',
        limits: record(limits),
      },
    },
    statistics: {
      eligible: {
        messages: count(eligible.messages),
        goals: count(eligible.goals),
        memory: count(eligible.memory),
        context: count(eligible.context),
        insights: count(eligible.insights),
      },
      selected: selectedCounts,
      totalSelected: Object.values(selectedCounts).reduce((total, value) => total + value, 0),
    },
    metadata: {
      version: CONVERSATION_WINDOW_VERSION,
      deterministic: true,
      selectionOnly: true,
      snapshotsModified: false,
      summarized: false,
      promptGenerated: false,
      modelInvoked: false,
      tokensConsumed: 0,
      persisted: false,
      executionAllowed: false,
      shadowMode: true,
    },
  });
}

export { cloneValue, deepFreeze };
