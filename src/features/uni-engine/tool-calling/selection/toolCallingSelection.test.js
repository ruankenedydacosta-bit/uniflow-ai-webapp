// Uni Engine — Fase 20: Tool Calling (base). Testes de seleção/gates.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectToolCall } from './index.js';
import { createToolCallingRegistry } from '../registry/index.js';

function fixtureHandler() {
  return { ok: true };
}

const ENABLED_CONFIG = {
  toolCallingEnabled: true,
  toolCallingShadowMode: true,
  toolCallingTelemetryEnabled: false,
  toolCallingRequired: false,
};

const DISABLED_CONFIG = {
  toolCallingEnabled: false,
  toolCallingShadowMode: true,
  toolCallingTelemetryEnabled: false,
  toolCallingRequired: false,
};

const AUTHORIZED = { authorized: true, executionAllowed: true };

function buildRegistry() {
  const registry = createToolCallingRegistry();
  registry.registerTool({ name: 'fixture.lookup', handler: fixtureHandler });
  registry.registerTool({ name: 'fixture.disabled', handler: fixtureHandler, enabled: false });
  return registry;
}

test('selection - Tool Calling desligado → fallback, nenhum dispatcher', () => {
  const selection = selectToolCall({ toolCall: { id: 'c', name: 'fixture.lookup' }, registry: buildRegistry(), config: DISABLED_CONFIG, authorization: AUTHORIZED });
  assert.equal(selection.decision, 'fallback');
  assert.equal(selection.reason, 'TOOL_CALLING_DISABLED');
  assert.equal(selection.gates.configEnabled, false);
});

test('selection - aprova tool válida com autorização', () => {
  const selection = selectToolCall({ toolCall: { id: 'c', name: 'fixture.lookup' }, registry: buildRegistry(), config: ENABLED_CONFIG, authorization: AUTHORIZED });
  assert.equal(selection.decision, 'execute');
  assert.equal(selection.reason, 'APPROVED');
  assert.equal(selection.gates.toolFound, true);
});

test('selection - tool call sem id/nome → skip', () => {
  const selection = selectToolCall({ toolCall: {}, registry: buildRegistry(), config: ENABLED_CONFIG, authorization: AUTHORIZED });
  assert.equal(selection.decision, 'skip');
  assert.equal(selection.reason, 'TOOL_CALL_INVALID');
});

test('selection - ferramenta inexistente → skip', () => {
  const selection = selectToolCall({ toolCall: { id: 'c', name: 'nope' }, registry: buildRegistry(), config: ENABLED_CONFIG, authorization: AUTHORIZED });
  assert.equal(selection.decision, 'skip');
  assert.equal(selection.reason, 'TOOL_NOT_FOUND');
  assert.equal(selection.gates.toolFound, false);
});

test('selection - ferramenta desabilitada → skip', () => {
  const selection = selectToolCall({ toolCall: { id: 'c', name: 'fixture.disabled' }, registry: buildRegistry(), config: ENABLED_CONFIG, authorization: AUTHORIZED });
  assert.equal(selection.decision, 'skip');
  assert.equal(selection.reason, 'TOOL_DISABLED');
});

test('selection - autorização ausente → skip', () => {
  const selection = selectToolCall({ toolCall: { id: 'c', name: 'fixture.lookup' }, registry: buildRegistry(), config: ENABLED_CONFIG, authorization: {} });
  assert.equal(selection.decision, 'skip');
  assert.equal(selection.reason, 'AUTHORIZATION_MISSING');
  assert.equal(selection.gates.authorized, false);
});

test('selection - executionAllowed false → skip', () => {
  const selection = selectToolCall({ toolCall: { id: 'c', name: 'fixture.lookup' }, registry: buildRegistry(), config: ENABLED_CONFIG, authorization: { authorized: true, executionAllowed: false } });
  assert.equal(selection.decision, 'skip');
  assert.equal(selection.reason, 'EXECUTION_NOT_ALLOWED');
});

test('selection - Pending Action ativa bloqueia', () => {
  const selection = selectToolCall({ toolCall: { id: 'c', name: 'fixture.lookup' }, registry: buildRegistry(), config: ENABLED_CONFIG, authorization: { ...AUTHORIZED, pendingAction: true } });
  assert.equal(selection.decision, 'skip');
  assert.equal(selection.reason, 'PENDING_ACTION_ACTIVE');
  assert.equal(selection.gates.pendingActionBlocked, true);
});

test('selection - confirmação pendente bloqueia', () => {
  const selection = selectToolCall({ toolCall: { id: 'c', name: 'fixture.lookup' }, registry: buildRegistry(), config: ENABLED_CONFIG, authorization: { ...AUTHORIZED, confirmationPending: true } });
  assert.equal(selection.decision, 'skip');
  assert.equal(selection.reason, 'CONFIRMATION_PENDING');
  assert.equal(selection.gates.confirmationPendingBlocked, true);
});

test('selection - falha segura sem config (fallback)', () => {
  const selection = selectToolCall({ toolCall: { id: 'c', name: 'fixture.lookup' } });
  assert.equal(selection.decision, 'fallback');
  assert.equal(selection.reason, 'TOOL_CALLING_DISABLED');
});
