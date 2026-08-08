import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AGENDA_OPERATION_STORAGE_KEY,
  clearAgendaOperation,
  getCurrentAgendaOperation,
  getOrCreateAgendaOperation,
} from './agendaOperationStore.js';

const USER_A = 'user-a';
const USER_B = 'user-b';
const WORKSPACE_A = 'workspace-a';
const WORKSPACE_B = 'workspace-b';
const OP_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OP_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function createStorage({ failRead = false, failWrite = false, corruptReadback = false } = {}) {
  const values = new Map();
  let wrote = false;
  return {
    getItem(key) {
      if (failRead) throw new Error('read blocked');
      const value = values.get(key) ?? null;
      if (corruptReadback && wrote && value) return `${value.slice(0, -1)},`;
      return value;
    },
    setItem(key, value) {
      if (failWrite) throw new Error('write blocked');
      values.set(key, value);
      wrote = true;
    },
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

test('operação explícita persiste somente estrutura técnica mínima', async () => {
  const storage = createStorage();
  const operation = await getOrCreateAgendaOperation({
    ...scope(), storage, createOperationId: () => OP_A,
  });
  const persisted = storage.snapshot();

  assert.equal(operation.clientOperationId, OP_A);
  assert.equal(operation.state, 'pending');
  assert.match(operation.fingerprint, /^sha256:[0-9a-f]{64}$/);
  assert.doesNotMatch(persisted, /Dentista|2026-08-09|title|starts_at|description/i);
  assert.deepEqual(Object.keys(JSON.parse(persisted)[0]).sort(), [
    'clientOperationId', 'fingerprint', 'origin', 'state', 'userId', 'workspaceId',
  ]);
});

test('reload da mesma aba reutiliza UUID da operação atual', async () => {
  const storage = createStorage();
  await getOrCreateAgendaOperation({ ...scope(), storage, createOperationId: () => OP_A });
  const restored = await getOrCreateAgendaOperation({
    ...scope(), storage, createOperationId: () => OP_B,
  });

  assert.equal(restored.clientOperationId, OP_A);
  assert.equal(restored.restored, true);
});

test('duas abas com payload idêntico recebem UUIDs independentes', async () => {
  const tabA = createStorage();
  const tabB = createStorage();
  const [first, second] = await Promise.all([
    getOrCreateAgendaOperation({ ...scope(), storage: tabA, createOperationId: () => OP_A }),
    getOrCreateAgendaOperation({ ...scope(), storage: tabB, createOperationId: () => OP_B }),
  ]);

  assert.equal(first.clientOperationId, OP_A);
  assert.equal(second.clientOperationId, OP_B);
});

test('duas chamadas simultâneas na mesma aba compartilham a operação', async () => {
  const storage = createStorage();
  const [first, second] = await Promise.all([
    getOrCreateAgendaOperation({ ...scope(), storage, createOperationId: () => OP_A }),
    getOrCreateAgendaOperation({ ...scope(), storage, createOperationId: () => OP_B }),
  ]);

  assert.equal(first.clientOperationId, OP_A);
  assert.equal(second.clientOperationId, OP_A);
  assert.equal(JSON.parse(storage.snapshot()).length, 1);
});

test('Web Locks ausente não altera a segurança do mutex da aba', async () => {
  assert.doesNotMatch(
    await import('node:fs/promises').then(({ readFile }) => readFile(new URL('./agendaOperationStore.js', import.meta.url), 'utf8')),
    /navigator\.locks|Web Locks|localStorage/,
  );
});

test('fingerprint divergente valida e bloqueia reuso implícito da operação', async () => {
  const storage = createStorage();
  await getOrCreateAgendaOperation({ ...scope(), storage, createOperationId: () => OP_A });

  await assert.rejects(
    getOrCreateAgendaOperation({ ...scope({ intent: intent('Fisioterapia') }), storage }),
    { code: 'AGENDA_OPERATION_PAYLOAD_CONFLICT' },
  );
});

test('evolução explícita do mesmo fluxo preserva UUID e atualiza apenas o hash', async () => {
  const storage = createStorage();
  const partial = await getOrCreateAgendaOperation({
    ...scope({ intent: { item_type: 'reminder', date: '2026-08-10' } }),
    storage,
    createOperationId: () => OP_A,
  });
  const complete = await getOrCreateAgendaOperation({
    ...scope(), storage, preferredOperationId: partial.clientOperationId,
  });

  assert.equal(complete.clientOperationId, OP_A);
  assert.notEqual(complete.fingerprint, partial.fingerprint);
});

test('limpeza remove somente a operação específica', async () => {
  const storage = createStorage();
  await getOrCreateAgendaOperation({ ...scope(), storage, createOperationId: () => OP_A });
  await getOrCreateAgendaOperation({
    ...scope({ origin: 'agenda-form' }), storage, createOperationId: () => OP_B,
  });

  assert.equal(await clearAgendaOperation({
    ...scope(), storage, clientOperationId: OP_A,
  }), true);
  assert.equal(JSON.parse(storage.snapshot()).length, 1);
  assert.equal((await getCurrentAgendaOperation({
    ...scope({ origin: 'agenda-form' }), storage,
  })).clientOperationId, OP_B);
});

test('cancelamento na aba A não remove a operação da aba B', async () => {
  const tabA = createStorage();
  const tabB = createStorage();
  await getOrCreateAgendaOperation({ ...scope(), storage: tabA, createOperationId: () => OP_A });
  await getOrCreateAgendaOperation({ ...scope(), storage: tabB, createOperationId: () => OP_B });

  await clearAgendaOperation({ ...scope(), storage: tabA, clientOperationId: OP_A });
  assert.equal(await getCurrentAgendaOperation({ ...scope(), storage: tabA }), null);
  assert.equal((await getCurrentAgendaOperation({ ...scope(), storage: tabB })).clientOperationId, OP_B);
});

test('isolamento por usuário e workspace cria operações distintas', async () => {
  const storage = createStorage();
  const ids = [OP_A, OP_B, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'];
  const createOperationId = () => ids.shift();
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

for (const [name, storage] of [
  ['storage indisponível', null],
  ['falha de leitura', createStorage({ failRead: true })],
  ['falha de escrita', createStorage({ failWrite: true })],
  ['falha no readback', createStorage({ corruptReadback: true })],
]) {
  test(`${name} falha fechado`, async () => {
    await assert.rejects(
      getOrCreateAgendaOperation({ ...scope(), storage, createOperationId: () => OP_A }),
      { code: 'AGENDA_OPERATION_STORAGE_UNAVAILABLE' },
    );
  });
}
