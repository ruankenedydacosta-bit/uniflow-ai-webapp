// Testes de conflito, deduplicação e avaliação de candidatos (Fase 8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectLearningConflict, isValidConflictType } from './detectLearningConflict.js';
import { deduplicateLearningCandidates } from './deduplicateLearningCandidates.js';
import { evaluateLearningCandidate } from './evaluateLearningCandidate.js';

const NOW = Date.parse('2026-08-01T00:00:00.000Z');

function makeCandidate(overrides = {}) {
  return {
    candidateId: `cand_${Math.random().toString(36).slice(2, 10)}`,
    type: 'CATEGORY_PREFERENCE',
    subjectKey: 'category::saude',
    normalizedValue: 'saúde',
    confidence: 0.71,
    risk: 'NONE',
    status: 'DETECTED',
    createdAt: new Date(NOW - 1000).toISOString(),
    expiresAt: new Date(NOW + 100000).toISOString(),
    evidence: [],
    restrictions: [],
    shadow: { applied: false, persisted: false, changedBehavior: false },
    ...overrides,
  };
}

test('conflito: mesmo subjectKey com valores diferentes', () => {
  const conflicts = detectLearningConflict({
    candidates: [
      makeCandidate({ candidateId: 'a', normalizedValue: 'alimentação' }),
      makeCandidate({ candidateId: 'b', normalizedValue: 'saúde' }),
    ],
  });
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].type, 'VALUE_CONFLICT');
  assert.equal(conflicts[0].recommendedAction, 'CONFIRM_PREFERENCE_WITH_USER');
});

test('conflito: mesmo valor não gera conflito', () => {
  const conflicts = detectLearningConflict({
    candidates: [
      makeCandidate({ candidateId: 'a', normalizedValue: 'saúde' }),
      makeCandidate({ candidateId: 'b', normalizedValue: 'saúde' }),
    ],
  });
  assert.deepEqual(conflicts, []);
});

test('conflito: subjectKeys diferentes não geram conflito', () => {
  const conflicts = detectLearningConflict({
    candidates: [
      makeCandidate({ candidateId: 'a', subjectKey: 'category::saude' }),
      makeCandidate({ candidateId: 'b', subjectKey: 'category::mercado' }),
    ],
  });
  assert.deepEqual(conflicts, []);
});

test('conflito: entrada vazia retorna lista vazia', () => {
  assert.deepEqual(detectLearningConflict({}), []);
  assert.deepEqual(detectLearningConflict(null), []);
});

test('conflito: tipo válido é aceito, inválido é rejeitado', () => {
  assert.equal(isValidConflictType('VALUE_CONFLICT'), true);
  assert.equal(isValidConflictType('TEMP_CONFLICT'), false);
});

test('deduplicação: candidatos idênticos dentro da janela são mesclados', () => {
  const { deduplicated, removed } = deduplicateLearningCandidates({
    candidates: [
      makeCandidate({ candidateId: 'a', evidence: [{}] }),
      makeCandidate({ candidateId: 'b', evidence: [{}] }),
    ],
  });
  assert.equal(deduplicated.length, 1);
  assert.equal(removed.length, 1);
  assert.equal(deduplicated[0].evidence.length, 2);
});

test('deduplicação: mantém o mais confiante', () => {
  const { deduplicated } = deduplicateLearningCandidates({
    candidates: [
      makeCandidate({ candidateId: 'a', confidence: 0.5 }),
      makeCandidate({ candidateId: 'b', confidence: 0.9 }),
    ],
  });
  assert.equal(deduplicated.length, 1);
  assert.equal(deduplicated[0].confidence, 0.9);
  assert.equal(deduplicated[0].candidateId, 'b');
});

test('deduplicação: valores diferentes não são mesclados', () => {
  const { deduplicated, removed } = deduplicateLearningCandidates({
    candidates: [
      makeCandidate({ candidateId: 'a', normalizedValue: 'x' }),
      makeCandidate({ candidateId: 'b', normalizedValue: 'y' }),
    ],
  });
  assert.equal(deduplicated.length, 2);
  assert.equal(removed.length, 0);
});

test('deduplicação: fora da janela temporal não é mesclado', () => {
  const { deduplicated } = deduplicateLearningCandidates({
    candidates: [
      makeCandidate({ candidateId: 'a', createdAt: new Date(NOW - 60 * 24 * 60 * 60 * 1000).toISOString() }),
      makeCandidate({ candidateId: 'b', createdAt: new Date(NOW).toISOString() }),
    ],
  });
  assert.equal(deduplicated.length, 2);
});

test('deduplicação: evidência mesclada limitada ao máximo do policy', () => {
  const bigEvidence = Array.from({ length: 10 }, () => ({}));
  const { deduplicated } = deduplicateLearningCandidates({
    candidates: [
      makeCandidate({ candidateId: 'a', evidence: bigEvidence }),
      makeCandidate({ candidateId: 'b', evidence: bigEvidence }),
    ],
  });
  assert.ok(deduplicated[0].evidence.length <= 8);
});

test('deduplicação: entrada vazia', () => {
  const result = deduplicateLearningCandidates({});
  assert.deepEqual(result.deduplicated, []);
  assert.deepEqual(result.removed, []);
});

test('avaliação: sem candidato retorna null', () => {
  assert.equal(evaluateLearningCandidate({}), null);
});

test('avaliação: risco alto rejeita sem aplicar', () => {
  const result = evaluateLearningCandidate({
    candidate: makeCandidate({ risk: 'HIGH' }),
    now: NOW,
  });
  assert.equal(result.status, 'REJECTED');
  assert.ok(result.restrictions.includes('RISK_BLOCKED'));
  assert.equal(result.shadow.applied, false);
});

test('avaliação: expirado vira EXPIRED', () => {
  const result = evaluateLearningCandidate({
    candidate: makeCandidate({ expiresAt: new Date(NOW - 1000).toISOString() }),
    now: NOW,
  });
  assert.equal(result.status, 'EXPIRED');
});

test('avaliação: conflito com candidato existente', () => {
  const result = evaluateLearningCandidate({
    candidate: makeCandidate({ candidateId: 'b', normalizedValue: 'saúde' }),
    existingCandidates: [makeCandidate({ candidateId: 'a', normalizedValue: 'alimentação' })],
    now: NOW,
  });
  assert.equal(result.status, 'CONFLICTING');
  assert.equal(result.conflicts.length, 1);
});

test('avaliação: conflito precede superseded no fluxo', () => {
  const result = evaluateLearningCandidate({
    candidate: makeCandidate({ candidateId: 'b', normalizedValue: 'saúde' }),
    existingCandidates: [makeCandidate({ candidateId: 'a', normalizedValue: 'alimentação', status: 'SUPPORTED' })],
    now: NOW,
  });
  assert.equal(result.status, 'CONFLICTING');
});

test('avaliação: alta confiança vira HIGH_CONFIDENCE', () => {
  const result = evaluateLearningCandidate({
    candidate: makeCandidate({ confidence: 0.85 }),
    now: NOW,
  });
  assert.equal(result.status, 'HIGH_CONFIDENCE');
});

test('avaliação: confiança suportada vira SUPPORTED', () => {
  const result = evaluateLearningCandidate({
    candidate: makeCandidate({ confidence: 0.71 }),
    now: NOW,
  });
  assert.equal(result.status, 'SUPPORTED');
});

test('avaliação: confiança mínima vira CANDIDATE', () => {
  const result = evaluateLearningCandidate({
    candidate: makeCandidate({ confidence: 0.51 }),
    now: NOW,
  });
  assert.equal(result.status, 'CANDIDATE');
});

test('avaliação: abaixo do mínimo vira NEEDS_EVIDENCE', () => {
  const result = evaluateLearningCandidate({
    candidate: makeCandidate({ confidence: 0.2 }),
    now: NOW,
  });
  assert.equal(result.status, 'NEEDS_EVIDENCE');
});

test('avaliação: candidato efêmero nunca fica HIGH_CONFIDENCE', () => {
  const result = evaluateLearningCandidate({
    candidate: makeCandidate({ type: 'QUESTION_STRATEGY', confidence: 0.9 }),
    now: NOW,
  });
  assert.equal(result.status, 'SUPPORTED');
});

test('avaliação: nunca aplica em nenhum caminho', () => {
  const cases = [
    makeCandidate({ risk: 'CRITICAL' }),
    makeCandidate({ expiresAt: new Date(NOW - 1).toISOString() }),
    makeCandidate({ confidence: 0.9 }),
    makeCandidate({ confidence: 0.2 }),
  ];
  for (const candidate of cases) {
    const result = evaluateLearningCandidate({ candidate, now: NOW });
    assert.equal(result.shadow.applied, false);
    assert.equal(result.shadow.persisted, false);
    assert.equal(result.shadow.changedBehavior, false);
  }
});
