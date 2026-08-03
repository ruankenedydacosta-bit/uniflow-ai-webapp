import assert from 'node:assert/strict';
import test from 'node:test';
import { UNI_OS_ENABLED } from '../featureFlags.js';
import {
  adaptCognitiveInput,
  classifyFutureCapability,
  COGNITIVE_CAPABILITIES,
  createCognitiveGatewaySnapshot,
  routeCognitiveRequest,
  runCognitiveGatewayShadow,
  UNI_OS_COGNITIVE_GATEWAY_SCHEMA_VERSION,
} from './index.js';

const NOW = '2026-07-13T01:00:00.000Z';
const OPTIONS = Object.freeze({ now: () => NOW, idFactory: () => 'gateway-001' });

function gatewayInput(overrides = {}) {
  return {
    parsedIntent: { intent: 'check_balance', confidence: 0.95 },
    contextSnapshot: { metadata: { version: '1.0' } },
    memorySnapshot: { metadata: { version: '1.0' } },
    planningSnapshot: { metadata: { version: '1.0' }, executionAllowed: false },
    reflectionSnapshot: { metadata: { version: '1.0' }, executionAllowed: false },
    securitySnapshot: { metadata: { version: '1.0' }, executionAllowed: false },
    permissionsSnapshot: { metadata: { version: '1.0' }, executionAllowed: false },
    ...overrides,
  };
}

test('schema cria contrato completo com identidade e versão', () => {
  const result = adaptCognitiveInput(gatewayInput(), OPTIONS);
  assert.equal(result.gatewayId, 'gateway-001');
  assert.equal(result.timestamp, NOW);
  assert.equal(result.metadata.version, UNI_OS_COGNITIVE_GATEWAY_SCHEMA_VERSION);
  assert.equal(result.metadata.externalCallMade, false);
});

test('schema aplica deep clone e deep freeze sem congelar snapshots', () => {
  const context = { workspace: { id: 'workspace-1' } };
  const result = createCognitiveGatewaySnapshot({ structuredInput: { context } });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.structuredInput.context.workspace), true);
  assert.notEqual(result.structuredInput.context, context);
  assert.equal(Object.isFrozen(context), false);
  assert.equal(Object.isFrozen(context.workspace), false);
});

test('router classifica raciocínio financeiro sem ativar modelo', () => {
  assert.equal(classifyFutureCapability({ intent: 'register_expense' }), 'FINANCIAL_REASONING');
  const route = routeCognitiveRequest({ intent: 'register_expense' });
  assert.equal(route.requestedCapability, 'FINANCIAL_REASONING');
  assert.equal(route.route, 'NOT_IMPLEMENTED');
  assert.equal(route.shouldInvokeModel, false);
});

test('router representa todas as capacidades futuras', () => {
  const cases = [
    ['question', 'GENERAL_REASONING'],
    ['check_balance', 'FINANCIAL_REASONING'],
    ['planning', 'PLANNING'],
    ['summarize', 'SUMMARIZATION'],
    ['classification', 'CLASSIFICATION'],
    ['casual', 'CONVERSATION'],
  ];
  cases.forEach(([intent, expected]) => {
    assert.equal(classifyFutureCapability({ intent }), expected);
    assert.ok(COGNITIVE_CAPABILITIES.includes(expected));
  });
});

test('capabilities são catálogo imutável e não providers', () => {
  assert.equal(Object.isFrozen(COGNITIVE_CAPABILITIES), true);
  assert.equal(COGNITIVE_CAPABILITIES.includes('OPENAI'), false);
});

test('NOT_IMPLEMENTED é invariante mesmo com entrada maliciosa', () => {
  const result = createCognitiveGatewaySnapshot({
    provider: 'external',
    route: 'CALL_MODEL',
    shouldInvokeModel: true,
    modelCapability: 'FINANCIAL_REASONING',
    promptTemplate: 'unsafe',
  });
  assert.equal(result.provider, null);
  assert.equal(result.route, 'NOT_IMPLEMENTED');
  assert.equal(result.shouldInvokeModel, false);
  assert.equal(result.modelCapability, null);
  assert.equal(result.promptTemplate, null);
});

test('structuredInput consolida todos os snapshots esperados', () => {
  const result = adaptCognitiveInput(gatewayInput(), OPTIONS);
  assert.equal(result.structuredInput.intent.intent, 'check_balance');
  assert.equal(result.structuredInput.context.metadata.version, '1.0');
  assert.equal(result.structuredInput.memory.metadata.version, '1.0');
  assert.equal(result.structuredInput.planning.executionAllowed, false);
  assert.equal(result.structuredInput.reflection.executionAllowed, false);
  assert.equal(result.structuredInput.security.executionAllowed, false);
  assert.equal(result.structuredInput.permissions.executionAllowed, false);
});

test('adapter não modifica nenhum snapshot de entrada', () => {
  const input = gatewayInput();
  const before = structuredClone(input);
  adaptCognitiveInput(input, OPTIONS);
  assert.deepEqual(input, before);
});

test('objetos vazios produzem estrutura segura e não implementada', () => {
  const result = adaptCognitiveInput({}, OPTIONS);
  assert.equal(result.route, 'NOT_IMPLEMENTED');
  assert.equal(result.metadata.requestedCapability, 'GENERAL_REASONING');
  Object.values(result.structuredInput).forEach((snapshot) => assert.deepEqual(snapshot, {}));
});

test('feature flag compartilhada permanece desligada', async () => {
  let observed = false;
  const result = await runCognitiveGatewayShadow({}, { observer: () => { observed = true; } });
  assert.equal(UNI_OS_ENABLED, false);
  assert.equal(result.status, 'DISABLED');
  assert.equal(observed, false);
});

test('modo sombra observa gateway e descarta resultado', async () => {
  let observed = null;
  const result = await runCognitiveGatewayShadow(gatewayInput(), {
    enabled: true,
    adapterOptions: OPTIONS,
    observer: async (gateway) => { observed = gateway; },
  });
  assert.equal(observed.gatewayId, 'gateway-001');
  assert.equal(observed.route, 'NOT_IMPLEMENTED');
  assert.equal(result.status, 'OBSERVED');
  assert.equal(result.gateway, null);
});

test('falhas do modo sombra são controladas', async () => {
  const result = await runCognitiveGatewayShadow({}, {
    enabled: true,
    observer: async () => { throw new Error('internal'); },
  });
  assert.equal(result.status, 'FAILED_SAFE');
  assert.equal(result.gateway, null);
});

test('logs DEV incluem somente gateway, capability, route e flag', async () => {
  const logs = [];
  await runCognitiveGatewayShadow(gatewayInput({
    parsedIntent: { intent: 'question', originalText: 'dado privado 80' },
  }), {
    enabled: true,
    isDevelopment: true,
    adapterOptions: OPTIONS,
    logger: { info: (...args) => logs.push(args), warn: (...args) => logs.push(args) },
  });
  const serialized = JSON.stringify(logs);
  assert.match(serialized, /\[UNI OS\] Cognitive Gateway/);
  assert.doesNotMatch(serialized, /privado|originalText|80/i);
});

test('nenhuma função do gateway chama fetch ou provider externo', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error('external call'); };
  try {
    await runCognitiveGatewayShadow(gatewayInput(), { enabled: true, adapterOptions: OPTIONS });
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
