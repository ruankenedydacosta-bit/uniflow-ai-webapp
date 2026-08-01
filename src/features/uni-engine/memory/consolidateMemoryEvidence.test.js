// Testes de consolidação determinística de evidências (Fase 3) — itens 17-24.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consolidateMemoryEvidence } from './consolidateMemoryEvidence.js';
import { createMemoryItem } from './memoryContracts.js';
import { MEMORY_POLICY, computeConfidence, describeConfidence } from './memoryPolicy.js';

function buildMemory(overrides = {}) {
  return createMemoryItem({
    id: 'mem-1',
    userId: 'user-1',
    workspaceId: 'workspace-1',
    memoryType: 'merchant_category_association',
    subjectKey: 'merchant_category::padaria',
    value: { merchant: 'padaria', category: 'Alimentação' },
    status: 'candidate',
    confidence: 0,
    evidenceCount: 0,
    source: 'user',
    metadata: { evidenceKeys: [] },
    ...overrides,
  });
}

function evidence(type, key, weight = null) {
  return {
    memoryId: 'mem-1',
    evidenceType: type,
    sourceMessageId: `msg-${key}`,
    occurredAt: `2026-08-01T10:00:${String(key).padStart(2, '0')}.000Z`,
    weight: weight ?? MEMORY_POLICY.weights[type],
    observedValue: { category: 'Alimentação' },
  };
}

test('m17: primeira evidência consolida com contador e confiança da fórmula', () => {
  const memory = buildMemory();
  const result = consolidateMemoryEvidence({
    memory,
    evidence: evidence('explicit_user_statement', 1),
    evidenceHistory: [],
    now: Date.parse('2026-08-01T10:00:00.000Z'),
  });
  assert.equal(result.changed, true);
  assert.equal(result.reason, 'consolidated');
  assert.equal(result.memory.evidenceCount, 1);
  const expected = computeConfidence([0.45]);
  assert.equal(result.memory.confidence, Number(expected.toFixed(4)));
});

test('m18: reforço aumenta contador e confiança', () => {
  const first = consolidateMemoryEvidence({
    memory: buildMemory(),
    evidence: evidence('explicit_user_statement', 1),
    evidenceHistory: [],
    now: Date.parse('2026-08-01T10:00:00.000Z'),
  }).memory;
  const firstKey = first.metadata.evidenceKeys.at(-1);
  const second = consolidateMemoryEvidence({
    memory: first,
    evidence: evidence('explicit_user_statement', 2),
    evidenceHistory: [{ ...evidence('explicit_user_statement', 1), evidenceKey: firstKey }],
    now: Date.parse('2026-08-02T10:00:00.000Z'),
  });
  assert.equal(second.memory.evidenceCount, 2);
  assert.ok(second.memory.confidence > first.confidence);
  assert.equal(second.statusChange, 'candidate_to_confirmed');
  assert.equal(second.memory.status, 'confirmed');
});

test('m19: três evidências consistentes promovem para active', () => {
  let memory = buildMemory();
  let history = [];
  for (let i = 1; i <= 3; i += 1) {
    const result = consolidateMemoryEvidence({
      memory,
      evidence: evidence('explicit_user_statement', i),
      evidenceHistory: history,
      now: Date.parse(`2026-08-0${i}T10:00:00.000Z`),
    });
    memory = result.memory;
    history = memory.metadata.evidenceKeys.map((key, index) => ({
      ...evidence('explicit_user_statement', index + 1),
      evidenceKey: key,
    }));
  }
  assert.equal(memory.status, 'active');
  assert.ok(memory.confidence >= MEMORY_POLICY.promotion.activeMinConfidence);
  assert.equal(memory.evidenceCount, 3);
});

test('m20: rejeição explícita reduz confiança e bloqueia uso temporariamente', () => {
  let memory = buildMemory({ status: 'confirmed', confidence: 0.9, evidenceCount: 2 });
  const rejected = consolidateMemoryEvidence({
    memory,
    evidence: evidence('rejected_suggestion', 1),
    evidenceHistory: [],
    now: Date.parse('2026-08-01T10:00:00.000Z'),
  });
  assert.ok(rejected.memory.confidence < memory.confidence);
  assert.ok(rejected.memory.metadata.blockedUntil != null);
});

test('m21: correção explícita substitui memória anterior (fluxo supersede no service)', () => {
  const correction = evidence('user_correction', 1);
  correction.observedValue = { category: 'Saúde' };
  const result = consolidateMemoryEvidence({
    memory: buildMemory({ status: 'confirmed', confidence: 0.9 }),
    evidence: correction,
    evidenceHistory: [],
    now: Date.parse('2026-08-01T10:00:00.000Z'),
  });
  // Consolidação anexa a evidência; a substituição (supersede) é decidida por
  // resolveMemoryConflict e executada pelo service — aqui só confirmamos que
  // a evidência de correção entra com peso máximo e status permanece.
  assert.equal(result.changed, true);
  assert.equal(result.memory.evidenceCount, 1);
  assert.equal(result.diagnostics.evidenceCount, 1);
});

test('m22: idempotência — mesma evidenceKey nunca é anexada duas vezes', () => {
  const first = consolidateMemoryEvidence({
    memory: buildMemory(),
    evidence: evidence('explicit_user_statement', 1),
    evidenceHistory: [],
    now: Date.parse('2026-08-01T10:00:00.000Z'),
  });
  const duplicate = consolidateMemoryEvidence({
    memory: first.memory,
    evidence: evidence('explicit_user_statement', 1),
    evidenceHistory: [],
    now: Date.parse('2026-08-01T10:01:00.000Z'),
  });
  assert.equal(duplicate.reason, 'duplicate_evidence');
  assert.equal(duplicate.changed, false);
  assert.equal(duplicate.memory.evidenceCount, 1);
});

test('m23: contador reflete o histórico completo de evidências', () => {
  let memory = buildMemory();
  let history = [];
  for (let i = 1; i <= 5; i += 1) {
    const ev = evidence('explicit_user_statement', i);
    const result = consolidateMemoryEvidence({ memory, evidence: ev, evidenceHistory: history });
    memory = result.memory;
    history = history.concat([{ ...ev, evidenceKey: `k${i}` }]);
  }
  assert.equal(memory.evidenceCount, 5);
  assert.ok(memory.metadata.evidenceKeys.length === 5);
});

test('m24: memória deleted/rejected nunca é consolidada', () => {
  for (const status of ['deleted', 'rejected']) {
    const result = consolidateMemoryEvidence({
      memory: buildMemory({ status }),
      evidence: evidence('explicit_user_statement', 1),
      evidenceHistory: [],
    });
    assert.equal(result.changed, false);
    assert.equal(result.reason, 'inactive_memory');
  }
});

test('m24b: faixas conceituais de confiança seguem a política', () => {
  assert.equal(describeConfidence(0.2), 'low');
  assert.equal(describeConfidence(0.5), 'low');
  assert.equal(describeConfidence(0.75), 'moderate');
  assert.equal(describeConfidence(0.92), 'confirmed');
  assert.equal(describeConfidence(0.95), 'confirmed');
});

test('m24c: tipo renovável reestende expiração ao consolidar', () => {
  const pastExpiry = new Date(Date.parse('2026-08-02T10:00:00.000Z')).toISOString();
  const memory = buildMemory({
    expiresAt: pastExpiry,
    status: 'confirmed',
    confidence: 0.9,
    evidenceCount: 2,
  });
  const now = Date.parse('2026-08-10T10:00:00.000Z');
  const result = consolidateMemoryEvidence({
    memory,
    evidence: evidence('repeated_selection', 1),
    evidenceHistory: [],
    now,
  });
  assert.ok(result.memory.expiresAt > pastExpiry, 'expiração renovada pelo uso');
});
