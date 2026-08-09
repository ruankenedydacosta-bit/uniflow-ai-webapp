import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAgendaFormSubmissionLifecycle,
  runOwnedAgendaPreOperation,
} from './agendaFormSubmissionLifecycle.js';

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

for (const transition of ['cancelar', 'fechar', 'Escape', 'unmount']) {
  test(`${transition} durante pre-operation impede a mutation`, async () => {
    const lifecycle = createAgendaFormSubmissionLifecycle();
    const owner = lifecycle.begin();
    const prepared = deferred();
    const mutations = [];
    const cleaned = [];
    const running = runOwnedAgendaPreOperation({
      lifecycle,
      owner,
      prepare: () => prepared.promise,
      mutate: async (operation) => { mutations.push(operation); return { data: {} }; },
      onCancelledPrepared: async (operation) => { cleaned.push(operation); },
    });

    lifecycle.invalidate(transition);
    prepared.resolve({ clientOperationId: 'operation-a' });
    const result = await running;

    assert.equal(result.status, 'cancelled');
    assert.deepEqual(mutations, []);
    assert.deepEqual(cleaned, [{ clientOperationId: 'operation-a' }]);
  });
}

test('operação antiga não interfere em novo formulário aberto no mesmo tick', async () => {
  const lifecycle = createAgendaFormSubmissionLifecycle();
  const oldOwner = lifecycle.begin();
  const oldPrepared = deferred();
  const oldMutations = [];
  const oldRun = runOwnedAgendaPreOperation({
    lifecycle,
    owner: oldOwner,
    prepare: () => oldPrepared.promise,
    mutate: async (operation) => { oldMutations.push(operation); },
  });

  lifecycle.invalidate('close');
  const newOwner = lifecycle.begin();
  const newMutations = [];
  const newRun = runOwnedAgendaPreOperation({
    lifecycle,
    owner: newOwner,
    prepare: async () => ({ clientOperationId: 'operation-new' }),
    mutate: async (operation) => { newMutations.push(operation); return { data: {} }; },
  });

  oldPrepared.resolve({ clientOperationId: 'operation-old' });
  const [oldResult, newResult] = await Promise.all([oldRun, newRun]);

  assert.equal(oldResult.status, 'cancelled');
  assert.equal(newResult.status, 'settled');
  assert.deepEqual(oldMutations, []);
  assert.deepEqual(newMutations, [{ clientOperationId: 'operation-new' }]);
});

test('resultado da mutation é superseded quando owner muda durante o segundo await', async () => {
  const lifecycle = createAgendaFormSubmissionLifecycle();
  const owner = lifecycle.begin();
  const mutation = deferred();
  const running = runOwnedAgendaPreOperation({
    lifecycle,
    owner,
    prepare: async () => ({ clientOperationId: 'operation-a' }),
    mutate: () => mutation.promise,
  });

  await Promise.resolve();
  lifecycle.invalidate('unmount');
  mutation.resolve({ data: { id: 'agenda-a' } });

  assert.deepEqual(await running, {
    status: 'superseded',
    prepared: { clientOperationId: 'operation-a' },
    result: { data: { id: 'agenda-a' } },
  });
});
