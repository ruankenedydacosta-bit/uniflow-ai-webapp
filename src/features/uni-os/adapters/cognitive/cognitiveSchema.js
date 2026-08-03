export const UNI_OS_COGNITIVE_GATEWAY_SCHEMA_VERSION = '1.0';

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

export function createCognitiveGatewaySnapshot(input = {}) {
  return deepFreeze({
    gatewayId: typeof input.gatewayId === 'string' ? input.gatewayId : '',
    timestamp: typeof input.timestamp === 'string' ? input.timestamp : '',
    provider: null,
    route: 'NOT_IMPLEMENTED',
    shouldInvokeModel: false,
    modelCapability: null,
    promptTemplate: null,
    structuredInput: {
      intent: safeSnapshot(input.structuredInput?.intent),
      context: safeSnapshot(input.structuredInput?.context),
      memory: safeSnapshot(input.structuredInput?.memory),
      planning: safeSnapshot(input.structuredInput?.planning),
      reflection: safeSnapshot(input.structuredInput?.reflection),
      security: safeSnapshot(input.structuredInput?.security),
      permissions: safeSnapshot(input.structuredInput?.permissions),
    },
    metadata: {
      version: UNI_OS_COGNITIVE_GATEWAY_SCHEMA_VERSION,
      requestedCapability: typeof input.metadata?.requestedCapability === 'string'
        ? input.metadata.requestedCapability
        : 'GENERAL_REASONING',
      externalCallMade: false,
    },
  });
}
