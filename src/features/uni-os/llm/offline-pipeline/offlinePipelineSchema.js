export const OFFLINE_PIPELINE_VERSION = '1.0';

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

function snapshot(value) {
  return value && typeof value === 'object' ? cloneValue(value) : null;
}

export function createOfflinePipelineInput(input = {}) {
  const source = input && !Array.isArray(input) && typeof input === 'object' ? input : {};
  return deepFreeze({
    compiledContext: snapshot(source.compiledContext) ?? {},
    requestedCapability: source.requestedCapability ?? null,
    routingPolicy: source.routingPolicy ?? 'DEFAULT',
    capabilityRegistry: snapshot(source.capabilityRegistry),
    providerRegistry: snapshot(source.providerRegistry),
    routingPolicies: snapshot(source.routingPolicies),
    latencyProfile: source.latencyProfile ?? 'NORMAL',
  });
}

export function createOfflinePipelineResult(input = {}) {
  const telemetry = snapshot(input.telemetry) ?? {};
  const validationStatus = input.validationReport?.validationReport?.status ?? 'UNKNOWN';
  const mockExecuted = input.mockResponse !== null && input.mockResponse !== undefined;
  return deepFreeze({
    offlinePipelineResult: {
      routing: snapshot(input.routing),
      conversationWindow: snapshot(input.conversationWindow),
      tokenBudget: snapshot(input.tokenBudget),
      structuredPrompt: snapshot(input.structuredPrompt),
      validationReport: snapshot(input.validationReport),
      mockResponse: mockExecuted ? snapshot(input.mockResponse) : null,
      statistics: telemetry,
      metadata: {
        version: OFFLINE_PIPELINE_VERSION,
        pipelineStatus: input.validationReport?.validationReport?.approved === true
          ? 'COMPLETED'
          : 'BLOCKED',
        validationStatus,
        mockExecuted,
      },
    },
    version: OFFLINE_PIPELINE_VERSION,
    metadata: {
      immutable: true,
      localOnly: true,
      shadowMode: true,
      resultDiscardedByShadowRunner: true,
      previousSnapshotsModified: false,
      realProviderUsed: false,
      mockAdapterOnly: true,
      modelExecuted: false,
      externalCallsMade: false,
      httpRequestsMade: false,
      tokensConsumed: 0,
      persisted: false,
      legacyFlowModified: false,
      executionAllowed: false,
    },
  });
}

export { cloneValue, deepFreeze };
