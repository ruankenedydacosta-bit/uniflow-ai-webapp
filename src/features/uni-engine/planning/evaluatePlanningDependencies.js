import { PLANNING_POLICY } from './planningPolicy.js';

function dependency(type, satisfied, source, required = true) {
  return {
    type,
    required,
    satisfied: Boolean(satisfied),
    status: satisfied ? 'AVAILABLE' : 'MISSING',
    source,
  };
}

export function evaluatePlanningDependencies(input = {}) {
  const goal = input.goal ?? {};
  const snapshot = input.financialSnapshot ?? null;
  const epistemic = input.epistemicModel ?? null;
  const decision = input.decisionLayer ?? null;
  const memory = input.persistentMemory ?? null;
  const workspaceType = input.session?.workspaceType
    ?? input.userPreferences?.workspaceType
    ?? null;
  const dependencies = [];
  const amountRequired = ['FINANCIAL', 'SAVINGS', 'DEBT', 'INVESTMENT'].includes(goal.type);

  dependencies.push(dependency('TARGET_AMOUNT', goal.targetAmount != null, 'goal', amountRequired));
  dependencies.push(dependency('TARGET_DATE', goal.targetDate != null || goal.horizonMonths != null, 'goal', goal.type !== 'BUDGET'));

  const snapshotRequired = ['FINANCIAL', 'SAVINGS', 'DEBT', 'INVESTMENT', 'BUDGET', 'BUSINESS'].includes(goal.type);
  dependencies.push(dependency('FINANCIAL_SNAPSHOT', Boolean(snapshot?.hasData), 'financial_snapshot', snapshotRequired));

  if (goal.type === 'DEBT') dependencies.push(dependency('DEBT_CONTEXT', Boolean(snapshot?.debts?.length), 'financial_snapshot'));
  if (goal.type === 'INVESTMENT') dependencies.push(dependency('INVESTMENT_PROFILE', Boolean(input.userPreferences?.investmentProfile), 'preferences'));
  if (goal.type === 'BUDGET') dependencies.push(dependency('BUDGET_CONTEXT', Boolean(snapshot?.hasData), 'financial_snapshot'));
  if (goal.type === 'BUSINESS') {
    dependencies.push(dependency('BUSINESS_CONTEXT', workspaceType === 'business', 'session'));
    dependencies.push(dependency('WORKSPACE_CONTEXT', workspaceType === 'business', 'session'));
  }

  const conflicts = Array.isArray(epistemic?.conflicts) ? epistemic.conflicts : [];
  if (conflicts.length > 0) dependencies.push(dependency('CONFLICT_RESOLUTION', false, 'epistemic_model'));
  if (decision?.decisionType === 'CONFIRM') dependencies.push(dependency('USER_CONFIRMATION', false, 'decision_layer'));

  const hasMemory = Array.isArray(memory?.retrieved) && memory.retrieved.length > 0;
  const limited = dependencies.slice(0, PLANNING_POLICY.limits.maxDependencies);
  return {
    dependencies: limited,
    missing: limited.filter((entry) => entry.required && !entry.satisfied),
    optionalMissing: limited.filter((entry) => !entry.required && !entry.satisfied),
    hasMemory,
  };
}
