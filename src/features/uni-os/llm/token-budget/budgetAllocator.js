import { TOKEN_BUDGET_SECTIONS } from './budgetPolicy.js';

function safeDemand(value) {
  return Number.isInteger(value) && value > 0 ? value : 0;
}

export function allocateTokenBudget(sectionDemand = {}, policy = {}) {
  const totalBudget = Number.isInteger(policy.totalBudget) && policy.totalBudget > 0
    ? policy.totalBudget
    : 0;
  const allocations = Object.fromEntries(TOKEN_BUDGET_SECTIONS.map((section) => {
    const weightedLimit = Math.floor(totalBudget * (policy.weights?.[section] ?? 0));
    return [section, Math.min(safeDemand(sectionDemand[section]), weightedLimit)];
  }));

  let allocatedBudget = Object.values(allocations).reduce((total, value) => total + value, 0);
  let remainingBudget = totalBudget - allocatedBudget;

  while (remainingBudget > 0) {
    const candidates = TOKEN_BUDGET_SECTIONS.filter(
      (section) => allocations[section] < safeDemand(sectionDemand[section]),
    );
    if (candidates.length === 0) break;

    const share = Math.max(1, Math.floor(remainingBudget / candidates.length));
    let distributed = 0;
    candidates.forEach((section) => {
      if (remainingBudget - distributed <= 0) return;
      const missing = safeDemand(sectionDemand[section]) - allocations[section];
      const amount = Math.min(share, missing, remainingBudget - distributed);
      allocations[section] += amount;
      distributed += amount;
    });
    if (distributed === 0) break;
    allocatedBudget += distributed;
    remainingBudget -= distributed;
  }

  return { sections: allocations, allocatedBudget, remainingBudget };
}
