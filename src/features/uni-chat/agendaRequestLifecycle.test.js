import assert from 'node:assert/strict';
import test from 'node:test';
import {
  invalidateAgendaRequestContext,
  isAgendaRequestContextCurrent,
} from './agendaRequestLifecycle.js';

const REQUEST_A = {
  turnToken: 7,
  conversationId: 'conversation-a',
  userId: 'user-a',
  workspaceId: 'workspace-a',
  mode: 'pessoal',
};

test('requisição de Agenda só permanece atual com token e identidade completos', () => {
  assert.equal(isAgendaRequestContextCurrent(REQUEST_A, REQUEST_A, 7), true);
});

for (const [label, current, token] of [
  ['turno superseded', REQUEST_A, 8],
  ['outra conversa', { ...REQUEST_A, conversationId: 'conversation-b' }, 7],
  ['outro workspace', { ...REQUEST_A, workspaceId: 'workspace-b' }, 7],
  ['outro usuário', { ...REQUEST_A, userId: 'user-b' }, 7],
  ['outro modo', { ...REQUEST_A, mode: 'empresa' }, 7],
]) {
  test(`resultado tardio de Agenda é rejeitado em ${label}`, () => {
    assert.equal(isAgendaRequestContextCurrent(REQUEST_A, current, token), false);
  });
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

for (const [label, changes] of [
  ['novo chat', { conversationId: 'conversation-b' }],
  ['troca de conversa', { conversationId: 'conversation-c' }],
  ['troca de modo', { mode: 'empresa' }],
  ['troca de workspace', { workspaceId: 'workspace-b' }],
]) {
  test(`Promise controlada não publica Agenda tardia após ${label}`, async () => {
    const turnTokenRef = { current: REQUEST_A.turnToken };
    const contextRef = { current: { ...REQUEST_A } };
    const pending = deferred();
    const published = [];

    const settle = pending.promise.then((value) => {
      if (isAgendaRequestContextCurrent(REQUEST_A, contextRef.current, turnTokenRef.current)) {
        published.push(value);
      }
    });

    invalidateAgendaRequestContext({ turnTokenRef, contextRef }, changes);
    pending.resolve('resultado antigo');
    await settle;

    assert.deepEqual(published, []);
  });
}

test('respostas A/B fora de ordem publicam somente a operação ainda proprietária do contexto', async () => {
  const turnTokenRef = { current: 10 };
  const contextRef = { current: { ...REQUEST_A, turnToken: undefined } };
  const requestA = { ...contextRef.current, turnToken: 10 };
  const a = deferred();
  const b = deferred();
  const published = [];

  const settleA = a.promise.then((value) => {
    if (isAgendaRequestContextCurrent(requestA, contextRef.current, turnTokenRef.current)) published.push(value);
  });
  invalidateAgendaRequestContext({ turnTokenRef, contextRef }, {});
  const requestB = { ...contextRef.current, turnToken: turnTokenRef.current };
  const settleB = b.promise.then((value) => {
    if (isAgendaRequestContextCurrent(requestB, contextRef.current, turnTokenRef.current)) published.push(value);
  });

  b.resolve('B');
  a.resolve('A');
  await Promise.all([settleA, settleB]);

  assert.deepEqual(published, ['B']);
});

test('invalidação é síncrona no mesmo tick e atualiza o activeIdRef quando aplicável', () => {
  const turnTokenRef = { current: 2 };
  const activeIdRef = { current: 'conversation-a' };
  const contextRef = { current: { ...REQUEST_A } };

  const nextToken = invalidateAgendaRequestContext(
    { turnTokenRef, activeIdRef, contextRef },
    { conversationId: 'conversation-b', mode: 'empresa' },
  );

  assert.equal(nextToken, 3);
  assert.equal(turnTokenRef.current, 3);
  assert.equal(activeIdRef.current, 'conversation-b');
  assert.deepEqual(contextRef.current, {
    ...REQUEST_A,
    conversationId: 'conversation-b',
    mode: 'empresa',
  });
});
