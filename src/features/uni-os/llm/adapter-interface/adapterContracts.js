export const LLM_ADAPTER_REQUIRED_METHODS = Object.freeze([
  'initialize',
  'dispose',
  'healthCheck',
  'supportsCapability',
  'estimateCost',
  'estimateLatency',
  'buildRequest',
  'invoke',
  'validateResponse',
]);

export const LLM_ADAPTER_METHOD_CONTRACTS = Object.freeze(
  LLM_ADAPTER_REQUIRED_METHODS.map((name) => Object.freeze({
    name,
    required: true,
    invokedByInterface: false,
  })),
);

export function getMissingAdapterMethods(adapter) {
  return Object.freeze(
    LLM_ADAPTER_REQUIRED_METHODS.filter((method) => typeof adapter?.[method] !== 'function'),
  );
}

