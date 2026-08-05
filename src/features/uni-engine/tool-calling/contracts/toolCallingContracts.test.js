// Uni Engine — Fase 20: Tool Calling (base). Testes de contratos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isSerializableValue,
  createEmptyToolResult,
  validateToolCall,
  createToolResult,
  isToolResultSerializable,
} from './index.js';

test('contracts - isSerializableValue rejeita função, bigint e circular', () => {
  assert.equal(isSerializableValue({ a: 1, b: 'x' }), true);
  assert.equal(isSerializableValue([1, 2, { a: true }]), true);
  assert.equal(isSerializableValue(() => {}), false);
  assert.equal(isSerializableValue(1n), false);
  assert.equal(isSerializableValue(Number.NaN), false);
  const circular = {};
  circular.self = circular;
  assert.equal(isSerializableValue(circular), false);
});

test('contracts - resultado vazio é congelado e desligado por padrão', () => {
  const r = createEmptyToolResult({ toolCallId: 'call-1', toolName: 'x' });
  assert.ok(Object.isFrozen(r));
  assert.equal(r.toolCallId, 'call-1');
  assert.equal(r.executed, false);
  assert.equal(r.authorized, false);
  assert.equal(r.executionAllowed, false);
  assert.equal(r.serializable, true);
});

test('contracts - validateToolCall aceita chamada válida', () => {
  const r = validateToolCall({ id: 'call-1', name: 'x', arguments: { a: 1 } });
  assert.equal(r.valid, true);
});

test('contracts - validateToolCall rejeita sem id ou sem nome', () => {
  const noId = validateToolCall({ name: 'x' });
  assert.equal(noId.valid, false);
  assert.ok(noId.errors.includes('TOOL_CALL_ID_MISSING'));
  const noName = validateToolCall({ id: 'call-1' });
  assert.equal(noName.valid, false);
  assert.ok(noName.errors.includes('TOOL_CALL_NAME_MISSING'));
});

test('contracts - validateToolCall rejeita argumentos não serializáveis', () => {
  const r = validateToolCall({ id: 'c', name: 'x', arguments: { fn: () => {} } });
  assert.equal(r.valid, false);
  assert.ok(r.errors.includes('TOOL_CALL_ARGUMENTS_NOT_SERIALIZABLE'));
});

test('contracts - createToolResult padroniza e sanitiza', () => {
  const r = createToolResult({
    toolCallId: 'call-1',
    toolName: 'x',
    status: 'completed',
    executed: true,
    authorized: true,
    executionAllowed: true,
    data: { ok: true },
  });
  assert.equal(r.status, 'completed');
  assert.equal(r.executed, true);
  assert.equal(r.serializable, true);
  assert.deepEqual(r.data, { ok: true });
});

test('contracts - createToolResult descarta dados não serializáveis', () => {
  const r = createToolResult({ status: 'completed', data: { fn: () => {} } });
  assert.equal(r.data, null);
});

test('contracts - createToolResult padroniza erro', () => {
  const r = createToolResult({ status: 'error', error: { code: 'TOOL_ERROR', message: 'boom' } });
  assert.deepEqual(r.error, { code: 'TOOL_ERROR', message: 'boom' });
});

test('contracts - isToolResultSerializable é JSON-safe', () => {
  const r = createToolResult({ status: 'completed' });
  assert.equal(isToolResultSerializable(r), true);
  assert.equal(isToolResultSerializable(null), false);
});
