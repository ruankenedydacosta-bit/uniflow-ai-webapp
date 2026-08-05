// Uni Engine — Fase 20: Tool Calling (base). Testes de idempotência.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createIdempotencyStore, buildKey } from './index.js';

test('idempotency - chave composta com identidade + toolCallId', () => {
  const key = buildKey({ turnId: 't', workspaceId: 'w', conversationId: 'c', toolCallId: 'call' });
  assert.ok(typeof key === 'string' && key.length > 0);
  assert.notEqual(
    buildKey({ turnId: 't1', workspaceId: 'w', conversationId: 'c', toolCallId: 'call' }),
    buildKey({ turnId: 't2', workspaceId: 'w', conversationId: 'c', toolCallId: 'call' }),
  );
});

test('idempotency - markRun e hasRun respeitam chave', () => {
  const store = createIdempotencyStore();
  assert.equal(store.hasRun({ turnId: 't', workspaceId: 'w', conversationId: 'c', toolCallId: 'call' }), false);
  store.markRun({ turnId: 't', workspaceId: 'w', conversationId: 'c', toolCallId: 'call', result: { status: 'completed' } });
  assert.equal(store.hasRun({ turnId: 't', workspaceId: 'w', conversationId: 'c', toolCallId: 'call' }), true);
});

test('idempotency - novo turno pode executar novamente', () => {
  const store = createIdempotencyStore();
  store.markRun({ turnId: 't1', workspaceId: 'w', conversationId: 'c', toolCallId: 'call', result: {} });
  assert.equal(store.hasRun({ turnId: 't2', workspaceId: 'w', conversationId: 'c', toolCallId: 'call' }), false);
});

test('idempotency - troca de conversationId produz chave nova', () => {
  const store = createIdempotencyStore();
  store.markRun({ turnId: 't', workspaceId: 'w', conversationId: 'c1', toolCallId: 'call', result: {} });
  assert.equal(store.hasRun({ turnId: 't', workspaceId: 'w', conversationId: 'c2', toolCallId: 'call' }), false);
});

test('idempotency - troca de workspaceId produz chave nova', () => {
  const store = createIdempotencyStore();
  store.markRun({ turnId: 't', workspaceId: 'w1', conversationId: 'c', toolCallId: 'call', result: {} });
  assert.equal(store.hasRun({ turnId: 't', workspaceId: 'w2', conversationId: 'c', toolCallId: 'call' }), false);
});

test('idempotency - mesma toolCallId em outro turno roda de novo', () => {
  const store = createIdempotencyStore();
  store.markRun({ turnId: 't1', workspaceId: 'w', conversationId: 'c', toolCallId: 'same', result: {} });
  assert.equal(store.hasRun({ turnId: 't2', workspaceId: 'w', conversationId: 'c', toolCallId: 'same' }), false);
});

test('idempotency - getResult retorna resultado marcado', () => {
  const store = createIdempotencyStore();
  store.markRun({ turnId: 't', workspaceId: 'w', conversationId: 'c', toolCallId: 'call', result: { status: 'completed' } });
  assert.deepEqual(store.getResult({ turnId: 't', workspaceId: 'w', conversationId: 'c', toolCallId: 'call' }), { status: 'completed' });
  assert.equal(store.getResult({ turnId: 'other', workspaceId: 'w', conversationId: 'c', toolCallId: 'call' }), null);
});

test('idempotency - isStaleTurn detecta turno anterior', () => {
  const store = createIdempotencyStore();
  store.markRun({ turnId: 't1', workspaceId: 'w', conversationId: 'c', toolCallId: 'call', result: {} });
  assert.equal(store.isStaleTurn({ turnId: 't2', workspaceId: 'w', conversationId: 'c' }), true);
  assert.equal(store.isStaleTurn({ turnId: 't1', workspaceId: 'w', conversationId: 'c' }), false);
});

test('idempotency - clear e size', () => {
  const store = createIdempotencyStore();
  store.markRun({ turnId: 't', workspaceId: 'w', conversationId: 'c', toolCallId: 'call', result: {} });
  assert.equal(store.size(), 1);
  store.clear();
  assert.equal(store.size(), 0);
});