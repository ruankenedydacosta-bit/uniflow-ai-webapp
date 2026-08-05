// Uni Engine — Fase 20: Tool Calling (base). Testes do dispatcher.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createToolCallingDispatcher } from './index.js';
import { createToolCallingRegistry } from '../registry/index.js';
import { createIdempotencyStore } from '../idempotency/index.js';
import { createToolCallingTelemetryStore } from '../telemetry/index.js';

const ENABLED = {
  toolCallingEnabled: true,
  toolCallingShadowMode: true,
  toolCallingTelemetryEnabled: true,
  toolCallingRequired: false,
};

const DISABLED = { ...ENABLED, toolCallingEnabled: false };

const AUTH = { authorized: true, executionAllowed: true };

function buildRegistry({ allowWrites = false } = {}) {
  const registry = createToolCallingRegistry({ allowWrites });
  registry.registerTool({ name: 'fixture.lookup', handler: () => ({ data: { value: 42 } }) });
  registry.registerTool({ name: 'fixture.echo', handler: ({ arguments: args }) => ({ data: args }) });
  registry.registerTool({ name: 'fixture.disabled', handler: () => ({ data: 1 }), enabled: false });
  registry.registerTool({ name: 'fixture.boom', handler: () => { throw new Error('boom'); } });
  registry.registerTool({
    name: 'fixture.sleep',
    handler: ({ signal }) => new Promise((resolve) => {
      const t = setTimeout(() => resolve({ data: 'ok' }), 500);
      signal?.addEventListener('abort', () => { clearTimeout(t); resolve({ data: 'aborted' }); });
    }),
  });
  return registry;
}

function buildDerived({ telemetryEnabled = true } = {}) {
  const idempotency = createIdempotencyStore();
  const telemetry = createToolCallingTelemetryStore({ enabled: telemetryEnabled });
  const dispatch = createToolCallingDispatcher({ idempotency, telemetry }).dispatchToolCall;
  return { dispatch, idempotency, telemetry };
}

const call = (name, id = 'call-1', args = null) => ({ id, name, ...(args !== null ? { arguments: args } : {}) });

test('dispatcher - desligado: nenhuma execução, mesmo autorizado', async () => {
  const { dispatch, telemetry } = buildDerived();
  const reg = buildRegistry();
  const out = await dispatch({ toolCall: call('fixture.lookup'), registry: reg, config: DISABLED, authorization: AUTH });
  assert.equal(out.executed, false);
  assert.equal(out.result.status, 'skipped');
});

test('dispatcher - executa tool autorizada via executor (única rota)', async () => {
  const { dispatch, telemetry } = buildDerived();
  const reg = buildRegistry();
  const out = await dispatch({ toolCall: call('fixture.lookup'), registry: reg, config: ENABLED, authorization: AUTH });
  assert.equal(out.executed, true);
  assert.equal(out.result.status, 'completed');
  assert.equal(out.result.data.value, 42);
});

test('dispatcher - autorização ausente: nenhuma execução', async () => {
  const { dispatch } = buildDerived();
  const reg = buildRegistry();
  const out = await dispatch({ toolCall: call('fixture.lookup'), registry: reg, config: ENABLED, authorization: {} });
  assert.equal(out.executed, false);
  assert.equal(out.result.status, 'unauthorized');
});

test('dispatcher - executionAllowed false: nenhuma execução', async () => {
  const { dispatch } = buildDerived();
  const reg = buildRegistry();
  const out = await dispatch({ toolCall: call('fixture.lookup'), registry: reg, config: ENABLED, authorization: { authorized: true, executionAllowed: false } });
  assert.equal(out.executed, false);
  assert.equal(out.result.status, 'not_allowed');
});

test('dispatcher - ferramenta inexistente: none', async () => {
  const { dispatch } = buildDerived();
  const reg = buildRegistry();
  const out = await dispatch({ toolCall: call('nope'), registry: reg, config: ENABLED, authorization: AUTH });
  assert.equal(out.executed, false);
  assert.equal(out.result.status, 'not_found');
});

test('dispatcher - ferramenta desabilitada: none', async () => {
  const { dispatch } = buildDerived();
  const reg = buildRegistry();
  const out = await dispatch({ toolCall: call('fixture.disabled'), registry: reg, config: ENABLED, authorization: AUTH });
  assert.equal(out.executed, false);
  assert.equal(out.result.status, 'disabled');
});

test('dispatcher - erro do handler nunca escapa', async () => {
  const { dispatch } = buildDerived();
  const reg = buildRegistry();
  const out = await dispatch({ toolCall: call('fixture.boom'), registry: reg, config: ENABLED, authorization: AUTH });
  assert.equal(out.result.status, 'error');
  assert.equal(out.result.error.code, 'HANDLER_ERROR');
  assert.equal(out.result.serializable, true);
});

test('dispatcher - idempotência: mesmo turno não executa 2x', async () => {
  const { dispatch, idempotency } = buildDerived();
  const reg = buildRegistry();
  const first = await dispatch({ toolCall: call('fixture.lookup'), registry: reg, config: ENABLED, authorization: AUTH, turnId: 't1', workspaceId: 'w1', conversationId: 'c1' });
  const second = await dispatch({ toolCall: call('fixture.lookup'), registry: reg, config: ENABLED, authorization: AUTH, turnId: 't1', workspaceId: 'w1', conversationId: 'c1' });
  assert.equal(first.executed, true);
  assert.equal(second.executed, false);
  assert.equal(second.idempotent, true);
});

test('dispatcher - novo turno pode executar novamente', async () => {
  const { dispatch } = buildDerived();
  const reg = buildRegistry();
  await dispatch({ toolCall: call('fixture.lookup'), registry: reg, config: ENABLED, authorization: AUTH, turnId: 't1', workspaceId: 'w1', conversationId: 'c1' });
  const second = await dispatch({ toolCall: call('fixture.lookup'), registry: reg, config: ENABLED, authorization: AUTH, turnId: 't2', workspaceId: 'w1', conversationId: 'c1' });
  assert.equal(second.executed, true);
});

test('dispatcher - troca de conversationId executa novamente', async () => {
  const { dispatch } = buildDerived();
  const reg = buildRegistry();
  await dispatch({ toolCall: call('fixture.lookup'), registry: reg, config: ENABLED, authorization: AUTH, turnId: 't1', workspaceId: 'w1', conversationId: 'c1' });
  const second = await dispatch({ toolCall: call('fixture.lookup'), registry: reg, config: ENABLED, authorization: AUTH, turnId: 't1', workspaceId: 'w1', conversationId: 'c2' });
  assert.equal(second.executed, true);
});

test('dispatcher - troca de workspaceId executa novamente', async () => {
  const { dispatch } = buildDerived();
  const reg = buildRegistry();
  await dispatch({ toolCall: call('fixture.lookup'), registry: reg, config: ENABLED, authorization: AUTH, turnId: 't1', workspaceId: 'w1', conversationId: 'c1' });
  const second = await dispatch({ toolCall: call('fixture.lookup'), registry: reg, config: ENABLED, authorization: AUTH, turnId: 't1', workspaceId: 'w2', conversationId: 'c1' });
  assert.equal(second.executed, true);
});

test('dispatcher - stale turn não executa de novo na mesma chave', async () => {
  const { dispatch, idempotency } = buildDerived();
  const reg = buildRegistry();
  await dispatch({ toolCall: call('fixture.lookup'), registry: reg, config: ENABLED, authorization: AUTH, turnId: 't1', workspaceId: 'w1', conversationId: 'c1' });
  assert.equal(idempotency.isStaleTurn({ turnId: 't9', workspaceId: 'w1', conversationId: 'c1' }), true);
  const second = await dispatch({ toolCall: call('fixture.lookup'), registry: reg, config: ENABLED, authorization: AUTH, turnId: 't1', workspaceId: 'w1', conversationId: 'c1' });
  assert.equal(second.executed, false);
});

test('dispatcher - Pending Action bloqueia execução', async () => {
  const { dispatch } = buildDerived();
  const reg = buildRegistry();
  const out = await dispatch({
    toolCall: call('fixture.lookup'), registry: reg, config: ENABLED,
    authorization: { ...AUTH, pendingAction: true },
  });
  assert.equal(out.executed, false);
});

test('dispatcher - confirmação pendente bloqueia execução', async () => {
  const { dispatch } = buildDerived();
  const reg = buildRegistry();
  const out = await dispatch({
    toolCall: call('fixture.lookup'), registry: reg, config: ENABLED,
    authorization: { ...AUTH, confirmationPending: true },
  });
  assert.equal(out.executed, false);
});

test('dispatcher - telemetria gravada apenas com metadados sanitizados', async () => {
  const { dispatch, telemetry } = buildDerived();
  const reg = buildRegistry();
  await dispatch({
    toolCall: call('fixture.echo', 'call-secret', { secret: 'raw-value' }),
    registry: reg, config: ENABLED, authorization: AUTH,
    environment: 'development',
  });
  const entries = telemetry.getSnapshot();
  assert.ok(entries.length >= 1);
  const execEntry = entries.find((e) => e.status === 'completed');
  assert.ok(execEntry);
  const raw = JSON.stringify(entries);
  assert.ok(!raw.includes('raw-value'));
  assert.ok(!raw.includes('call-secret'));
});

test('dispatcher - telemetria desligada não grava', async () => {
  const { dispatch, telemetry } = buildDerived({ telemetryEnabled: false });
  const reg = buildRegistry();
  await dispatch({ toolCall: call('fixture.lookup'), registry: reg, config: ENABLED, authorization: AUTH });
  assert.equal(telemetry.size(), 0);
});

test('dispatcher - resultado JSON-safe e sem retorno bruto', async () => {
  const { dispatch } = buildDerived();
  const reg = buildRegistry();
  const out = await dispatch({ toolCall: call('fixture.echo', 'call-1', { a: 1 }), registry: reg, config: ENABLED, authorization: AUTH });
  assert.doesNotThrow(() => JSON.stringify(out.result));
  assert.deepEqual(out.result.data, { a: 1 });
});