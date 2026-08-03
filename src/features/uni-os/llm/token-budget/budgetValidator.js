import { TOKEN_BUDGET_POLICY_IDS, TOKEN_BUDGET_SECTIONS } from './budgetPolicy.js';
import { TOKEN_BUDGET_VERSION } from './budgetSchema.js';

function isRecord(value) {
  return Boolean(value && !Array.isArray(value) && typeof value === 'object');
}

function isDeepFrozen(value) {
  if (!value || typeof value !== 'object') return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}

export function validateTokenBudget(snapshot) {
  const errors = [];
  if (!isRecord(snapshot)) {
    return Object.freeze({ valid: false, errors: Object.freeze(['TOKEN_BUDGET_REQUIRED']) });
  }
  const budget = snapshot.tokenBudget;
  if (!isRecord(budget)) errors.push('TOKEN_BUDGET_BODY_REQUIRED');
  if (!TOKEN_BUDGET_POLICY_IDS.includes(budget?.metadata?.policy)) {
    errors.push('INVALID_TOKEN_BUDGET_POLICY');
  }
  if (snapshot.version !== TOKEN_BUDGET_VERSION
    || budget?.metadata?.version !== TOKEN_BUDGET_VERSION) {
    errors.push('INVALID_TOKEN_BUDGET_VERSION');
  }

  const allocated = TOKEN_BUDGET_SECTIONS.reduce((total, section) => {
    const value = budget?.sections?.[section];
    if (!Number.isInteger(value) || value < 0) errors.push(`INVALID_${section.toUpperCase()}_BUDGET`);
    const demand = budget?.statistics?.sectionDemand?.[section];
    if (!Number.isInteger(demand) || demand < 0) errors.push(`INVALID_${section.toUpperCase()}_DEMAND`);
    if (Number.isInteger(value) && Number.isInteger(demand) && value > demand) {
      errors.push(`OVERALLOCATED_${section.toUpperCase()}_BUDGET`);
    }
    return total + (Number.isInteger(value) ? value : 0);
  }, 0);

  if (allocated !== budget?.allocatedBudget) errors.push('ALLOCATED_BUDGET_MISMATCH');
  if (!Number.isInteger(budget?.totalBudget) || budget.totalBudget < allocated) {
    errors.push('INVALID_TOTAL_BUDGET');
  }
  if (budget?.remainingBudget !== budget?.totalBudget - allocated) {
    errors.push('REMAINING_BUDGET_MISMATCH');
  }
  if (snapshot.metadata?.calculationOnly !== true
    || snapshot.metadata?.conversationWindowModified !== false
    || snapshot.metadata?.contextReduced !== false
    || snapshot.metadata?.messagesRemoved !== false
    || snapshot.metadata?.promptGenerated !== false
    || snapshot.metadata?.modelInvoked !== false
    || snapshot.metadata?.tokensConsumed !== 0
    || snapshot.metadata?.executionAllowed !== false) {
    errors.push('INVALID_TOKEN_BUDGET_INVARIANTS');
  }
  if (!isDeepFrozen(snapshot)) errors.push('TOKEN_BUDGET_NOT_IMMUTABLE');
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}
