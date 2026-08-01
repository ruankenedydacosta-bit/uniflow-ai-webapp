// Testes de recuperação e ranking determinístico (Fase 3) — itens 39-45.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retrieveRelevantMemories } from './retrieveRelevantMemories.js';
import { createMemoryItem } from './memoryContracts.js';

const NOW = Date.parse('2026-08-01T10:00:00.000Z');

function memory(overrides = {}) {
  return createMemoryItem({
    id: overrides.id ?? 'mem-x',
    userId: 'user-1',
    workspaceId: 'workspace-1',
    memoryType: overrides.memoryType ?? 'merchant_category_association',
    subjectKey: overrides.subjectKey ?? 'merchant_category::padaria',
    value: { merchant: 'padaria', category: 'Alimentação' },
    status: overrides.status ?? 'active',
    confidence: overrides.confidence ?? 0.8,
    evidenceCount: overrides.evidenceCount ?? 3,
    source: 'user',
    lastSeenAt: overrides.lastSeenAt ?? new Date(NOW).toISOString(),
    expiresAt: overrides.expiresAt ?? null,
    ...overrides,
  });
}

test('m39: subjectKey exata (merchant presente na mensagem) vem primeiro', () => {
  const result = retrieveRelevantMemories({
    memories: [
      memory({ id: 'a', subjectKey: 'account::nubank', memoryType: 'account_preference' }),
      memory({ id: 'b', subjectKey: 'merchant_category::padaria' }),
    ],
    message: 'gastei na padaria hoje',
    now: NOW,
  });
  assert.equal(result.memories[0].subjectKey, 'merchant_category::padaria');
});

test('m40: status ativo vem antes de candidato quando o resto empata', () => {
  const result = retrieveRelevantMemories({
    memories: [
      memory({ id: 'a', status: 'candidate', confidence: 0.5 }),
      memory({ id: 'b', status: 'active', confidence: 0.5 }),
    ],
    message: 'gastei na padaria',
    now: NOW,
  });
  assert.equal(result.memories[0].id, 'b');
});

test('m41: confiança maior vence em empate de sujeito/status', () => {
  const result = retrieveRelevantMemories({
    memories: [
      memory({ id: 'a', confidence: 0.9 }),
      memory({ id: 'b', confidence: 0.6 }),
    ],
    message: 'padaria',
    now: NOW,
  });
  assert.equal(result.memories[0].id, 'a');
});

test('m42: recência favorece memória mais recente', () => {
  const result = retrieveRelevantMemories({
    memories: [
      memory({ id: 'a', lastSeenAt: '2026-07-01T10:00:00.000Z' }),
      memory({ id: 'b', lastSeenAt: '2026-07-30T10:00:00.000Z' }),
    ],
    message: 'padaria',
    now: NOW,
  });
  assert.equal(result.memories[0].id, 'b');
});

test('m43: mais evidências vencem em empate de sujeito/status/confiança', () => {
  const result = retrieveRelevantMemories({
    memories: [
      memory({ id: 'a', evidenceCount: 2 }),
      memory({ id: 'b', evidenceCount: 5 }),
    ],
    message: 'padaria',
    now: NOW,
  });
  assert.equal(result.memories[0].id, 'b');
});

test('m44: limite é respeitado e nunca entrega tudo', () => {
  const memories = Array.from({ length: 20 }, (_, index) => memory({ id: `mem-${index}` }));
  const result = retrieveRelevantMemories({ memories, message: 'padaria', limit: 3, now: NOW });
  assert.equal(result.memories.length, 3);
  assert.equal(result.diagnostics.evaluated, 20);
  assert.equal(result.diagnostics.limit, 3);
});

test('m45: memórias conflitantes/indesejadas são excluídas', () => {
  const result = retrieveRelevantMemories({
    memories: [
      memory({ id: 'a', status: 'contested' }),
      memory({ id: 'b', status: 'superseded' }),
      memory({ id: 'c', status: 'deleted' }),
      memory({ id: 'd', status: 'rejected' }),
      memory({ id: 'e', status: 'expired', expiresAt: '2026-07-01T10:00:00.000Z' }),
      memory({ id: 'f', status: 'active' }),
    ],
    message: 'padaria',
    now: NOW,
  });
  assert.deepEqual(result.memories.map((item) => item.id), ['f']);
  assert.equal(result.diagnostics.excludedInactive, 4);
  assert.equal(result.diagnostics.excludedExpired, 1);
});

test('m25: memória expirada não é recuperada', () => {
  const result = retrieveRelevantMemories({
    memories: [
      memory({ id: 'expired-1', expiresAt: '2026-07-01T10:00:00.000Z' }),
      memory({ id: 'ok-1', expiresAt: '2027-01-01T10:00:00.000Z' }),
    ],
    message: 'padaria',
    now: NOW,
  });
  assert.deepEqual(result.memories.map((item) => item.id), ['ok-1']);
});

test('m45b: saída é sempre serializável e sem funções', () => {
  const result = retrieveRelevantMemories({
    memories: [memory({ id: 'a' })],
    message: 'padaria',
    now: NOW,
  });
  assert.doesNotThrow(() => JSON.stringify(result));
  assert.equal(result.memories[0].subjectKey, 'merchant_category::padaria');
});
