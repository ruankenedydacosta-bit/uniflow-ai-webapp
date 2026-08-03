import { estimateBudgetValue } from '../token-budget/budgetEstimator.js';
import {
  PROMPT_SECTION_IDS,
  PROMPT_SECTION_POLICY,
} from './promptPolicy.js';

function safeBudget(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

export function assemblePromptSections(content = {}, tokenBudget = {}) {
  const budget = tokenBudget?.tokenBudget ?? tokenBudget;
  return PROMPT_SECTION_IDS.map((id, index) => {
    const policy = PROMPT_SECTION_POLICY[id];
    const estimatedTokens = estimateBudgetValue(content[id]);
    const allocatedBudget = policy.budgetSection
      ? safeBudget(budget?.sections?.[policy.budgetSection])
      : estimatedTokens;
    return {
      id,
      title: policy.title,
      priority: policy.priority,
      estimatedTokens,
      content: content[id],
      metadata: {
        order: index + 1,
        budgetSection: policy.budgetSection,
        allocatedBudget,
        withinAllocatedBudget: estimatedTokens <= allocatedBudget,
        mandatory: true,
      },
    };
  });
}
