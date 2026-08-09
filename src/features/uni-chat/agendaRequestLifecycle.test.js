import assert from 'node:assert/strict';
import test from 'node:test';
import { isAgendaRequestContextCurrent } from './agendaRequestLifecycle.js';

const REQUEST_A = {
  turnToken: 7,
  conversationId: 'conversation-a',
  userId: 'user-a',
  workspaceId: 'workspace-a',
};

test('requisição de Agenda só permanece atual com token e identidade completos', () => {
  assert.equal(isAgendaRequestContextCurrent(REQUEST_A, REQUEST_A, 7), true);
});

for (const [label, current, token] of [
  ['turno superseded', REQUEST_A, 8],
  ['outra conversa', { ...REQUEST_A, conversationId: 'conversation-b' }, 7],
  ['outro workspace', { ...REQUEST_A, workspaceId: 'workspace-b' }, 7],
  ['outro usuário', { ...REQUEST_A, userId: 'user-b' }, 7],
]) {
  test(`resultado tardio de Agenda é rejeitado em ${label}`, () => {
    assert.equal(isAgendaRequestContextCurrent(REQUEST_A, current, token), false);
  });
}
