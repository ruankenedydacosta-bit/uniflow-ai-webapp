export const PROVIDER_REGISTRY_VERSION = '1.0';

export const PROVIDER_IDS = Object.freeze([
  'OPENAI',
  'CLAUDE',
  'GEMINI',
  'MISTRAL',
  'LLAMA_LOCAL',
  'DEEPSEEK',
  'QWEN',
  'CUSTOM',
]);

export const PROVIDER_STATUSES = Object.freeze([
  'AVAILABLE',
  'UNAVAILABLE',
  'DISABLED',
  'EXPERIMENTAL',
]);

export const PROVIDER_HEALTH_STATUSES = Object.freeze([
  'UNKNOWN',
  'HEALTHY',
  'DEGRADED',
  'OFFLINE',
]);

export const PROVIDER_TYPES = Object.freeze(['HOSTED', 'LOCAL', 'CUSTOM']);
export const PROVIDER_COST_LEVELS = Object.freeze(['LOW', 'MEDIUM', 'HIGH']);
export const PROVIDER_LATENCY_LEVELS = Object.freeze(['LOW', 'MEDIUM', 'HIGH']);

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

function cloneProvider(provider = {}) {
  return {
    id: provider.id,
    name: provider.name,
    status: provider.status,
    priority: provider.priority,
    type: provider.type,
    supportedCapabilities: cloneValue(provider.supportedCapabilities ?? []),
    estimatedLatency: provider.estimatedLatency,
    estimatedCost: provider.estimatedCost,
    supportsStreaming: provider.supportsStreaming,
    supportsVision: provider.supportsVision,
    supportsVoice: provider.supportsVoice,
    supportsStructuredOutput: provider.supportsStructuredOutput,
    supportsFunctionCalling: provider.supportsFunctionCalling,
    healthStatus: provider.healthStatus,
    fallbackPriority: provider.fallbackPriority,
    metadata: cloneValue(provider.metadata ?? {}),
  };
}

export function createProviderRegistrySchema(providers = []) {
  const clonedProviders = providers.map(cloneProvider);
  return deepFreeze({
    providers: clonedProviders,
    version: PROVIDER_REGISTRY_VERSION,
    metadata: {
      providerCount: clonedProviders.length,
      immutable: true,
      catalogOnly: true,
      operationalProviders: 0,
      externalCallsMade: false,
      credentialsKnown: false,
      routingPerformed: false,
    },
  });
}

