export const TOKEN_BUDGET_SECTIONS = Object.freeze([
  'messages',
  'goals',
  'memory',
  'context',
  'insights',
  'reflection',
  'security',
  'permissions',
]);

function policy(totalBudget, weights) {
  return Object.freeze({ totalBudget, weights: Object.freeze(weights) });
}

export const TOKEN_BUDGET_POLICIES = Object.freeze({
  ECONOMY: policy(2048, {
    messages: 0.35, goals: 0.08, memory: 0.12, context: 0.10,
    insights: 0.08, reflection: 0.10, security: 0.10, permissions: 0.07,
  }),
  BALANCED: policy(4096, {
    messages: 0.30, goals: 0.10, memory: 0.15, context: 0.12,
    insights: 0.10, reflection: 0.08, security: 0.08, permissions: 0.07,
  }),
  QUALITY: policy(8192, {
    messages: 0.25, goals: 0.12, memory: 0.17, context: 0.12,
    insights: 0.12, reflection: 0.08, security: 0.07, permissions: 0.07,
  }),
  MAX_CONTEXT: policy(16384, {
    messages: 0.20, goals: 0.13, memory: 0.20, context: 0.15,
    insights: 0.13, reflection: 0.07, security: 0.06, permissions: 0.06,
  }),
});

export const TOKEN_BUDGET_POLICY_IDS = Object.freeze(Object.keys(TOKEN_BUDGET_POLICIES));

export function resolveTokenBudgetPolicy(policyId = 'BALANCED') {
  const normalized = typeof policyId === 'string' ? policyId.trim().toUpperCase() : 'BALANCED';
  const id = TOKEN_BUDGET_POLICY_IDS.includes(normalized) ? normalized : 'BALANCED';
  return Object.freeze({ id, ...TOKEN_BUDGET_POLICIES[id] });
}

export function resolveBudgetPolicyFromRoutingResult(routingResult = {}) {
  const source = routingResult?.routingResult ?? routingResult;
  return resolveTokenBudgetPolicy(
    source?.metadata?.tokenBudgetPolicy ?? source?.metadata?.budgetPolicy ?? 'BALANCED',
  );
}
