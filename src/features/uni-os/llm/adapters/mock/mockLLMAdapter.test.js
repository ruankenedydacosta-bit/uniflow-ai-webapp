import test from 'node:test';
import assert from 'node:assert/strict';
import { UNI_OS_ENABLED } from '../../../adapters/featureFlags.js';
import { LLM_ADAPTER_REQUIRED_METHODS } from '../../adapter-interface/adapterContracts.js';
import { validateAdapterContract } from '../../adapter-interface/adapterValidator.js';
import {
  MOCK_HEALTH_STATES,
  MOCK_LATENCY_PROFILES,
  MOCK_LLM_CAPABILITIES,
  createMockLLMAdapter,
  createMockResponseSchema,
  runMockLLMAdapterShadow,
  validateMockResponseSchema,
} from './index.js';

function input(capability = 'GENERAL_REASONING', latencyProfile = 'FAST') {
  return {
    capability,
    compiledContext: { metadata: { version: '1.0' } },
    routingResult: { requestedCapability: capability, selectedProvider: 'UNI_OS_MOCK' },
    request: { format: 'STRUCTURED_MOCK' },
    latencyProfile,
  };
}

test('mock adapter implements the complete LLM adapter contract', () => {
  const adapter = createMockLLMAdapter();
  LLM_ADAPTER_REQUIRED_METHODS.forEach((method) => assert.equal(typeof adapter[method], 'function'));
  assert.equal(validateAdapterContract(adapter).valid, true);
  assert.equal(Object.isFrozen(adapter), true);
});

test('initialize and dispose control local lifecycle without external work', async () => {
  const adapter = createMockLLMAdapter();
  assert.equal((await adapter.healthCheck()).initialized, false);
  assert.deepEqual(await adapter.initialize(), { initialized: true, provider: 'UNI_OS_MOCK' });
  assert.equal((await adapter.healthCheck()).available, true);
  assert.deepEqual(await adapter.dispose(), { disposed: true, provider: 'UNI_OS_MOCK' });
  assert.equal((await adapter.healthCheck()).available, false);
});

test('supports all requested mock capabilities and rejects unsupported capability', () => {
  const adapter = createMockLLMAdapter();
  MOCK_LLM_CAPABILITIES.forEach((capability) => assert.equal(adapter.supportsCapability(capability), true));
  assert.equal(adapter.supportsCapability('LONG_TERM_PLANNING'), false);
  assert.equal(adapter.supportsCapability('UNKNOWN'), false);
});

test('all capabilities return a consistent validated mock response', async () => {
  const adapter = createMockLLMAdapter();
  await adapter.initialize();
  for (const capability of MOCK_LLM_CAPABILITIES) {
    const request = adapter.buildRequest(input(capability));
    const response = await adapter.invoke(request);
    assert.equal(response.capability, capability);
    assert.equal(response.status, 'SUCCESS');
    assert.equal(response.response.simulated, true);
    assert.equal(adapter.validateResponse(response).valid, true);
    assert.equal(response.metadata.tokensConsumed, 0);
  }
  await adapter.dispose();
});

test('buildRequest clones and freezes inputs without mutation', () => {
  const adapter = createMockLLMAdapter();
  const source = input();
  const request = adapter.buildRequest(source);
  source.compiledContext.metadata.version = 'changed';
  assert.equal(request.compiledContext.metadata.version, '1.0');
  assert.equal(Object.isFrozen(request), true);
  assert.equal(Object.isFrozen(request.compiledContext.metadata), true);
  assert.equal(request.metadata.externalRequest, false);
});

test('unsupported capability fails with a controlled error', () => {
  const adapter = createMockLLMAdapter();
  assert.throws(
    () => adapter.buildRequest(input('LONG_TERM_PLANNING')),
    (error) => error.name === 'MockLLMAdapterError' && error.code === 'UNSUPPORTED_CAPABILITY',
  );
});

test('invoke requires initialization', async () => {
  const adapter = createMockLLMAdapter();
  const request = adapter.buildRequest(input());
  await assert.rejects(
    () => adapter.invoke(request),
    (error) => error.code === 'ADAPTER_NOT_INITIALIZED',
  );
});

test('health states are normalized and do not perform an external check', async () => {
  for (const healthStatus of MOCK_HEALTH_STATES) {
    const adapter = createMockLLMAdapter({ healthStatus });
    await adapter.initialize();
    const health = await adapter.healthCheck();
    assert.equal(health.healthStatus, healthStatus);
    assert.equal(health.externalCheckPerformed, false);
  }
});

test('offline health produces a controlled invocation failure', async () => {
  const adapter = createMockLLMAdapter({ healthStatus: 'OFFLINE' });
  await adapter.initialize();
  await assert.rejects(
    () => adapter.invoke(adapter.buildRequest(input())),
    (error) => error.code === 'MOCK_PROVIDER_OFFLINE',
  );
});

test('latency profiles expose deterministic estimates', () => {
  const adapter = createMockLLMAdapter();
  Object.values(MOCK_LATENCY_PROFILES).forEach((profile) => {
    assert.equal(adapter.estimateLatency({ latencyProfile: profile.id }), profile.estimatedMs);
  });
  assert.equal(adapter.estimateCost(input()), 0);
});

test('timeout is represented without a long timer or model invocation', async () => {
  const adapter = createMockLLMAdapter();
  await adapter.initialize();
  const startedAt = Date.now();
  const response = await adapter.invoke(adapter.buildRequest(input('FORECAST', 'TIMEOUT')));
  assert.equal(response.status, 'TIMEOUT');
  assert.equal(response.response.kind, 'MOCK_TIMEOUT');
  assert.equal(response.metadata.modelExecuted, false);
  assert.equal(response.estimatedTokens, 0);
  assert.ok(Date.now() - startedAt < 100);
});

test('response schema is deeply frozen', async () => {
  const adapter = createMockLLMAdapter();
  await adapter.initialize();
  const response = await adapter.invoke(adapter.buildRequest(input()));
  assert.equal(Object.isFrozen(response), true);
  assert.equal(Object.isFrozen(response.response), true);
  assert.equal(Object.isFrozen(response.response.result), true);
  assert.equal(Object.isFrozen(response.metadata), true);
});

test('response validation rejects provider and integrity changes', () => {
  const invalid = Object.freeze({
    ...createMockResponseSchema({
      capability: 'GENERAL_REASONING',
      status: 'SUCCESS',
      response: {},
      estimatedTokens: 1,
      estimatedCost: 0,
      estimatedLatency: 1,
    }),
    provider: 'REAL_PROVIDER',
  });
  const validation = validateMockResponseSchema(invalid);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.includes('INVALID_MOCK_PROVIDER'));
});

test('response validation rejects empty and mutable objects safely', () => {
  assert.equal(validateMockResponseSchema().valid, false);
  const validation = validateMockResponseSchema({
    provider: 'UNI_OS_MOCK', capability: 'GENERAL_REASONING', status: 'SUCCESS', response: {},
    estimatedTokens: 1, estimatedCost: 0, estimatedLatency: 1, metadata: {},
  });
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.includes('MOCK_RESPONSE_NOT_IMMUTABLE'));
});

test('response validation rejects frozen roots with mutable descendants', () => {
  const response = Object.freeze({ result: { value: null } });
  const snapshot = Object.freeze({
    provider: 'UNI_OS_MOCK',
    capability: 'GENERAL_REASONING',
    status: 'SUCCESS',
    response,
    estimatedTokens: 1,
    estimatedCost: 0,
    estimatedLatency: 1,
    metadata: Object.freeze({
      simulated: true,
      externalRequest: false,
      modelExecuted: false,
      tokensConsumed: 0,
    }),
  });
  const validation = validateMockResponseSchema(snapshot);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.includes('MOCK_RESPONSE_NOT_IMMUTABLE'));
});

test('feature flag remains disabled and shadow mode performs no work by default', async () => {
  let observed = false;
  assert.equal(UNI_OS_ENABLED, false);
  const result = await runMockLLMAdapterShadow(input(), { observer: () => { observed = true; } });
  assert.deepEqual(result, { status: 'DISABLED', response: null });
  assert.equal(observed, false);
});

test('enabled shadow mode observes once and discards the response', async () => {
  let observedResponse;
  const result = await runMockLLMAdapterShadow(input('CLASSIFICATION'), {
    enabled: true,
    observer: (response) => { observedResponse = response; },
  });
  assert.equal(observedResponse.capability, 'CLASSIFICATION');
  assert.deepEqual(result, { status: 'OBSERVED', response: null });
});

test('shadow mode disposes the adapter after observation', async () => {
  const adapter = createMockLLMAdapter();
  await runMockLLMAdapterShadow(input(), { enabled: true, adapter });
  assert.equal((await adapter.healthCheck()).initialized, false);
});

test('shadow mode fails safely for invalid input', async () => {
  const result = await runMockLLMAdapterShadow({}, { enabled: true });
  assert.deepEqual(result, { status: 'FAILED_SAFE', response: null });
});

test('development logging contains only technical mock metadata', async () => {
  const entries = [];
  await runMockLLMAdapterShadow(input('VOICE'), {
    enabled: true,
    isDevelopment: true,
    logger: { info: (message, data) => entries.push({ message, data }) },
  });
  assert.deepEqual(entries.map((entry) => entry.message), [
    '[UNI OS] Mock Adapter Initialized',
    '[UNI OS] Capability Requested',
    '[UNI OS] Mock Response Generated',
  ]);
  assert.equal(JSON.stringify(entries).includes('compiledContext'), false);
  assert.equal(JSON.stringify(entries).includes('request'), false);
});
