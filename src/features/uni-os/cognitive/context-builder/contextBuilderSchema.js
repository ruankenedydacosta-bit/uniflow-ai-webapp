export const COGNITIVE_CONTEXT_SCHEMA_VERSION = '1.0';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [key, cloneValue(nested)]),
  );
}

function safeCount(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function safeCollection(value) {
  return Array.isArray(value) ? value.map(cloneValue) : [];
}

function safeRecord(value) {
  return value && !Array.isArray(value) && typeof value === 'object'
    ? cloneValue(value)
    : {};
}

export function createCognitiveContextSnapshot({ compiledContext = {}, statistics = {} } = {}) {
  const source = compiledContext && typeof compiledContext === 'object' ? compiledContext : {};
  return deepFreeze({
    compiledContext: {
      conversation: safeRecord(source.conversation),
      goals: safeCollection(source.goals),
      memory: safeCollection(source.memory),
      context: safeCollection(source.context),
      insights: safeCollection(source.insights),
      planning: safeRecord(source.planning),
      reflection: safeRecord(source.reflection),
      security: safeRecord(source.security),
      permissions: safeRecord(source.permissions),
    },
    statistics: {
      inputItems: safeCount(statistics.inputItems),
      outputItems: safeCount(statistics.outputItems),
      duplicatesRemoved: safeCount(statistics.duplicatesRemoved),
      filteredItems: safeCount(statistics.filteredItems),
    },
    metadata: {
      version: COGNITIVE_CONTEXT_SCHEMA_VERSION,
      deterministic: true,
      compressed: true,
      promptGenerated: false,
      modelInvoked: false,
      naturalLanguageGenerated: false,
      persisted: false,
      executionAllowed: false,
    },
  });
}

export { deepFreeze };
