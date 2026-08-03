export const UNI_OS_STRUCTURED_RESPONSE_SCHEMA_VERSION = '1.0';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [key, cloneValue(nestedValue)]),
  );
}

function safeSnapshot(value) {
  return value && typeof value === 'object' ? cloneValue(value) : {};
}

export function createStructuredResponseSnapshot(input = {}) {
  return deepFreeze({
    responseId: typeof input.responseId === 'string' ? input.responseId : '',
    timestamp: typeof input.timestamp === 'string' ? input.timestamp : '',
    version: UNI_OS_STRUCTURED_RESPONSE_SCHEMA_VERSION,
    facts: {
      parsedIntent: safeSnapshot(input.facts?.parsedIntent),
      context: safeSnapshot(input.facts?.context),
      memory: safeSnapshot(input.facts?.memory),
    },
    planning: safeSnapshot(input.planning),
    reflection: safeSnapshot(input.reflection),
    security: safeSnapshot(input.security),
    permissions: safeSnapshot(input.permissions),
    cognition: safeSnapshot(input.cognition),
    communication: {
      emotion: null,
      personality: null,
      outputType: null,
    },
    executionAllowed: false,
    metadata: {
      schemaVersion: UNI_OS_STRUCTURED_RESPONSE_SCHEMA_VERSION,
      generatedInShadowMode: input.metadata?.generatedInShadowMode === true,
    },
  });
}
