export const ROUTING_POLICIES_VERSION = '1.0';

export const ROUTING_POLICY_IDS = Object.freeze([
  'DEFAULT',
  'LOW_COST',
  'LOW_LATENCY',
  'HIGH_QUALITY',
  'VISION_REQUIRED',
  'VOICE_REQUIRED',
  'STRUCTURED_OUTPUT',
  'FUNCTION_CALLING',
  'OFFLINE_ONLY',
  'LOCAL_ONLY',
  'PREMIUM_ONLY',
  'ENTERPRISE_ONLY',
  'FALLBACK_ALLOWED',
  'SAFE_MODE',
]);

export const ROUTING_ORDER_STRATEGIES = Object.freeze([
  'PRIORITY',
  'COST',
  'LATENCY',
  'FALLBACK',
]);

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

export function createRoutingPolicySchema(decision = {}) {
  return deepFreeze({
    routingDecision: {
      policy: decision.policy ?? 'DEFAULT',
      allowedProviders: cloneValue(decision.allowedProviders ?? []),
      blockedProviders: cloneValue(decision.blockedProviders ?? []),
      priorityOrder: cloneValue(decision.priorityOrder ?? []),
      fallbackEnabled: decision.fallbackEnabled === true,
      requiresStructuredContext: decision.requiresStructuredContext === true,
      requiresStreaming: decision.requiresStreaming === true,
      requiresVision: decision.requiresVision === true,
      requiresVoice: decision.requiresVoice === true,
      metadata: cloneValue(decision.metadata ?? {}),
    },
    version: ROUTING_POLICIES_VERSION,
    metadata: {
      immutable: true,
      deterministic: true,
      rulesOnly: true,
      finalProviderSelected: false,
      externalCallsMade: false,
      credentialsKnown: false,
      modelKnown: false,
    },
  });
}

export { deepFreeze };

