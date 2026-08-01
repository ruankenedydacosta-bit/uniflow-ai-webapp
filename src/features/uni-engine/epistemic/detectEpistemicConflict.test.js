// Testes de detecção de conflitos (Fase 4 — seção 10).
// Itens 24-29: banco vs usuário; banco vs memória; memória vs usuário;
// conflito temporal; conflito de escopo; conflito de identidade.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectEpistemicConflict } from './detectEpistemicConflict.js';
import { createEpistemicItem } from './epistemicContracts.js';
import { getSourcePriority } from './epistemicPolicy.js';

function item(source, { subject, value, lastVerifiedAt = '2026-07-30T00:00:00.000Z', diagnostics = {} } = {}) {
  return createEpistemicItem({
    subject,
    value,
    claimType: 'fact',
    epistemicStatus: 'confirmed',
    confidence: 0.9,
    source,
    sourcePriority: getSourcePriority(source),
    evidence: [],
    lastVerifiedAt,
    diagnostics,
  });
}

test('epistêmico 24: conflito banco vs usuário (user_database_conflict)', () => {
  const snapshot = item('financial_snapshot', { subject: 'balance:account:nubank', value: 480.5 });
  const user = item('user_explicit_statement', { subject: 'balance:account:nubank', value: 1000 });
  const conflicts = detectEpistemicConflict([snapshot, user]);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].type, 'user_database_conflict');
  assert.equal(conflicts[0].recommendedAction, 'ask_user', 'nunca escolhe automaticamente');
});

test('epistêmico 25: conflito banco vs memória (memory_database_conflict)', () => {
  const snapshot = item('financial_snapshot', { subject: 'balance:total', value: 950 });
  const memory = item('persistent_memory', { subject: 'balance:total', value: 1000, lastVerifiedAt: '2026-07-10T00:00:00.000Z' });
  const conflicts = detectEpistemicConflict([snapshot, memory]);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].type, 'memory_database_conflict');
});

test('epistêmico 26: conflito memória vs usuário (user_memory_conflict)', () => {
  const memory = item('persistent_memory', { subject: 'account:principal', value: 'Nubank' });
  const user = item('user_explicit_statement', { subject: 'account:principal', value: 'Caixa' });
  const conflicts = detectEpistemicConflict([memory, user]);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].type, 'user_memory_conflict');
});

test('epistêmico 27: conflito temporal — valor mudou ao longo do tempo', () => {
  const old = item('financial_snapshot', {
    subject: 'balance:total',
    value: 1000,
    lastVerifiedAt: '2026-06-01T00:00:00.000Z',
  });
  const current = item('financial_snapshot', {
    subject: 'balance:total',
    value: 950,
    lastVerifiedAt: '2026-07-30T00:00:00.000Z',
  });
  const conflicts = detectEpistemicConflict([old, current]);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].type, 'temporal_conflict');
});

test('epistêmico 28: conflito de escopo (workspace) — scope_conflict', () => {
  const personal = item('persistent_memory', {
    subject: 'account:principal',
    value: 'Nubank',
    diagnostics: { scope: 'workspace-personal' },
  });
  const business = item('persistent_memory', {
    subject: 'account:principal',
    value: 'Caixa',
    diagnostics: { scope: 'workspace-business' },
  });
  const conflicts = detectEpistemicConflict([personal, business]);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].type, 'scope_conflict');
});

test('epistêmico 29: conflito de identidade — mesma entidade canônica, nomes diferentes', () => {
  const memory = item('persistent_memory', {
    subject: 'account:principal',
    value: 'Nu Conta',
    diagnostics: { canonicalId: 'acc-1' },
  });
  const user = item('user_explicit_statement', {
    subject: 'account:principal',
    value: 'Nubank',
    diagnostics: { canonicalId: 'acc-1' },
  });
  const conflicts = detectEpistemicConflict([memory, user]);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].type, 'identity_conflict');
});

test('epistêmico: valores iguais nunca geram conflito', () => {
  const a = item('financial_snapshot', { subject: 'balance:total', value: 950 });
  const b = item('persistent_memory', { subject: 'balance:total', value: 950 });
  assert.deepEqual(detectEpistemicConflict([a, b]), []);
});

test('epistêmico: conflito genérico de valor quando não há relação de fonte', () => {
  const a = item('conversation_context', { subject: 'category:x', value: 'A' });
  const b = item('deterministic_inference', { subject: 'category:x', value: 'B' });
  const conflicts = detectEpistemicConflict([a, b]);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].type, 'value_conflict');
});
