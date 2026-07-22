import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveWorkspaceRole, RESTRICTIVE_ROLE_STATE } from './workspaceRoleUtils.js';

test('owner e reconhecido por owner_user_id, mesmo sem linha em workspace_members', () => {
  const result = deriveWorkspaceRole({ ownerUserId: 'user-1', userId: 'user-1', membership: null });
  assert.equal(result.role, 'owner');
  assert.equal(result.isOwner, true);
  assert.equal(result.isAdmin, false);
  assert.equal(result.canUpdate, true);
  assert.equal(result.canDelete, true);
});

test('admin (membership ativa) pode atualizar e excluir', () => {
  const result = deriveWorkspaceRole({
    ownerUserId: 'owner-1',
    userId: 'user-2',
    membership: { role: 'admin', status: 'active' },
  });
  assert.equal(result.role, 'admin');
  assert.equal(result.isAdmin, true);
  assert.equal(result.isOwner, false);
  assert.equal(result.canUpdate, true);
  assert.equal(result.canDelete, true);
});

test('member (membership ativa) pode atualizar, mas nao excluir', () => {
  const result = deriveWorkspaceRole({
    ownerUserId: 'owner-1',
    userId: 'user-3',
    membership: { role: 'member', status: 'active' },
  });
  assert.equal(result.role, 'member');
  assert.equal(result.canUpdate, true);
  assert.equal(result.canDelete, false);
});

test('viewer (membership ativa) nao pode atualizar nem excluir', () => {
  const result = deriveWorkspaceRole({
    ownerUserId: 'owner-1',
    userId: 'user-4',
    membership: { role: 'viewer', status: 'active' },
  });
  assert.equal(result.role, 'viewer');
  assert.equal(result.canUpdate, false);
  assert.equal(result.canDelete, false);
});

test('role desconhecida (fora do enum real) e restritiva, nao lanca excecao', () => {
  const result = deriveWorkspaceRole({
    ownerUserId: 'owner-1',
    userId: 'user-5',
    membership: { role: 'super_admin', status: 'active' },
  });
  assert.equal(result.canUpdate, false);
  assert.equal(result.canDelete, false);
});

test('sem membership (null) e sem ser owner: restritivo', () => {
  const result = deriveWorkspaceRole({ ownerUserId: 'owner-1', userId: 'user-6', membership: null });
  assert.equal(result.role, null);
  assert.equal(result.canUpdate, false);
  assert.equal(result.canDelete, false);
});

test('membership com status inativo (invited/disabled) e tratada como sem role, mesmo com role admin', () => {
  const invited = deriveWorkspaceRole({
    ownerUserId: 'owner-1',
    userId: 'user-7',
    membership: { role: 'admin', status: 'invited' },
  });
  assert.equal(invited.role, null);
  assert.equal(invited.canUpdate, false);
  assert.equal(invited.canDelete, false);

  const disabled = deriveWorkspaceRole({
    ownerUserId: 'owner-1',
    userId: 'user-8',
    membership: { role: 'owner', status: 'disabled' },
  });
  assert.equal(disabled.role, null);
  assert.equal(disabled.canUpdate, false);
  assert.equal(disabled.canDelete, false);
});

test('membership com formato inesperado (sem status/role) nao lanca excecao e e restritiva', () => {
  assert.doesNotThrow(() => deriveWorkspaceRole({ ownerUserId: 'owner-1', userId: 'user-9', membership: {} }));
  const result = deriveWorkspaceRole({ ownerUserId: 'owner-1', userId: 'user-9', membership: {} });
  assert.equal(result.canUpdate, false);
  assert.equal(result.canDelete, false);
});

test('chamada sem nenhum argumento nao lanca excecao e e restritiva', () => {
  assert.doesNotThrow(() => deriveWorkspaceRole());
  const result = deriveWorkspaceRole();
  assert.equal(result.canUpdate, false);
  assert.equal(result.canDelete, false);
});

test('RESTRICTIVE_ROLE_STATE e o estado padrao sem permissao alguma', () => {
  assert.equal(RESTRICTIVE_ROLE_STATE.role, null);
  assert.equal(RESTRICTIVE_ROLE_STATE.isOwner, false);
  assert.equal(RESTRICTIVE_ROLE_STATE.isAdmin, false);
  assert.equal(RESTRICTIVE_ROLE_STATE.canUpdate, false);
  assert.equal(RESTRICTIVE_ROLE_STATE.canDelete, false);
});
