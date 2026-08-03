import { deepFreeze } from '../../adapter-interface/adapterSchema.js';
import { supportsMockCapability } from './mockCapabilities.js';

export const MOCK_LLM_PROVIDER = 'UNI_OS_MOCK';
export const MOCK_LLM_RESPONSE_STATUSES = Object.freeze(['SUCCESS', 'TIMEOUT']);

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, cloneValue(nested)]));
}

function isDeepFrozen(value) {
  if (!value || typeof value !== 'object') return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}

export function createMockRequestSchema(input = {}) {
  return deepFreeze({
    provider: MOCK_LLM_PROVIDER,
    capability: input.capability,
    compiledContext: cloneValue(input.compiledContext ?? {}),
    routingResult: cloneValue(input.routingResult ?? {}),
    request: cloneValue(input.request ?? {}),
    latencyProfile: input.latencyProfile ?? 'NORMAL',
    metadata: { simulated: true, externalRequest: false },
  });
}

export function createMockResponseSchema(input = {}) {
  return deepFreeze({
    provider: MOCK_LLM_PROVIDER,
    capability: input.capability,
    status: input.status,
    response: cloneValue(input.response),
    estimatedTokens: input.estimatedTokens,
    estimatedCost: input.estimatedCost,
    estimatedLatency: input.estimatedLatency,
    metadata: {
      version: '1.0',
      simulated: true,
      externalRequest: false,
      modelExecuted: false,
      tokensConsumed: 0,
      ...(cloneValue(input.metadata ?? {})),
    },
  });
}

export function validateMockResponseSchema(snapshot) {
  const errors = [];
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return Object.freeze({ valid: false, errors: Object.freeze(['MOCK_RESPONSE_REQUIRED']) });
  }
  if (snapshot.provider !== MOCK_LLM_PROVIDER) errors.push('INVALID_MOCK_PROVIDER');
  if (!supportsMockCapability(snapshot.capability)) errors.push('INVALID_MOCK_CAPABILITY');
  if (!MOCK_LLM_RESPONSE_STATUSES.includes(snapshot.status)) errors.push('INVALID_MOCK_STATUS');
  if (!snapshot.response || typeof snapshot.response !== 'object') errors.push('MOCK_RESPONSE_BODY_REQUIRED');
  if (!Number.isFinite(snapshot.estimatedTokens) || snapshot.estimatedTokens < 0) {
    errors.push('INVALID_ESTIMATED_TOKENS');
  }
  if (!Number.isFinite(snapshot.estimatedCost) || snapshot.estimatedCost < 0) {
    errors.push('INVALID_ESTIMATED_COST');
  }
  if (!Number.isFinite(snapshot.estimatedLatency) || snapshot.estimatedLatency < 0) {
    errors.push('INVALID_ESTIMATED_LATENCY');
  }
  if (snapshot.metadata?.simulated !== true
    || snapshot.metadata?.externalRequest !== false
    || snapshot.metadata?.modelExecuted !== false
    || snapshot.metadata?.tokensConsumed !== 0) {
    errors.push('INVALID_MOCK_INTEGRITY');
  }
  if (!isDeepFrozen(snapshot)) {
    errors.push('MOCK_RESPONSE_NOT_IMMUTABLE');
  }
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}
