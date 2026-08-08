import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AGENDA_OPERATION_STORAGE_KEY,
  clearAgendaOperation,
  clearAgendaOperationByIntent,
  clearAgendaOperationsForOrigin,
  getOrCreateAgendaOperation,
} from './agendaOperationStore.js';

const USER_A = 'user-a';
const USER_B = 'user-b';
const WORKSPACE_A = 'workspace-a';
const WORKSPACE_B = 'workspace-b';
const OP_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OP_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    snapshot: () => values.get(AGENDA_OPERATION_STORAGE_KEY) ?? '[]',
  };
}

const intent = (title = 'Dentista') => ({
  item_type: 'appointment',
  title,
  starts_at: '2026-08-09T18:00:00.000Z',
  ends_at: null,
  is_all_day: false,
});

function scope(overrides = {}) {
  return {
    userId: USER_A,
    workspaceId: WORKSPACE_A,
    origin: 'uni:thread-a',
    intent: intent(),
    ...overrides,
  };
}

test('criação normal persiste somente escopo técnico, hash e UUID', async () => {
  const storage = createStorage();
  const operation = await getOrCreateAgendaOperation({
    ...scope(), storage, createOperationId: () => OP_A,
  });
  const persisted = storage.snapshot();

  assert.equal(operation.clientOperationId, OP_A);
  assert.match(operation.fingerprint, /^sha256:[0-9a-f]{64}$/);
  assert.doesNotMatch(persisted, /Dentista|2026-08-09|title|starts_at|description/i);
  assert.deepEqual(Object.keys(JSON.parse(persisted)[0]).sort(), [
    'clientOperationId', 'fingerprint', 'origin', 'userId', 'workspaceId',
  ]);
});

test('reload e retry da mesma intenção reutilizam o UUID', async () => {
  const storage = createStorage();
  const first = await getOrCreateAgendaOperation({
    ...scope(), storage, createOperationId: () => OP_A,
  });
  const restored = await getOrCreateAgendaOperation({
    ...scope(), storage, createOperationId: () => OP_B,
  });

  assert.equal(restored.clientOperationId, first.clientOperationId);
  assert.equal(restored.restored, true);
});

test('reload antes da confirmação restaura a operação técnica sem persistir payload', async () => {
  const storage = createStorage();
  const partialIntent = { item_type: 'reminder', date: '2026-08-10', time: null };
  await getOrCreateAgendaOperation({
    ...scope({ intent: partialIntent }), storage, createOperationId: () => OP_A,
  });
  const restored = await getOrCreateAgendaOperation({
    ...scope({ intent: partialIntent }), storage, createOperationId: () => OP_B,
  });

  assert.equal(restored.clientOperationId, OP_A);
  assert.doesNotMatch(storage.snapshot(), /2026-08-10|reminder|date|time/);
});

test('duas abas concorrentes convergem na mesma operação', async () => {
  const storage = createStorage();
  const [first, second] = await Promise.all([
    getOrCreateAgendaOperation({ ...scope(), storage, createOperationId: () => OP_A }),
    getOrCreateAgendaOperation({ ...scope(), storage, createOperationId: () => OP_B }),
  ]);

  assert.equal(first.clientOperationId, second.clientOperationId);
  assert.equal(JSON.parse(storage.snapshot()).length, 1);
});

test('sucesso ou cancelamento explícito limpa e nova intenção recebe novo UUID', async () => {
  const storage = createStorage();
  const first = await getOrCreateAgendaOperation({
    ...scope(), storage, createOperationId: () => OP_A,
  });
  assert.equal(await clearAgendaOperation({ ...scope(), storage, clientOperationId: first.clientOperationId }), true);
  const next = await getOrCreateAgendaOperation({
    ...scope(), storage, createOperationId: () => OP_B,
  });

  assert.equal(next.clientOperationId, OP_B);
  assert.notEqual(next.clientOperationId, first.clientOperationId);
});

test('cancelamento explícito também pode limpar pelo fingerprint canônico', async () => {
  const storage = createStorage();
  await getOrCreateAgendaOperation({ ...scope(), storage, createOperationId: () => OP_A });

  assert.equal(await clearAgendaOperationByIntent({ ...scope(), storage }), true);
  assert.equal(storage.snapshot(), '[]');
});

test('cancelamento explícito do formulário limpa operações restauradas da origem', async () => {
  const storage = createStorage();
  await getOrCreateAgendaOperation({ ...scope(), storage, createOperationId: () => OP_A });

  assert.equal(await clearAgendaOperationsForOrigin({ ...scope(), storage }), true);
  assert.equal(storage.snapshot(), '[]');
});

test('timeout não limpa a operação; novo registry após reload restaura UUID', async () => {
  const storage = createStorage();
  await getOrCreateAgendaOperation({ ...scope(), storage, createOperationId: () => OP_A });

  const afterTimeout = await getOrCreateAgendaOperation({
    ...scope(), storage, createOperationId: () => OP_B,
  });
  assert.equal(afterTimeout.clientOperationId, OP_A);
});

test('mesmo payload fica isolado entre usuários e workspaces', async () => {
  const storage = createStorage();
  const operationIds = [OP_A, OP_B, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'];
  const createOperationId = () => operationIds.shift();
  const first = await getOrCreateAgendaOperation({ ...scope(), storage, createOperationId });
  const otherUser = await getOrCreateAgendaOperation({
    ...scope({ userId: USER_B }), storage, createOperationId,
  });
  const otherWorkspace = await getOrCreateAgendaOperation({
    ...scope({ workspaceId: WORKSPACE_B }), storage, createOperationId,
  });

  assert.notEqual(first.clientOperationId, otherUser.clientOperationId);
  assert.notEqual(first.clientOperationId, otherWorkspace.clientOperationId);
});

test('payload divergente produz outro fingerprint e nunca reutiliza a chave implicitamente', async () => {
  const storage = createStorage();
  const first = await getOrCreateAgendaOperation({
    ...scope(), storage, createOperationId: () => OP_A,
  });
  const divergent = await getOrCreateAgendaOperation({
    ...scope({ intent: intent('Fisioterapia') }), storage, createOperationId: () => OP_B,
  });

  assert.notEqual(first.fingerprint, divergent.fingerprint);
  assert.notEqual(first.clientOperationId, divergent.clientOperationId);
});
