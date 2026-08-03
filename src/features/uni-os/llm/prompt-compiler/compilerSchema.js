export const PROMPT_COMPILER_VERSION = '1.0';

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

export function createCompiledPromptSchema(input = {}) {
  const text = typeof input.text === 'string' ? input.text : '';
  const sections = cloneValue(Array.isArray(input.sections) ? input.sections : []);
  return deepFreeze({
    compiledPrompt: {
      text,
      sections,
      estimatedTokens: Number.isInteger(input.estimatedTokens) ? input.estimatedTokens : 0,
      estimatedCost: input.estimatedCost ?? null,
      policy: input.policy ?? 'STANDARD',
      routing: cloneValue(input.routing ?? {}),
      statistics: {
        sectionsCount: sections.length,
        promptLength: text.length,
        lineCount: text === '' ? 0 : text.split('\n').length,
        formattedSections: sections.length,
      },
      metadata: {
        version: PROMPT_COMPILER_VERSION,
        sourceApproved: true,
        contentPreserved: true,
        providerAgnostic: true,
      },
    },
    version: PROMPT_COMPILER_VERSION,
    metadata: {
      immutable: true,
      deterministic: true,
      compiled: true,
      shadowMode: true,
      structuredPromptModified: false,
      validationReportModified: false,
      routingResultModified: false,
      responseGenerated: false,
      adapterInvoked: false,
      modelInvoked: false,
      externalCallsMade: false,
      httpRequestsMade: false,
      tokensConsumed: 0,
      persisted: false,
      executionAllowed: false,
    },
  });
}

export function createPromptCompilationError(code = 'COMPILATION_BLOCKED', policy = 'STANDARD') {
  return deepFreeze({
    compiledPrompt: null,
    error: {
      code,
      message: 'Prompt compilation was not completed.',
      blocking: true,
    },
    version: PROMPT_COMPILER_VERSION,
    metadata: {
      immutable: true,
      deterministic: true,
      compiled: false,
      policy,
      shadowMode: true,
      structuredPromptModified: false,
      validationReportModified: false,
      routingResultModified: false,
      responseGenerated: false,
      adapterInvoked: false,
      modelInvoked: false,
      externalCallsMade: false,
      httpRequestsMade: false,
      tokensConsumed: 0,
      persisted: false,
      executionAllowed: false,
    },
  });
}

export { cloneValue, deepFreeze };
