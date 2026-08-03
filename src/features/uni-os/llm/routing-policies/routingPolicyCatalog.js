function policy(id, options = {}) {
  return Object.freeze({
    id,
    fallbackEnabled: options.fallbackEnabled === true,
    orderBy: options.orderBy ?? 'PRIORITY',
    requiredProviderType: options.requiredProviderType ?? null,
    requiredAccessTier: options.requiredAccessTier ?? null,
    requiresVision: options.requiresVision === true,
    requiresVoice: options.requiresVoice === true,
    requiresStructuredOutput: options.requiresStructuredOutput === true,
    requiresFunctionCalling: options.requiresFunctionCalling === true,
    healthyOnly: options.healthyOnly === true,
    metadata: Object.freeze({
      deterministic: true,
      rulesOnly: true,
      version: '1.0',
    }),
  });
}

export const ROUTING_POLICY_CATALOG = Object.freeze([
  policy('DEFAULT'),
  policy('LOW_COST', { orderBy: 'COST' }),
  policy('LOW_LATENCY', { orderBy: 'LATENCY' }),
  policy('HIGH_QUALITY', { orderBy: 'PRIORITY' }),
  policy('VISION_REQUIRED', { requiresVision: true }),
  policy('VOICE_REQUIRED', { requiresVoice: true }),
  policy('STRUCTURED_OUTPUT', { requiresStructuredOutput: true }),
  policy('FUNCTION_CALLING', { requiresFunctionCalling: true }),
  policy('OFFLINE_ONLY', { requiredProviderType: 'LOCAL' }),
  policy('LOCAL_ONLY', { requiredProviderType: 'LOCAL' }),
  policy('PREMIUM_ONLY', { requiredAccessTier: 'PREMIUM' }),
  policy('ENTERPRISE_ONLY', { requiredAccessTier: 'ENTERPRISE' }),
  policy('FALLBACK_ALLOWED', { fallbackEnabled: true, orderBy: 'FALLBACK' }),
  policy('SAFE_MODE', { healthyOnly: true }),
]);
