import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildToolCallingAuthorization,
  hasCompleteToolCallingIdentity,
} from './toolCallingAuthorization.js';

const COMPLETE_IDENTITY = Object.freeze({
  userId: 'user-1',
  workspaceId: 'workspace-1',
  conversationId: 'conversation-1',
  turnId: 'turn-1',
  messageId: 'message-1',
});

const EXECUTION_CONFIG = Object.freeze({
  enabled: true,
  toolCallingEnabled: true,
  toolCallingShadowMode: false,
  toolCallingExecutionAllowed: true,
});

test('authorization exige identidade completa', () => {
  assert.equal(hasCompleteToolCallingIdentity(COMPLETE_IDENTITY), true);
  assert.equal(hasCompleteToolCallingIdentity({ ...COMPLETE_IDENTITY, workspaceId: null }), false);
  const result = buildToolCallingAuthorization({
    config: EXECUTION_CONFIG,
    identity: { ...COMPLETE_IDENTITY, workspaceId: null },
  });
  assert.equal(result.authorized, false);
  assert.equal(result.executionAllowed, false);
  assert.equal(result.reason, 'IDENTITY_INCOMPLETE');
});

test('executionAllowed nasce falso sem opt-in separado', () => {
  const result = buildToolCallingAuthorization({
    config: { ...EXECUTION_CONFIG, toolCallingExecutionAllowed: false },
    identity: COMPLETE_IDENTITY,
  });
  assert.equal(result.authorized, true);
  assert.equal(result.executionAllowed, false);
  assert.equal(result.reason, 'EXECUTION_NOT_EXPLICITLY_ALLOWED');
});

test('shadow mode sempre bloqueia execução', () => {
  const result = buildToolCallingAuthorization({
    config: { ...EXECUTION_CONFIG, toolCallingShadowMode: true },
    identity: COMPLETE_IDENTITY,
  });
  assert.equal(result.executionAllowed, false);
  assert.equal(result.reason, 'SHADOW_MODE');
});

test('pending action e confirmação pendente bloqueiam execução', () => {
  const pending = buildToolCallingAuthorization({
    config: EXECUTION_CONFIG,
    identity: COMPLETE_IDENTITY,
    pendingAction: true,
  });
  const confirmation = buildToolCallingAuthorization({
    config: EXECUTION_CONFIG,
    identity: COMPLETE_IDENTITY,
    confirmationPending: true,
  });
  assert.equal(pending.executionAllowed, false);
  assert.equal(confirmation.executionAllowed, false);
});

test('execução exige todos os gates explícitos', () => {
  const result = buildToolCallingAuthorization({
    config: EXECUTION_CONFIG,
    identity: COMPLETE_IDENTITY,
  });
  assert.equal(result.authorized, true);
  assert.equal(result.executionAllowed, true);
  assert.equal(result.reason, 'EXECUTION_AUTHORIZED');
  assert.equal(Object.isFrozen(result), true);
});
