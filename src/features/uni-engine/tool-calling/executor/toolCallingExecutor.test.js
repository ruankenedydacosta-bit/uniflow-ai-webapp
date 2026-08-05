// Uni Engine — Fase 20: Tool Calling (base). Testes do executor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executeTool, executeToolSync, createExecutedToolResult } from './index.js';

const AUTH = { authorized: true, executionAllowed: true };

function buildTool(handler, overrides = {}) {
  return { name: 'fixture.lookup', handler, ...overrides };
}

test('executor - handler nunca escapa erro (resultado padronizado)', async () => {
  const tool = buildTool(() => {
    throw new Error('boom');
  });
  const result = await executeTool({ tool, toolCall: { id: 'c', name: 'x' }, authorization: AUTH });
  assert.equal(result.status, 'error');
  assert.equal(result.executed, false);
  assert.equal(result.error.code, 'HANDLER_ERROR');
  assert.equal(result.serializable, true);
});

test('executor - resultado válido vira completed', async () => {
  const tool = buildTool(() => ({ data: { ok: true } }));
  const result = await executeTool({ tool, toolCall: { id: 'c', name: 'x' }, authorization: AUTH });
  assert.equal(result.status, 'completed');
  assert.equal(result.executed, true);
  assert.deepEqual(result.data, { ok: true });
});

test('executor - exige autorização mesmo fora do dispatcher', async () => {
  const tool = buildTool(() => ({ data: 1 }));
  let called = false;
  const guarded = buildTool(() => { called = true; return 1; });
  const result = await executeTool({ tool: guarded, toolCall: { id: 'c', name: 'x' }, authorization: {} });
  assert.equal(result.status, 'unauthorized');
  assert.equal(called, false);
});

test('executor - timeout com AbortSignal', async () => {
  const tool = buildTool(({ signal }) => new Promise((resolve) => {
    const onAbort = () => resolve({ data: 'done' });
    signal?.addEventListener('abort', onAbort);
  }));
  const result = await executeTool({ tool, toolCall: { id: 'c', name: 'x' }, authorization: AUTH, timeoutMs: 10 });
  assert.equal(result.status, 'timeout');
  assert.equal(result.error.code, 'TOOL_TIMEOUT');
});

test('executor - cancelamento via AbortSignal externo', async () => {
  const controller = new AbortController();
  const tool = buildTool(({ signal }) => new Promise((resolve, reject) => {
    signal?.addEventListener('abort', () => reject(signal.reason));
  }));
  setTimeout(() => controller.abort(new Error('USER_CANCEL')), 5);
  const result = await executeTool({ tool, toolCall: { id: 'c', name: 'x' }, authorization: AUTH, signal: controller.signal });
  assert.equal(result.status, 'cancelled');
  assert.equal(result.error.code, 'TOOL_CANCELLED');
});

test('executor - resultado não serializável → error', async () => {
  const tool = buildTool(() => ({ data: { fn: () => {} } }));
  const result = await executeTool({ tool, toolCall: { id: 'c', name: 'x' }, authorization: AUTH });
  assert.equal(result.status, 'error');
  assert.equal(result.error.code, 'RESULT_NOT_SERIALIZABLE');
});

test('executor - resultado JSON-safe', async () => {
  const tool = buildTool(() => ({ data: { a: [1, 2, { b: true }] } }));
  const result = await executeTool({ tool, toolCall: { id: 'c', name: 'x' }, authorization: AUTH });
  assert.doesNotThrow(() => JSON.stringify(result));
});

test('executor - sync handler também nunca escapa', () => {
  const tool = buildTool(() => { throw new Error('sync'); });
  const result = executeToolSync({ tool, toolCall: { id: 'c', name: 'x' }, authorization: AUTH });
  assert.equal(result.status, 'error');
  assert.equal(result.error.code, 'HANDLER_ERROR');
});

test('executor - createExecutedToolResult helper', () => {
  const r = createExecutedToolResult({ toolCallId: 'c', toolName: 'x', data: 42 });
  assert.equal(r.executed, true);
  assert.equal(r.status, 'completed');
  assert.equal(r.data, 42);
});
