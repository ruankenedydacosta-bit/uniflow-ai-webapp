export const CONVERSATION_WINDOW_POLICIES = Object.freeze({
  SHORT: Object.freeze({ messages: 4, goals: 2, memory: 3, context: 3, insights: 2 }),
  NORMAL: Object.freeze({ messages: 8, goals: 4, memory: 6, context: 6, insights: 4 }),
  LONG: Object.freeze({ messages: 16, goals: 8, memory: 12, context: 12, insights: 8 }),
  FULL: Object.freeze({
    messages: Number.MAX_SAFE_INTEGER,
    goals: Number.MAX_SAFE_INTEGER,
    memory: Number.MAX_SAFE_INTEGER,
    context: Number.MAX_SAFE_INTEGER,
    insights: Number.MAX_SAFE_INTEGER,
  }),
});

export const CONVERSATION_WINDOW_POLICY_IDS = Object.freeze(
  Object.keys(CONVERSATION_WINDOW_POLICIES),
);

export function resolveConversationWindowPolicy(policyId = 'NORMAL') {
  const normalized = typeof policyId === 'string' ? policyId.trim().toUpperCase() : 'NORMAL';
  const id = CONVERSATION_WINDOW_POLICY_IDS.includes(normalized) ? normalized : 'NORMAL';
  return Object.freeze({ id, limits: CONVERSATION_WINDOW_POLICIES[id] });
}

export function resolvePolicyFromRoutingResult(routingResult = {}) {
  const source = routingResult?.routingResult ?? routingResult;
  const policy = source?.metadata?.conversationWindowPolicy
    ?? source?.metadata?.windowPolicy
    ?? 'NORMAL';
  return resolveConversationWindowPolicy(policy);
}
