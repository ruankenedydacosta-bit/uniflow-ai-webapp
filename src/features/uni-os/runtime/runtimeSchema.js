export const UNI_OS_RUNTIME_SCHEMA_VERSION = '1.0';

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

export function createRuntimeInputs(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  return deepFreeze({
    parsedIntent: safeSnapshot(source.parsedIntent),
    runtimeContext: safeSnapshot(source.runtimeContext),
  });
}

export function createRuntimeResult(input = {}) {
  return deepFreeze({
    runtimeId: typeof input.runtimeId === 'string' ? input.runtimeId : '',
    timestamp: typeof input.timestamp === 'string' ? input.timestamp : '',
    parsedIntent: safeSnapshot(input.parsedIntent),
    context: safeSnapshot(input.context),
    memory: safeSnapshot(input.memory),
    planning: safeSnapshot(input.planning),
    reflection: safeSnapshot(input.reflection),
    security: safeSnapshot(input.security),
    permissions: safeSnapshot(input.permissions),
    cognition: safeSnapshot(input.cognition),
    structuredResponse: safeSnapshot(input.structuredResponse),
    communication: safeSnapshot(input.communication),
    executionAllowed: false,
    completed: input.completed === true,
    metadata: {
      version: UNI_OS_RUNTIME_SCHEMA_VERSION,
      shadowMode: true,
      telemetry: safeSnapshot(input.telemetry),
    },
  });
}
