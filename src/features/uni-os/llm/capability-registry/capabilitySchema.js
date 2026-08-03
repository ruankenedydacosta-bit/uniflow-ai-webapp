export const CAPABILITY_REGISTRY_VERSION = '1.0';

export const CAPABILITY_IDS = Object.freeze([
  'GENERAL_REASONING',
  'FINANCIAL_REASONING',
  'LONG_TERM_PLANNING',
  'GOAL_ANALYSIS',
  'INSIGHT_ANALYSIS',
  'CLASSIFICATION',
  'SUMMARIZATION',
  'EXPLANATION',
  'RECOMMENDATION',
  'FORECAST',
  'DOCUMENT_ANALYSIS',
  'VISION',
  'OCR',
  'VOICE',
  'CALCULATION',
  'BRAINSTORMING',
  'CONVERSATION',
]);

export const CAPABILITY_COMPLEXITIES = Object.freeze(['LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH']);
export const CAPABILITY_COST_LEVELS = Object.freeze(['LOW', 'MEDIUM', 'HIGH']);
export const CAPABILITY_LATENCY_LEVELS = Object.freeze(['LOW', 'MEDIUM', 'HIGH']);

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

function cloneCapability(capability = {}) {
  return {
    id: capability.id,
    name: capability.name,
    description: capability.description,
    complexity: capability.complexity,
    estimatedCost: capability.estimatedCost,
    estimatedLatency: capability.estimatedLatency,
    supportsStreaming: capability.supportsStreaming,
    supportsVision: capability.supportsVision,
    supportsVoice: capability.supportsVoice,
    requiresStructuredContext: capability.requiresStructuredContext,
    metadata: cloneValue(capability.metadata),
  };
}

export function createCapabilityRegistrySchema(capabilities = []) {
  const safeCapabilities = Array.isArray(capabilities)
    ? capabilities.map(cloneCapability)
    : [];
  return deepFreeze({
    capabilities: safeCapabilities,
    version: CAPABILITY_REGISTRY_VERSION,
    metadata: {
      capabilityCount: safeCapabilities.length,
      immutable: true,
      catalogOnly: true,
      externalCallsMade: false,
      selectionPerformed: false,
    },
  });
}

export { deepFreeze };
