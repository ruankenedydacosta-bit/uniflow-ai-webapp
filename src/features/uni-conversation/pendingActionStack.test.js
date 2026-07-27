import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cancelPendingAction,
  completePendingAction,
  confirmPendingAction,
  createPendingActionCoordinator,
  createPendingActionStack,
  getActivePendingAction,
  loadPendingAction,
  loadPendingActionStack,
  PENDING_ACTION_STATUS,
  pushPendingAction,
  savePendingActionStack,
  updatePendingAction,
  validatePendingActionStack,
} from './index.js';

const identity = Object.freeze({
  userId: 'user-1',
  workspaceId: 'workspace-business',
  conversationId: 'conversation-1',
});
const now = '2026-07-27T12:00:00.000Z';

function createStackWithParent() {
  const empty = createPendingActionStack(identity, { now });
  return pushPendingAction(empty, {
    id: 'expense-1',
    type: 'create_expense',
    deduplicationKey: 'expense:operation-1',
    fields: { amount: 50, description: 'Almoço', accountId: null },
    context: { workspaceType: 'business' },
  }, { now }).stack;
}

test('preserva identidade, contexto e campos ao suspender uma ação-pai', () => {
  const parentStack = createStackWithParent();
  const transition = pushPendingAction(parentStack, {
    id: 'account-1',
    type: 'create_account',
    fields: { name: 'Nubank' },
    context: { requestedBy: 'expense-1' },
  }, { now });

  assert.equal(transition.stack.actions[0].status, PENDING_ACTION_STATUS.SUSPENDED);
  assert.equal(transition.activeAction.parentActionId, 'expense-1');
  assert.equal(transition.stack.identity.workspaceId, 'workspace-business');
  assert.deepEqual(transition.stack.actions[0].fields, {
    amount: 50,
    description: 'Almoço',
    accountId: null,
  });
});

test('concluir subação retoma automaticamente a ação anterior no ponto preservado', () => {
  const parentStack = createStackWithParent();
  const childStack = pushPendingAction(parentStack, {
    id: 'account-1',
    type: 'create_account',
    fields: { name: 'Nubank' },
  }, { now }).stack;
  const transition = completePendingAction(
    childStack,
    'account-1',
    { id: 'account-created' },
    { now },
  );

  assert.equal(transition.resumedAction.id, 'expense-1');
  assert.equal(transition.resumedAction.status, PENDING_ACTION_STATUS.PENDING);
  assert.equal(transition.resumedAction.fields.amount, 50);
  assert.equal(
    transition.resumedAction.context.completedDependency.result.id,
    'account-created',
  );
  assert.equal(getActivePendingAction(transition.stack).id, 'expense-1');
});

test('bloqueia duplicação por id e chave de idempotência', () => {
  const stack = createStackWithParent();
  const duplicateId = pushPendingAction(stack, {
    id: 'expense-1',
    type: 'create_expense',
  }, { now });
  const duplicateKey = pushPendingAction(stack, {
    id: 'expense-2',
    type: 'create_expense',
    deduplicationKey: 'expense:operation-1',
  }, { now });

  assert.equal(duplicateId.changed, false);
  assert.equal(duplicateId.reason, 'duplicate');
  assert.equal(duplicateKey.changed, false);
  assert.equal(duplicateKey.stack.actions.length, 1);
});

test('cancelamento isolado retoma pai e cancelamento em cascata encerra o ramo', () => {
  const nested = pushPendingAction(createStackWithParent(), {
    id: 'category-1',
    type: 'create_category',
    fields: { name: 'Alimentação' },
  }, { now }).stack;

  const isolated = cancelPendingAction(nested, 'category-1', { now });
  assert.equal(isolated.resumedAction.id, 'expense-1');
  assert.equal(isolated.stack.actions.length, 1);

  const cascaded = cancelPendingAction(nested, 'category-1', { cascade: true, now });
  assert.equal(cascaded.stack.actions.length, 0);
  assert.deepEqual(
    cascaded.canceledActions.map((action) => action.id),
    ['expense-1', 'category-1'],
  );
});

test('atualização defensiva preserva campos já preenchidos sem mutar a origem', () => {
  const stack = createStackWithParent();
  const originalFields = stack.actions[0].fields;
  const transition = updatePendingAction(stack, 'expense-1', {
    fields: { ...originalFields, accountId: 'account-1' },
  }, { now });

  assert.equal(stack.actions[0].fields.accountId, null);
  assert.equal(transition.action.fields.accountId, 'account-1');
  assert.ok(Object.isFrozen(transition.stack));
  assert.ok(Object.isFrozen(transition.stack.actions[0].fields));
});

test('coordenador executa somente o tipo registrado e propaga retomada', async () => {
  const nested = pushPendingAction(createStackWithParent(), {
    id: 'client-1',
    type: 'create_client',
    fields: { name: 'Cliente exemplo' },
  }, { now }).stack;
  const coordinator = createPendingActionCoordinator({
    create_client: async ({ fields }) => ({ data: { id: 'client-created', ...fields } }),
  });

  const outcome = await coordinator.execute(nested, { now });

  assert.equal(outcome.completedAction.type, 'create_client');
  assert.equal(outcome.resumedAction.id, 'expense-1');
  assert.equal(outcome.error, undefined);
});

test('coordenador mantém falha estruturada na ação ativa', async () => {
  const stack = createStackWithParent();
  const coordinator = createPendingActionCoordinator({
    create_expense: async () => ({ error: { code: 'DEPENDENCY_FAILED' } }),
  });

  const outcome = await coordinator.execute(stack, { now });

  assert.equal(outcome.error.code, 'DEPENDENCY_FAILED');
  assert.equal(outcome.activeAction.status, PENDING_ACTION_STATUS.FAILED);
  assert.equal(validatePendingActionStack(outcome.stack, identity), true);
});

test('confirmação só pode executar a ação no topo da pilha', () => {
  const nested = pushPendingAction(createStackWithParent(), {
    id: 'project-1',
    type: 'create_project',
  }, { now }).stack;

  const parentAttempt = confirmPendingAction(nested, 'expense-1', { now });
  const childAttempt = confirmPendingAction(nested, 'project-1', { now });

  assert.equal(parentAttempt.changed, false);
  assert.equal(parentAttempt.reason, 'not_active');
  assert.equal(childAttempt.activeAction.status, PENDING_ACTION_STATUS.EXECUTING);
});

test('persistência é isolada por usuário, workspace e conversa', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const stack = createStackWithParent();

  assert.equal(savePendingActionStack(identity, stack, storage, 100), true);
  assert.equal(loadPendingActionStack(identity, storage, 101).actions[0].id, 'expense-1');
  assert.equal(loadPendingActionStack({
    ...identity,
    workspaceId: 'workspace-personal',
  }, storage, 101), null);
  assert.equal(loadPendingActionStack(identity, storage, 15 * 60 * 1000 + 101), null);
});

test('armazenamento legado lê snapshot v1 sem apagar a migração gradual', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const key = [
    'uniflow.uni.pending-action.v1',
    identity.userId,
    identity.workspaceId,
    identity.conversationId,
  ].join(':');
  values.set(key, JSON.stringify({
    version: 1,
    expiresAt: 200,
    snapshot: { action: { status: 'ready' } },
  }));

  assert.equal(loadPendingAction(identity, storage, 100).action.status, 'ready');
});

test('validação rejeita identidade divergente e snapshots inválidos', () => {
  const stack = createStackWithParent();

  assert.equal(validatePendingActionStack(stack, identity), true);
  assert.equal(validatePendingActionStack(stack, {
    ...identity,
    workspaceId: 'workspace-personal',
  }), false);
  assert.equal(validatePendingActionStack({ actions: [] }), false);
});
