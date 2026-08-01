// Testes de temporalidade e desatualização (Fase 4 — seção 11).
// Itens 30-34: saldo antigo stale; transação histórica não expira;
// preferência aging; episódica expira; memória superseded ignorada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateStaleness, stalenessWindowForItem } from './evaluateStaleness.js';
import { createEpistemicItem } from './epistemicContracts.js';
import { runEpistemicVerifier } from './runEpistemicVerifier.js';

const NOW = '2026-07-30T00:00:00.000Z';

function item(subject, { value = 1, lastVerifiedAt = NOW, claimType = 'fact' } = {}) {
  return createEpistemicItem({
    subject,
    value,
    claimType,
    epistemicStatus: 'confirmed',
    confidence: 0.9,
    source: 'financial_snapshot',
    sourcePriority: 1,
    evidence: [],
    lastVerifiedAt,
  });
}

test('epistêmico 30: saldo antigo é stale', () => {
  const balance = item('balance:total', { lastVerifiedAt: '2026-07-15T00:00:00.000Z' });
  const result = evaluateStaleness(balance, NOW);
  assert.equal(result.state, 'stale');
});

test('epistêmico 30b: saldo muito antigo é expired', () => {
  const balance = item('balance:total', { lastVerifiedAt: '2026-01-01T00:00:00.000Z' });
  assert.equal(evaluateStaleness(balance, NOW).state, 'expired');
});

test('epistêmico 31: transação histórica não expira', () => {
  const transaction = item('transaction:mercado', { lastVerifiedAt: '2025-01-01T00:00:00.000Z' });
  const result = evaluateStaleness(transaction, NOW);
  assert.equal(result.state, 'fresh');
  assert.equal(stalenessWindowForItem(transaction), null);
});

test('epistêmico 32: preferência longa entra em aging (ainda não stale)', () => {
  const preference = item('preference:style', { lastVerifiedAt: '2025-12-01T00:00:00.000Z' });
  const result = evaluateStaleness(preference, NOW);
  assert.equal(result.state, 'aging');
});

test('epistêmico 33: contexto episódico expira rápido', () => {
  const episodic = item('episodic:last_topic', { lastVerifiedAt: '2026-07-25T00:00:00.000Z' });
  const result = evaluateStaleness(episodic, NOW);
  assert.equal(result.state, 'expired');
});

test('epistêmico 33b: contexto episódico recente permanece fresh', () => {
  const episodic = item('episodic:last_topic', { lastVerifiedAt: '2026-07-30T00:00:00.000Z' });
  assert.equal(evaluateStaleness(episodic, NOW).state, 'fresh');
});

test('epistêmico 34: memória superseded é ignorada pelo verificador', () => {
  const verifier = runEpistemicVerifier({
    now: NOW,
    session: { userId: 'user-1', workspaceId: 'workspace-1' },
    persistentMemories: [
      {
        id: 'm-superseded',
        userId: 'user-1',
        workspaceId: 'workspace-1',
        memoryType: 'user_declared_fact',
        subjectKey: 'fact::saldo',
        value: { totalBalance: 1000 },
        status: 'superseded',
        supersededBy: 'm-2',
        confidence: 0.9,
        lastSeenAt: '2026-07-10T00:00:00.000Z',
        firstSeenAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'm-active',
        userId: 'user-1',
        workspaceId: 'workspace-1',
        memoryType: 'user_declared_fact',
        subjectKey: 'fact::saldo',
        value: { totalBalance: 950 },
        status: 'active',
        confidence: 0.9,
        lastSeenAt: '2026-07-29T00:00:00.000Z',
        firstSeenAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    plan: null,
  });
  assert.equal(verifier.diagnostics.memoryCount, 1, 'superseded não entra como evidência');
  const subjects = verifier.items.map((entry) => entry.subject);
  assert.ok(subjects.includes('balance:total'));
});

test('epistêmico: memória expirada e contestada também são excluídas', () => {
  const verifier = runEpistemicVerifier({
    now: NOW,
    session: { userId: 'user-1', workspaceId: 'workspace-1' },
    persistentMemories: [
      { id: 'm1', userId: 'user-1', workspaceId: 'workspace-1', subjectKey: 'fact::a', value: { x: 1 }, status: 'contested', confidence: 0.5 },
      { id: 'm2', userId: 'user-1', workspaceId: 'workspace-1', subjectKey: 'fact::b', value: { x: 2 }, status: 'expired', confidence: 0.5 },
      { id: 'm3', userId: 'user-1', workspaceId: 'workspace-1', subjectKey: 'fact::c', value: { x: 3 }, status: 'candidate', confidence: 0.3 },
    ],
    plan: null,
  });
  assert.equal(verifier.diagnostics.memoryCount, 1, 'apenas candidata entra (peso baixo)');
});

test('epistêmico: memória antiga vira stale mas não some do modelo', () => {
  const verifier = runEpistemicVerifier({
    now: NOW,
    session: { userId: 'user-1', workspaceId: 'workspace-1' },
    persistentMemories: [
      {
        id: 'm-old',
        userId: 'user-1',
        workspaceId: 'workspace-1',
        memoryType: 'user_declared_fact',
        subjectKey: 'fact::saldo',
        value: { totalBalance: 1000 },
        status: 'active',
        confidence: 0.9,
        lastSeenAt: '2026-05-01T00:00:00.000Z',
        firstSeenAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    plan: null,
  });
  const memoryItem = verifier.items.find((entry) => entry.source === 'persistent_memory');
  assert.ok(memoryItem);
  assert.equal(memoryItem.epistemicStatus, 'stale');
  assert.ok(verifier.staleItems.some((entry) => entry.subject === memoryItem.subject));
});
