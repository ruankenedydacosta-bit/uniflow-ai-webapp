import { TOKEN_BUDGET_SECTIONS } from './budgetPolicy.js';

export const TOKEN_BUDGET_VERSION = '1.0';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function safeInteger(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function sectionRecord(value = {}) {
  return Object.fromEntries(
    TOKEN_BUDGET_SECTIONS.map((section) => [section, safeInteger(value[section])]),
  );
}

export function createTokenBudgetSchema(input = {}) {
  const sections = sectionRecord(input.sections);
  const sectionDemand = sectionRecord(input.sectionDemand);
  const allocatedBudget = Object.values(sections).reduce((total, value) => total + value, 0);
  const estimatedDemand = Object.values(sectionDemand).reduce((total, value) => total + value, 0);
  const totalBudget = safeInteger(input.totalBudget);

  return deepFreeze({
    tokenBudget: {
      totalBudget,
      allocatedBudget,
      remainingBudget: Math.max(0, totalBudget - allocatedBudget),
      sections,
      statistics: {
        estimatedDemand,
        sectionDemand,
        utilizationRatio: totalBudget > 0
          ? Number((allocatedBudget / totalBudget).toFixed(4))
          : 0,
        fullyFundedSections: TOKEN_BUDGET_SECTIONS.filter(
          (section) => sections[section] >= sectionDemand[section],
        ),
        constrainedSections: TOKEN_BUDGET_SECTIONS.filter(
          (section) => sections[section] < sectionDemand[section],
        ),
      },
      metadata: {
        version: TOKEN_BUDGET_VERSION,
        policy: input.policy ?? 'BALANCED',
        estimator: input.estimator ?? 'DETERMINISTIC_STRUCTURE_RATIO_V1',
        approximate: true,
        tokenizerUsed: false,
      },
    },
    version: TOKEN_BUDGET_VERSION,
    metadata: {
      immutable: true,
      deterministic: true,
      calculationOnly: true,
      conversationWindowModified: false,
      contextReduced: false,
      messagesRemoved: false,
      summarized: false,
      promptGenerated: false,
      modelInvoked: false,
      externalCallsMade: false,
      tokensConsumed: 0,
      persisted: false,
      executionAllowed: false,
      shadowMode: true,
    },
  });
}

export { deepFreeze };
