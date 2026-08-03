const LEVEL_RANK = Object.freeze({ LOW: 1, MEDIUM: 2, HIGH: 3 });

function normalizeAccessTier(metadata = {}) {
  const value = metadata.accessTier ?? metadata.subscriptionTier ?? metadata.plan;
  return typeof value === 'string' ? value.trim().toUpperCase() : null;
}

function hasAccess(policy, metadata) {
  if (!policy.requiredAccessTier) return true;
  const tier = normalizeAccessTier(metadata);
  if (policy.requiredAccessTier === 'PREMIUM') return ['PREMIUM', 'ENTERPRISE'].includes(tier);
  return tier === policy.requiredAccessTier;
}

function providerMatches(provider, capability, policy, requirements) {
  if (!['AVAILABLE', 'EXPERIMENTAL'].includes(provider.status)) return false;
  if (!provider.supportedCapabilities.includes(capability.id)) return false;
  if (policy.requiredProviderType && provider.type !== policy.requiredProviderType) return false;
  if (requirements.vision && !provider.supportsVision) return false;
  if (requirements.voice && !provider.supportsVoice) return false;
  if (requirements.streaming && !provider.supportsStreaming) return false;
  if (policy.requiresStructuredOutput && !provider.supportsStructuredOutput) return false;
  if (policy.requiresFunctionCalling && !provider.supportsFunctionCalling) return false;
  if (policy.healthyOnly
    && !(provider.status === 'AVAILABLE' && provider.healthStatus === 'HEALTHY')) return false;
  return true;
}

function orderProviders(providers, strategy) {
  return [...providers].sort((left, right) => {
    if (strategy === 'COST') {
      return LEVEL_RANK[left.estimatedCost] - LEVEL_RANK[right.estimatedCost]
        || left.priority - right.priority;
    }
    if (strategy === 'LATENCY') {
      return LEVEL_RANK[left.estimatedLatency] - LEVEL_RANK[right.estimatedLatency]
        || left.priority - right.priority;
    }
    if (strategy === 'FALLBACK') return left.fallbackPriority - right.fallbackPriority;
    return left.priority - right.priority;
  });
}

export function buildRoutingDecision({ capability, providerRegistry, policy, metadata = {} }) {
  const providers = providerRegistry.providers;
  const requirements = {
    vision: policy.requiresVision,
    voice: policy.requiresVoice,
    streaming: metadata.requiresStreaming === true,
  };
  const accessAllowed = hasAccess(policy, metadata);
  const allowed = accessAllowed
    ? providers.filter((provider) => providerMatches(provider, capability, policy, requirements))
    : [];
  const allowedIds = new Set(allowed.map((provider) => provider.id));
  const ordered = orderProviders(allowed, policy.orderBy);

  return {
    policy: policy.id,
    allowedProviders: allowed.map((provider) => provider.id),
    blockedProviders: providers.filter((provider) => !allowedIds.has(provider.id))
      .map((provider) => provider.id),
    priorityOrder: ordered.map((provider) => provider.id),
    fallbackEnabled: policy.fallbackEnabled,
    requiresStructuredContext: capability.requiresStructuredContext === true,
    requiresStreaming: requirements.streaming,
    requiresVision: requirements.vision,
    requiresVoice: requirements.voice,
    metadata: {
      capabilityId: capability.id,
      orderStrategy: policy.orderBy,
      accessRequirement: policy.requiredAccessTier,
      accessSatisfied: accessAllowed,
      structuredOutputRequired: policy.requiresStructuredOutput,
      functionCallingRequired: policy.requiresFunctionCalling,
      selectedProvider: null,
      finalSelectionPerformed: false,
    },
  };
}

