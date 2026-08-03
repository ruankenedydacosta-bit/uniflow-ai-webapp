import { UNI_OS_ENABLED } from '../../../adapters/featureFlags.js';
import { createLLMAdapterInterface } from '../../adapter-interface/llmAdapterInterface.js';
import { validateAdapterContract } from '../../adapter-interface/adapterValidator.js';
import { MOCK_LLM_CAPABILITIES, supportsMockCapability } from './mockCapabilities.js';
import { createMockHealthSnapshot, normalizeMockHealth } from './mockHealth.js';
import { applyMockLatency, resolveMockLatency } from './mockLatency.js';
import { createMockCapabilityResponse } from './mockResponses.js';
import {
  createMockRequestSchema,
  createMockResponseSchema,
  validateMockResponseSchema,
} from './mockSchema.js';

const interfaceSnapshot = createLLMAdapterInterface({
  name: 'UNI_OS_MOCK_LLM_ADAPTER',
  version: '1.0',
  supportedCapabilities: MOCK_LLM_CAPABILITIES,
  supportsStreaming: false,
  supportsVision: true,
  supportsVoice: true,
  supportsStructuredOutput: true,
  supportsFunctionCalling: false,
  metadata: { mock: true, externalIntegration: false },
});

function controlledError(code) {
  const error = new Error('Mock LLM adapter could not complete the simulated operation.');
  error.name = 'MockLLMAdapterError';
  error.code = code;
  return error;
}

export function createMockLLMAdapter(options = {}) {
  let initialized = false;
  let healthStatus = normalizeMockHealth(options.healthStatus);

  const adapter = {
    ...interfaceSnapshot,
    async initialize() {
      initialized = true;
      return Object.freeze({ initialized: true, provider: 'UNI_OS_MOCK' });
    },
    async dispose() {
      initialized = false;
      return Object.freeze({ disposed: true, provider: 'UNI_OS_MOCK' });
    },
    async healthCheck() {
      return createMockHealthSnapshot(healthStatus, initialized);
    },
    supportsCapability(capability) {
      return supportsMockCapability(capability);
    },
    estimateCost() {
      return 0;
    },
    estimateLatency(request = {}) {
      return resolveMockLatency(request.latencyProfile).estimatedMs;
    },
    buildRequest(input = {}) {
      const capability = input.capability ?? input.routingResult?.requestedCapability;
      if (!supportsMockCapability(capability)) throw controlledError('UNSUPPORTED_CAPABILITY');
      return createMockRequestSchema({ ...input, capability });
    },
    async invoke(request = {}) {
      if (!initialized) throw controlledError('ADAPTER_NOT_INITIALIZED');
      if (!supportsMockCapability(request.capability)) throw controlledError('UNSUPPORTED_CAPABILITY');
      if (healthStatus === 'OFFLINE') throw controlledError('MOCK_PROVIDER_OFFLINE');

      const latency = await applyMockLatency(request.latencyProfile);
      const timedOut = latency.timeout === true;
      return createMockResponseSchema({
        capability: request.capability,
        status: timedOut ? 'TIMEOUT' : 'SUCCESS',
        response: timedOut
          ? { kind: 'MOCK_TIMEOUT', simulated: true, result: null }
          : createMockCapabilityResponse(request.capability),
        estimatedTokens: timedOut ? 0 : 64,
        estimatedCost: 0,
        estimatedLatency: latency.estimatedMs,
        metadata: { healthStatus, latencyProfile: latency.id },
      });
    },
    validateResponse(response) {
      return validateMockResponseSchema(response);
    },
  };

  const frozenAdapter = Object.freeze(adapter);
  const contract = validateAdapterContract(frozenAdapter);
  if (!contract.valid) throw controlledError('INVALID_ADAPTER_CONTRACT');
  return frozenAdapter;
}

export async function runMockLLMAdapterShadow(input = {}, options = {}) {
  const enabled = options.enabled ?? UNI_OS_ENABLED;
  if (!enabled) return Object.freeze({ status: 'DISABLED', response: null });

  const adapter = options.adapter ?? createMockLLMAdapter(options);
  try {
    await adapter.initialize();
    const logger = options.logger ?? console;
    if (options.isDevelopment === true) {
      logger.info?.('[UNI OS] Mock Adapter Initialized', {
        healthStatus: (await adapter.healthCheck()).healthStatus,
      });
      logger.info?.('[UNI OS] Capability Requested', {
        capability: input.capability ?? input.routingResult?.requestedCapability ?? null,
      });
    }
    const request = adapter.buildRequest(input);
    const response = await adapter.invoke(request);
    if (typeof options.observer === 'function') await options.observer(response);
    if (options.isDevelopment === true) {
      logger.info?.('[UNI OS] Mock Response Generated', {
        capability: response.capability,
        estimatedCost: response.estimatedCost,
        estimatedLatency: response.estimatedLatency,
        healthStatus: response.metadata.healthStatus,
      });
    }
    return Object.freeze({ status: 'OBSERVED', response: null });
  } catch {
    return Object.freeze({ status: 'FAILED_SAFE', response: null });
  } finally {
    await adapter.dispose();
  }
}
