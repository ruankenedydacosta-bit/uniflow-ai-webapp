// Uni Engine — Fase 20: Tool Calling (base). Testes de tipos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TOOL_CALLING_VERSION,
  TOOL_CALLING_DEFAULT_CONFIG,
  TOOL_CALL_SAFETY_KEYS,
  isToolCallStatus,
  isToolCallSelectionDecision,
  validateToolCallingConfig,
} from './index.js';

test('types - versão é string não vazia', () => {
  assert.ok(typeof TOOL_CALLING_VERSION === 'string' && TOOL_CALLING_VERSION.length > 0);
});

test('types - config padrão é congelada e desligada por padrão', () => {
  assert.ok(Object.isFrozen(TOOL_CALLING_DEFAULT_CONFIG));
  assert.equal(TOOL_CALLING_DEFAULT_CONFIG.toolCallingEnabled, false);
  assert.equal(TOOL_CALLING_DEFAULT_CONFIG.toolCallingShadowMode, true);
  assert.equal(TOOL_CALLING_DEFAULT_CONFIG.toolCallingTelemetryEnabled, false);
  assert.equal(TOOL_CALLING_DEFAULT_CONFIG.toolCallingRequired, false);
  assert.equal(TOOL_CALLING_DEFAULT_CONFIG.toolCallingExecutionAllowed, false);
});

test('types - status fechados incluem estados de segurança', () => {
  for (const s of ['idle', 'executed', 'completed', 'blocked', 'not_found', 'disabled', 'unauthorized', 'not_allowed', 'error', 'timeout', 'cancelled', 'duplicate', 'fallback']) {
    assert.ok(isToolCallStatus(s), `expected ${s} to be a valid status`);
  }
  assert.equal(isToolCallStatus('invalid_status'), false);
});

test('types - decisões de seleção fechadas', () => {
  for (const d of ['execute', 'skip', 'fallback']) {
    assert.ok(isToolCallSelectionDecision(d));
  }
  assert.equal(isToolCallSelectionDecision('run'), false);
});

test('types - safety keys incluem as garantias', () => {
  for (const k of ['executionAllowed', 'authorized', 'financialMutation', 'networkAccessed', 'wrote', 'persisted', 'externalServiceCalled', 'duplicatedExecution']) {
    assert.ok(TOOL_CALL_SAFETY_KEYS.includes(k));
  }
});

test('types - config inválida é rejeitada', () => {
  const r = validateToolCallingConfig(null);
  assert.equal(r.valid, false);
  assert.ok(r.errors.includes('CONFIG_INVALID'));
  const r2 = validateToolCallingConfig({});
  assert.equal(r2.valid, false);
  assert.ok(r2.errors.includes('TOOL_CALLING_ENABLED_MISSING_OR_NOT_BOOLEAN'));
});

test('types - config padrão é válida', () => {
  const r = validateToolCallingConfig(TOOL_CALLING_DEFAULT_CONFIG);
  assert.equal(r.valid, true);
});
