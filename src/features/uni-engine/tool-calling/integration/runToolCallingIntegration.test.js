// Uni Engine — Fase 20.1/20.3: Tool Calling — testes da integração.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  runToolCallingIntegration,
  registerToolCallingFixtures,
  createToolCallingFixtureContext,
} from './index.js';
import { createToolCallingRegistry } from '../registry/index.js';

const APPROVED_AUTH = { authorized: true, executionAllowed: true };
const ENABLED_CONFIG = { toolCallingEnabled: true, toolCallingShadowMode: true };

test('integration - desligada não executa nada e cai em fallback', async () => {
  const { dispatcher, registry, idempotency } = createToolCallingFixtureContext();
  const result = await runToolCallingIntegration({
    rawToolCalls: [{ id: 'call-1', function: { name: 'fixture.lookup', arguments: '{}' } }],
    dispatcher,
    registry,
    config: { toolCallingEnabled: false },
    authorization: APPROVED_AUTH,
    context: { turnId: 'turn-1', messageId: 'msg-1' },
  });
  assert.equal(result.enabled, false);
  assert.equal(result.reason, 'TOOL_CALLING_DISABLED');
  assert.equal(result.executed, false);
  assert.equal(result.count, 0);
  assert.equal(idempotency.size?.(), 0);
});

test('integration - sem identidade de turno não executa', async () => {
  const { dispatcher, registry } = createToolCallingFixtureContext();
  const result = await runToolCallingIntegration({
    rawToolCalls: [{ id: 'call-1', function: { name: 'fixture.lookup', arguments: '{}' } }],
    dispatcher,
    registry,
    config: ENABLED_CONFIG,
    authorization: APPROVED_AUTH,
    context: {},
  });
  assert.equal(result.reason, 'TURN_IDENTITY_MISSING');
  assert.equal(result.executed, false);
});

test('integration - executa tool call aprovada via adaptador/dispatcher', async () => {
  const { dispatcher, registry } = createToolCallingFixtureContext();
  const result = await runToolCallingIntegration({
    rawToolCalls: [{ id: 'call-1', function: { name: 'fixture.echo', arguments: '{"value":9}' } }],
    dispatcher,
    registry,
    config: ENABLED_CONFIG,
    authorization: APPROVED_AUTH,
    context: { turnId: 'turn-1', messageId: 'msg-1' },
  });
  assert.equal(result.reason, 'TOOL_CALLS_PROCESSED');
  assert.equal(result.executed, true);
  assert.equal(result.count, 1);
  assert.equal(result.results[0].toolName, 'fixture.echo');
  assert.equal(result.results[0].status, 'completed');
  assert.equal(result.results[0].executed, true);
  assert.equal(result.results[0].serializable, true);
});

// Fase 20.3: a deduplicação por mensagem não é mais estado global de módulo
// (a Fase 20.1 tinha `let lastToolCallingMessageId` compartilhado entre
// workspaces/conversas — uma violação do isolamento da Fase 19.1). Agora é
// opt-in via `messageDedupeStore`, de propriedade do chamador — exatamente
// como o UniChatPage já faz com seu próprio ref por instância.
test('integration - execução única por mensagem (via messageDedupeStore do chamador)', async () => {
  const { dispatcher, registry, idempotency } = createToolCallingFixtureContext();
  const messageDedupeStore = new Set();
  const options = {
    rawToolCalls: [{ id: 'call-1', function: { name: 'fixture.lookup', arguments: '{"key":"a"}' } }],
    dispatcher,
    registry,
    config: ENABLED_CONFIG,
    authorization: APPROVED_AUTH,
    context: { turnId: 'turn-1', messageId: 'msg-dup' },
    messageDedupeStore,
  };
  const first = await runToolCallingIntegration(options);
  const second = await runToolCallingIntegration(options);
  assert.equal(first.executed, true);
  assert.equal(second.reason, 'MESSAGE_ALREADY_ANALYZED');
  assert.equal(second.executed, false);
  assert.equal(idempotency.size?.(), 1);
});

test('integration - sem messageDedupeStore, chamadas repetidas não são bloqueadas por estado global', async () => {
  const { dispatcher, registry } = createToolCallingFixtureContext();
  const options = {
    rawToolCalls: [{ id: 'call-1', function: { name: 'fixture.lookup', arguments: '{"key":"a"}' } }],
    dispatcher,
    registry,
    config: ENABLED_CONFIG,
    authorization: APPROVED_AUTH,
    context: { turnId: 'turn-1', messageId: 'msg-dup-2' },
  };
  const first = await runToolCallingIntegration(options);
  const second = await runToolCallingIntegration(options);
  assert.equal(first.executed, true);
  assert.equal(second.reason, 'TOOL_CALLS_PROCESSED');
  assert.equal(second.executed, true);
});

test('integration - autorização ausente não executa (gate do dispatcher)', async () => {
  const { dispatcher, registry } = createToolCallingFixtureContext();
  const result = await runToolCallingIntegration({
    rawToolCalls: [{ id: 'call-1', function: { name: 'fixture.lookup', arguments: '{}' } }],
    dispatcher,
    registry,
    config: ENABLED_CONFIG,
    authorization: {},
    context: { turnId: 'turn-1', messageId: 'msg-2' },
  });
  assert.equal(result.results[0].status, 'unauthorized');
  assert.equal(result.results[0].executed, false);
  assert.equal(result.executed, false);
});

test('integration - ferramenta desabilitada result em disabled', async () => {
  const { dispatcher, registry } = createToolCallingFixtureContext();
  const result = await runToolCallingIntegration({
    rawToolCalls: [{ id: 'call-1', function: { name: 'fixture.disabled', arguments: '{}' } }],
    dispatcher,
    registry,
    config: ENABLED_CONFIG,
    authorization: APPROVED_AUTH,
    context: { turnId: 'turn-1', messageId: 'msg-3' },
  });
  assert.equal(result.results[0].status, 'disabled');
  assert.equal(result.results[0].executed, false);
});

test('integration - erro do handler nunca escapa (fixture.boom)', async () => {
  const { dispatcher, registry } = createToolCallingFixtureContext();
  const result = await runToolCallingIntegration({
    rawToolCalls: [{ id: 'call-1', function: { name: 'fixture.boom', arguments: '{}' } }],
    dispatcher,
    registry,
    config: ENABLED_CONFIG,
    authorization: APPROVED_AUTH,
    context: { turnId: 'turn-1', messageId: 'msg-4' },
  });
  assert.equal(result.results[0].status, 'error');
  assert.equal(result.results[0].executed, false);
  assert.equal(result.serializable, true);
});

test('integration - argumentos brutos nunca vazam nos resultados sanitizados', async () => {
  const { dispatcher, registry } = createToolCallingFixtureContext();
  const result = await runToolCallingIntegration({
    rawToolCalls: [{ id: 'call-1', function: { name: 'fixture.echo', arguments: '{"value":"SECRET"}' } }],
    dispatcher,
    registry,
    config: ENABLED_CONFIG,
    authorization: APPROVED_AUTH,
    context: { turnId: 'turn-1', messageId: 'msg-5' },
  });
  const json = JSON.stringify(result);
  assert.ok(!json.includes('SECRET'));
  assert.ok(!('arguments' in result.results[0]));
  assert.ok(!('data' in result.results[0]));
});

test('integration - fixture registry começa vazio e só registra via fixtures', () => {
  const registry = createToolCallingRegistry();
  assert.equal(registry.size(), 0);
  registerToolCallingFixtures(registry);
  assert.equal(registry.size(), 5);
  assert.equal(typeof registry.get('fixture.echo').handler, 'function');
});

test('integration - JSON inválido nos arguments falha sem executar', async () => {
  const { dispatcher, registry } = createToolCallingFixtureContext();
  const result = await runToolCallingIntegration({
    rawToolCalls: [{ id: 'call-1', function: { name: 'fixture.lookup', arguments: 'not-json' } }],
    dispatcher,
    registry,
    config: ENABLED_CONFIG,
    authorization: APPROVED_AUTH,
    context: { turnId: 'turn-1', messageId: 'msg-6' },
  });
  assert.equal(result.results[0].executed, false);
  assert.equal(result.results[0].errorCode, 'TOOL_CALL_ARGUMENTS_JSON_INVALID');
});

test('integration - todo resultado é JSON-safe', async () => {
  const { dispatcher, registry } = createToolCallingFixtureContext();
  const result = await runToolCallingIntegration({
    rawToolCalls: [
      { id: 'call-1', function: { name: 'fixture.lookup', arguments: '{"key":"a"}' } },
      { id: 'call-2', function: { name: 'fixture.boom', arguments: '{}' } },
    ],
    dispatcher,
    registry,
    config: ENABLED_CONFIG,
    authorization: APPROVED_AUTH,
    context: { turnId: 'turn-1', messageId: 'msg-7' },
  });
  assert.doesNotThrow(() => JSON.stringify(result));
  assert.equal(result.count, 2);
});

// ============================================================================
// FASE 24 — toolCallingRequired: pipeline indisponível vira reason explícito
// ============================================================================

test('FASE 24 - toolCallingRequired=false + dispatcher indisponível: DISPATCHER_MISSING silencioso (comportamento legado inalterado)', async () => {
  const result = await runToolCallingIntegration({
    rawToolCalls: [{ id: 'call-1', function: { name: 'fixture.lookup', arguments: '{}' } }],
    dispatcher: null,
    registry: null,
    config: { toolCallingEnabled: true, toolCallingRequired: false },
    authorization: APPROVED_AUTH,
    context: { turnId: 'turn-1', messageId: 'msg-req-1' },
  });
  assert.equal(result.reason, 'DISPATCHER_MISSING');
  assert.equal(result.executed, false);
});

test('FASE 24 - toolCallingRequired=true + dispatcher indisponível: reason explícito TOOL_CALLING_REQUIRED_UNAVAILABLE', async () => {
  const result = await runToolCallingIntegration({
    rawToolCalls: [{ id: 'call-1', function: { name: 'fixture.lookup', arguments: '{}' } }],
    dispatcher: null,
    registry: null,
    config: { toolCallingEnabled: true, toolCallingRequired: true },
    authorization: APPROVED_AUTH,
    context: { turnId: 'turn-1', messageId: 'msg-req-2' },
  });
  assert.equal(result.reason, 'TOOL_CALLING_REQUIRED_UNAVAILABLE');
  assert.equal(result.executed, false);
  assert.doesNotThrow(() => JSON.stringify(result));
});

test('FASE 24 - toolCallingRequired=true + pipeline disponível: executa normalmente, sem reason de erro', async () => {
  const { dispatcher, registry } = createToolCallingFixtureContext();
  const result = await runToolCallingIntegration({
    rawToolCalls: [{ id: 'call-1', function: { name: 'fixture.echo', arguments: '{"value":1}' } }],
    dispatcher,
    registry,
    config: { toolCallingEnabled: true, toolCallingShadowMode: false, toolCallingRequired: true },
    authorization: APPROVED_AUTH,
    context: { turnId: 'turn-1', messageId: 'msg-req-3' },
  });
  assert.equal(result.reason, 'TOOL_CALLS_PROCESSED');
  assert.equal(result.executed, true);
});
