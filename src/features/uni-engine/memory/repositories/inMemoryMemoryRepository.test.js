// Testes do repositório em memória (Fase 3) — itens 30-38, 46-47.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInMemoryMemoryRepository } from './inMemoryMemoryRepository.js';

const USER_A = { userId: 'user-a', workspaceId: 'workspace-a' };
const USER_B = { userId: 'user-b', workspaceId: 'workspace-b' };

function candidate(scope = USER_A, overrides = {}) {
  return {
    ...scope,
    memoryType: 'merchant_category_association',
    subjectKey: 'merchant_category::padaria',
    value: { merchant: 'padaria', category: 'Alimentação' },
    normalizedValue: 'merchant=padaria;category=alimentacao',
    status: 'candidate',
    confidence: 0.64,
    evidenceCount: 1,
    source: 'user',
    ...overrides,
  };
}

test('m30: criar candidato persiste e devolve item com id', () => {
  const repo = createInMemoryMemoryRepository();
  const { data, error } = repo.createCandidate(candidate());
  assert.equal(error, null);
  assert.ok(data.id);
  assert.equal(data.memoryType, 'merchant_category_association');
  assert.equal(data.status, 'candidate');
});

test('m31: atualizar memória altera status/confiança', () => {
  const repo = createInMemoryMemoryRepository();
  const created = repo.createCandidate(candidate()).data;
  const updated = repo.updateMemory(USER_A, created.id, { status: 'confirmed', confidence: 0.9 });
  assert.equal(updated.error, null);
  assert.equal(updated.data.status, 'confirmed');
  assert.equal(updated.data.confidence, 0.9);
});

test('m32: recuperar por id e por sujeito', () => {
  const repo = createInMemoryMemoryRepository();
  const created = repo.createCandidate(candidate()).data;
  const byId = repo.getById(USER_A, created.id);
  assert.equal(byId.data.id, created.id);
  const bySubject = repo.findBySubject(USER_A, 'merchant_category::padaria');
  assert.equal(bySubject.data.length, 1);
  assert.equal(bySubject.data[0].id, created.id);
});

test('m33: filtrar por usuário isola completamente usuário B', () => {
  const repo = createInMemoryMemoryRepository();
  repo.createCandidate(candidate(USER_A));
  repo.createCandidate(candidate(USER_B, { subjectKey: 'merchant_category::padaria' }));
  const forA = repo.findRelevant(USER_A);
  assert.equal(forA.data.length, 1);
  assert.equal(forA.data[0].userId, 'user-a');
  const forB = repo.findRelevant(USER_B);
  assert.equal(forB.data.length, 1);
  assert.equal(forB.data[0].userId, 'user-b');
});

test('m34: filtrar por workspace isola workspaces do mesmo usuário', () => {
  const repo = createInMemoryMemoryRepository();
  const personal = { userId: 'user-a', workspaceId: 'workspace-personal' };
  const business = { userId: 'user-a', workspaceId: 'workspace-business' };
  repo.createCandidate(candidate(personal));
  repo.createCandidate(candidate(business, { subjectKey: 'merchant_category::mercado' }));
  const personalOnly = repo.findRelevant(personal);
  assert.deepEqual(personalOnly.data.map((item) => item.subjectKey), ['merchant_category::padaria']);
});

test('m35: esquecer marca deleted e remove da recuperação', () => {
  const repo = createInMemoryMemoryRepository();
  const created = repo.createCandidate(candidate()).data;
  const forgotten = repo.forget(USER_A, created.id);
  assert.equal(forgotten.data.status, 'deleted');
  const relevant = repo.findRelevant(USER_A);
  assert.equal(relevant.data.length, 0);
});

test('m36: apagar todas do usuário', () => {
  const repo = createInMemoryMemoryRepository();
  repo.createCandidate(candidate(USER_A));
  repo.createCandidate(candidate(USER_A, { subjectKey: 'merchant_category::mercado' }));
  repo.createCandidate(candidate(USER_B));
  const removed = repo.deleteAllForUser('user-a');
  assert.equal(removed.data.removed, 2);
  assert.equal(repo.findRelevant(USER_A).data.length, 0);
  assert.equal(repo.findRelevant(USER_B).data.length, 1);
});

test('m37: erro tratado — escopo ausente e memória fora do escopo', () => {
  const repo = createInMemoryMemoryRepository();
  const noScope = repo.createCandidate(candidate({ userId: null, workspaceId: 'w' }));
  assert.ok(noScope.error);
  assert.equal(noScope.error.code, 'MEMORY_USER_ID_REQUIRED');
  const created = repo.createCandidate(candidate(USER_A)).data;
  const wrongScope = repo.getById(USER_B, created.id);
  assert.ok(wrongScope.error);
  assert.equal(wrongScope.error.code, 'MEMORY_SCOPE_MISMATCH');
});

test('m38: concorrência básica — criações sequenciais mantêm contagem correta', () => {
  const repo = createInMemoryMemoryRepository();
  const created = [1, 2, 3].map(() => repo.createCandidate(candidate()).data);
  assert.equal(new Set(created.map((item) => item.id)).size, 3);
  assert.equal(repo.findRelevant(USER_A).data.length, 3);
});

test('m38b: evidência duplicada é bloqueada por evidenceKey', () => {
  const repo = createInMemoryMemoryRepository();
  const created = repo.createCandidate(candidate()).data;
  const evidence = {
    memoryId: created.id,
    userId: USER_A.userId,
    workspaceId: USER_A.workspaceId,
    evidenceType: 'explicit_user_statement',
    sourceMessageId: 'msg-1',
    weight: 0.45,
    occurredAt: '2026-08-01T10:00:00.000Z',
  };
  const first = repo.appendEvidence(evidence);
  assert.equal(first.error, null);
  const duplicate = repo.appendEvidence(evidence);
  assert.ok(duplicate.error);
  assert.equal(duplicate.error.code, 'MEMORY_EVIDENCE_DUPLICATE');
  const list = repo.listEvidence(USER_A, created.id);
  assert.equal(list.data.length, 1);
});

test('m38c: supersede exige supersededBy não nulo', () => {
  const repo = createInMemoryMemoryRepository();
  const oldItem = repo.createCandidate(candidate()).data;
  const replacement = repo.createCandidate(candidate(USER_A, {
    subjectKey: 'merchant_category::padaria',
    value: { merchant: 'padaria', category: 'Saúde' },
  })).data;
  const result = repo.supersede(USER_A, oldItem.id, replacement.id);
  assert.equal(result.error, null);
  assert.equal(result.data.status, 'superseded');
  assert.equal(result.data.supersededBy, replacement.id);
  assert.equal(result.data.confirmedAt, null);
});
