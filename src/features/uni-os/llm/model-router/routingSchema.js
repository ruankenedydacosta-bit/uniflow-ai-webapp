export const MODEL_ROUTER_VERSION = '1.0';

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

export function createModelRoutingSchema(result = {}) {
  return deepFreeze({
    routingResult: {
      requestedCapability: result.requestedCapability ?? null,
      resolvedCapability: result.resolvedCapability ?? null,
      candidateProviders: cloneValue(result.candidateProviders ?? []),
      selectedProvider: result.selectedProvider ?? null,
      fallbackProviders: cloneValue(result.fallbackProviders ?? []),
      routingPolicy: result.routingPolicy ?? 'DEFAULT',
      decisionReason: result.decisionReason ?? 'CAPABILITY_NOT_REGISTERED',
      estimatedCost: result.estimatedCost ?? null,
      estimatedLatency: result.estimatedLatency ?? null,
      requiresStructuredContext: result.requiresStructuredContext === true,
      requiresStreaming: result.requiresStreaming === true,
      requiresVision: result.requiresVision === true,
      requiresVoice: result.requiresVoice === true,
      confidence: Number.isFinite(result.confidence)
        ? Math.max(0, Math.min(1, result.confidence))
        : 0,
      metadata: cloneValue(result.metadata ?? {}),
    },
    version: MODEL_ROUTER_VERSION,
    metadata: {
      immutable: true,
      deterministic: true,
      representationalOnly: true,
      providerExecuted: false,
      modelExecuted: false,
      externalCallsMade: false,
      credentialsKnown: false,
      tokensConsumed: false,
    },
  });
}

export { deepFreeze };

