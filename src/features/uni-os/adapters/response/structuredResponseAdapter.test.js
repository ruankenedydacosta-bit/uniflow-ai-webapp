import assert from 'node:assert/strict';
import test from 'node:test';
import { UNI_OS_ENABLED } from '../featureFlags.js';
import {
  adaptStructuredResponse,
  buildStructuredResponseSections,
  createStructuredResponseSnapshot,
  runStructuredResponseShadow,
  UNI_OS_STRUCTURED_RESPONSE_SCHEMA_VERSION,
} from './index.js';

const NOW = '2026-07-13T02:00:00.000Z';
const OPTIONS = Object.freeze({ now: () => NOW, idFactory: () => 'response-001' });

function completeInput(overrides = {}) {
  return {
    parsedIntent: { intent: 'check_balance', confidence: 0.95 },
    contextSnapshot: { metadata: { version: '1.0' } },
    memorySnapshot: { metadata: { version: '1.0' } },
    planningSnapshot: { metadata: { version: '1.0' }, executionAllowed: false },
    reflectionSnapshot: { metadata: { version: '1.0' }, executionAllowed: false },
    securitySnapshot: { metadata: { version: '1.0' }, executionAllowed: false },
    permissionsSnapshot: { metadata: { version: '1.0' }, executionAllowed: false },
    cognitiveSnapshot: {
      metadata: { version: '1.0', externalCallMade: false },
      route: 'NOT_IMPLEMENTED',
    },
    ...overrides,
  };
}

test('schema cria contrato completo com identidade e versão', () => {
  const result = adaptStructuredResponse(completeInput(), OPTIONS);
  assert.equal(result.responseId, 'response-001');
  assert.equal(result.timestamp, NOW);
  assert.equal(result.version, UNI_OS_STRUCTURED_RESPONSE_SCHEMA_VERSION);
  assert.equal(result.metadata.schemaVersion, UNI_OS_STRUCTURED_RESPONSE_SCHEMA_VERSION);
});

test('schema aplica deep clone e deep freeze sem congelar snapshots', () => {
  const context = { workspace: { id: 'workspace-1' } };
  const result = createStructuredResponseSnapshot({ facts: { context } });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.facts.context.workspace), true);
  assert.notEqual(result.facts.context, context);
  assert.equal(Object.isFrozen(context), false);
  assert.equal(Object.isFrozen(context.workspace), false);
});

test('builder consolida cada entrada na seção correta', () => {
  const input = completeInput();
  const sections = buildStructuredResponseSections(input);
  assert.equal(sections.facts.parsedIntent, input.parsedIntent);
  assert.equal(sections.facts.context, input.contextSnapshot);
  assert.equal(sections.facts.memory, input.memorySnapshot);
  assert.equal(sections.planning, input.planningSnapshot);
  assert.equal(sections.reflection, input.reflectionSnapshot);
  assert.equal(sections.security, input.securitySnapshot);
  assert.equal(sections.permissions, input.permissionsSnapshot);
  assert.equal(sections.cognition, input.cognitiveSnapshot);
});

test('snapshots completos são preservados como fatos clonados', () => {
  const input = completeInput();
  const result = adaptStructuredResponse(input, OPTIONS);
  assert.deepEqual(result.facts.parsedIntent, input.parsedIntent);
  assert.deepEqual(result.facts.context, input.contextSnapshot);
  assert.deepEqual(result.facts.memory, input.memorySnapshot);
  assert.deepEqual(result.planning, input.planningSnapshot);
  assert.deepEqual(result.reflection, input.reflectionSnapshot);
  assert.deepEqual(result.security, input.securitySnapshot);
  assert.deepEqual(result.permissions, input.permissionsSnapshot);
  assert.deepEqual(result.cognition, input.cognitiveSnapshot);
});

test('objetos vazios geram todas as seções com defaults seguros', () => {
  const result = adaptStructuredResponse({}, OPTIONS);
  assert.deepEqual(result.facts, { parsedIntent: {}, context: {}, memory: {} });
  assert.deepEqual(result.planning, {});
  assert.deepEqual(result.reflection, {});
  assert.deepEqual(result.security, {});
  assert.deepEqual(result.permissions, {});
  assert.deepEqual(result.cognition, {});
});

test('communication permanece nula e nunca gera texto ou voz', () => {
  const result = createStructuredResponseSnapshot({
    communication: { emotion: 'calm', personality: 'warm', outputType: 'voice' },
    output: { text: 'não permitido', voice: true },
  });
  assert.deepEqual(result.communication, {
    emotion: null, personality: null, outputType: null,
  });
  assert.equal('output' in result, false);
  assert.equal('text' in result.communication, false);
});

test('executionAllowed permanece false mesmo com entrada maliciosa', () => {
  const result = createStructuredResponseSnapshot({ executionAllowed: true });
  assert.equal(result.executionAllowed, false);
});

test('adapter não modifica qualquer snapshot recebido', () => {
  const input = completeInput();
  const before = structuredClone(input);
  adaptStructuredResponse(input, OPTIONS);
  assert.deepEqual(input, before);
});

test('metadata identifica geração em modo sombra', () => {
  const shadow = adaptStructuredResponse({}, OPTIONS);
  const explicitNonShadow = adaptStructuredResponse({}, { ...OPTIONS, generatedInShadowMode: false });
  assert.equal(shadow.metadata.generatedInShadowMode, true);
  assert.equal(explicitNonShadow.metadata.generatedInShadowMode, false);
});

test('feature flag compartilhada permanece desligada', async () => {
  let observed = false;
  const result = await runStructuredResponseShadow({}, { observer: () => { observed = true; } });
  assert.equal(UNI_OS_ENABLED, false);
  assert.equal(result.status, 'DISABLED');
  assert.equal(observed, false);
});

test('modo sombra observa resposta e descarta resultado', async () => {
  let observed = null;
  const result = await runStructuredResponseShadow(completeInput(), {
    enabled: true,
    adapterOptions: OPTIONS,
    observer: async (response) => { observed = response; },
  });
  assert.equal(observed.responseId, 'response-001');
  assert.equal(observed.executionAllowed, false);
  assert.equal(result.status, 'OBSERVED');
  assert.equal(result.response, null);
});

test('falhas do modo sombra são controladas', async () => {
  const result = await runStructuredResponseShadow({}, {
    enabled: true,
    observer: async () => { throw new Error('internal'); },
  });
  assert.equal(result.status, 'FAILED_SAFE');
  assert.equal(result.response, null);
});

test('logs DEV contêm somente seções, versão, shadow e execução', async () => {
  const logs = [];
  await runStructuredResponseShadow(completeInput({
    parsedIntent: { intent: 'question', originalText: 'dado privado 80' },
  }), {
    enabled: true,
    isDevelopment: true,
    adapterOptions: OPTIONS,
    logger: { info: (...args) => logs.push(args), warn: (...args) => logs.push(args) },
  });
  const serialized = JSON.stringify(logs);
  assert.match(serialized, /\[UNI OS\] Structured Response/);
  assert.doesNotMatch(serialized, /privado|originalText|80/i);
});

test('adapter não chama fetch, serviços ou APIs', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error('external call'); };
  try {
    await runStructuredResponseShadow(completeInput(), { enabled: true, adapterOptions: OPTIONS });
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
