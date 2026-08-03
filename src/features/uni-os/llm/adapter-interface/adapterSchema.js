export const LLM_ADAPTER_INTERFACE_VERSION = '1.0';

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

export function createAdapterInterfaceSchema(definition = {}) {
  return deepFreeze({
    adapterInterface: {
      name: definition.name,
      version: definition.version,
      supportedCapabilities: cloneValue(definition.supportedCapabilities ?? []),
      supportsStreaming: definition.supportsStreaming === true,
      supportsVision: definition.supportsVision === true,
      supportsVoice: definition.supportsVoice === true,
      supportsStructuredOutput: definition.supportsStructuredOutput === true,
      supportsFunctionCalling: definition.supportsFunctionCalling === true,
      metadata: cloneValue(definition.metadata ?? {}),
    },
    version: LLM_ADAPTER_INTERFACE_VERSION,
    metadata: {
      immutable: true,
      contractOnly: true,
      concreteAdapterCreated: false,
      requestBuilt: false,
      providerInvoked: false,
      modelExecuted: false,
      externalCallsMade: false,
      credentialsKnown: false,
      tokensConsumed: false,
    },
  });
}

export { deepFreeze };

