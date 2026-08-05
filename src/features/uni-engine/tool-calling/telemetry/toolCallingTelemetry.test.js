// Uni Engine — Fase 20: Tool Calling (base). Testes de telemetria.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TOOL_CALLING_TELEMETRY_VERSION,
  TOOL_CALLING_TELEMETRY_ALLOWED_FIELDS,
  hashToolCallId,
  buildToolCallingTelemetryEntry,
  createToolCallingTelemetryStore,
} from './index.js';

test('telemetry - nunca armazena argumentos brutos nem retorno bruto', () => {
  const entry = buildToolCallingTelemetryEntry({
    toolCallId: 'call-1',
    toolName: 'x',
    arguments: { secret: 'value' },
    data: { raw: 'content' },
    status: 'completed',
  });
  assert.ok(!('arguments' in entry));
  assert.ok(!('data' in entry));
  assert.ok(!('raw' in entry));
  assert.ok(!('secret' in entry));
});

test('telemetry - nunca armazena IDs crus (somente hash)', () => {
  const entry = buildToolCallingTelemetryEntry({ toolCallId: 'call-1', toolName: 'x' });
  assert.ok(!('toolCallId' in entry));
  assert.equal(typeof entry.toolCallIdHash, 'string');
  assert.equal(entry.toolCallIdHash, hashToolCallId('call-1'));
  assert.notEqual(entry.toolCallIdHash, 'call-1');
});

test('telemetry - hashToolCallId é determinístico e segura', () => {
  assert.equal(hashToolCallId('call-1'), hashToolCallId('call-1'));
  assert.equal(hashToolCallId(''), null);
  assert.equal(hashToolCallId(null), null);
  assert.equal(hashToolCallId('call-1'), 'ae796082');
});

test('telemetry - entrada apenas com metadados sanitizados', () => {
  const entry = buildToolCallingTelemetryEntry({
    timestamp: 123,
    environment: 'development',
    toolName: 'fixture.lookup',
    toolCallId: 'call-1',
    status: 'completed',
    decision: 'execute',
    reason: 'APPROVED',
    authorized: true,
    executionAllowed: true,
    writes: false,
    idempotent: false,
    latencyMs: 12,
    hasError: false,
  });
  for (const field of Object.keys(entry)) {
    assert.ok(TOOL_CALLING_TELEMETRY_ALLOWED_FIELDS.includes(field), `unexpected field ${field}`);
  }
  assert.equal(entry.toolName, 'fixture.lookup');
  assert.equal(entry.status, 'completed');
  assert.equal(entry.latencyMs, 12);
});

test('telemetry - desligada não grava', () => {
  const store = createToolCallingTelemetryStore({ enabled: false });
  store.recordEntry({ toolName: 'x' });
  assert.equal(store.size(), 0);
  assert.equal(store.getSnapshot().length, 0);
});

test('telemetry - ligada grava e mantém buffer limitado', () => {
  const store = createToolCallingTelemetryStore({ enabled: true, maxEntries: 5 });
  for (let i = 0; i < 10; i++) store.recordEntry({ toolName: 'x' });
  assert.equal(store.size(), 5);
});

test('telemetry - JSON-safe', () => {
  const store = createToolCallingTelemetryStore({ enabled: true });
  store.recordEntry({ toolName: 'x', toolCallId: 'call-1' });
  const snapshot = store.getSnapshot();
  assert.doesNotThrow(() => JSON.stringify(snapshot));
});

test('telemetry - reset limpa buffer', () => {
  const store = createToolCallingTelemetryStore({ enabled: true });
  store.recordEntry({ toolName: 'x' });
  store.reset();
  assert.equal(store.size(), 0);
});

test('telemetry - entrada congelada', () => {
  const entry = buildToolCallingTelemetryEntry({ toolName: 'x' });
  assert.ok(Object.isFrozen(entry));
});