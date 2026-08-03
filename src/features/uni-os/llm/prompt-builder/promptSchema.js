export const STRUCTURED_PROMPT_VERSION = '1.0';

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

function normalizeCost(value) {
  if (Number.isFinite(value) && value >= 0) return value;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return ['LOW', 'MEDIUM', 'HIGH'].includes(normalized) ? normalized : null;
}

export function createStructuredPromptSchema(input = {}) {
  const sections = cloneValue(Array.isArray(input.sections) ? input.sections : []);
  const estimatedTokens = sections.reduce(
    (total, section) => total + (Number.isInteger(section.estimatedTokens)
      ? section.estimatedTokens
      : 0),
    0,
  );
  return deepFreeze({
    structuredPrompt: {
      sections,
      estimatedTokens,
      estimatedCost: normalizeCost(input.estimatedCost),
      routing: cloneValue(input.routing ?? {}),
      statistics: {
        sectionsCount: sections.length,
        mandatorySections: sections.filter((section) => section.metadata?.mandatory).length,
        withinBudgetSections: sections.filter(
          (section) => section.metadata?.withinAllocatedBudget,
        ).length,
        allocatedBudget: Number.isInteger(input.allocatedBudget) ? input.allocatedBudget : 0,
        budgetVariance: estimatedTokens
          - (Number.isInteger(input.allocatedBudget) ? input.allocatedBudget : 0),
      },
      metadata: {
        version: STRUCTURED_PROMPT_VERSION,
        policy: input.policy ?? 'UNI_OS_STRUCTURED_PROMPT_V1',
        structuredOnly: true,
        responseGenerated: false,
        adapterInvoked: false,
      },
    },
    version: STRUCTURED_PROMPT_VERSION,
    metadata: {
      immutable: true,
      deterministic: true,
      representationalOnly: true,
      conversationWindowModified: false,
      tokenBudgetModified: false,
      compiledContextModified: false,
      responseGenerated: false,
      modelInvoked: false,
      adapterInvoked: false,
      externalCallsMade: false,
      tokensConsumed: 0,
      persisted: false,
      executionAllowed: false,
      shadowMode: true,
    },
  });
}

export { cloneValue, deepFreeze };
