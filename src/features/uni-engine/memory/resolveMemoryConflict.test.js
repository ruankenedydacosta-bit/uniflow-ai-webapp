// Testes de resolução de conflito (Fase 3) — item 22 e seção 19.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveMemoryConflict } from './resolveMemoryConflict.js';
import { createMemoryItem } from './memoryContracts.js';

function current(overrides = {}) {
  return createMemoryItem({
    id: 'mem-old',
    userId: 'user-1',
    workspaceId: 'workspace-1',
    memoryType: 'merchant_account_association',
    subjectKey: 'merchant_account::mercado',
    value: { merchant: 'mercado', account: 'Nubank' },
    normalizedValue: 'merchant=mercado;account=nubank',
    status: 'active',
    confidence: 0.9,
    source: 'user',
    ...overrides,
  });
}

function candidate(overrides = {}) {
  return {
    userId: 'user-1',
    workspaceId: 'workspace-1',
    memoryType: 'merchant_account_association',
    subjectKey: 'merchant_account::mercado',
    value: { merchant: 'mercado', account: 'Caixa' },
    normalizedValue: 'merchant=mercado;account=caixa',
    evidenceType: 'explicit_user_statement',
    confidence: 0.64,
    status: 'candidate',
    ...overrides,
  };
}

test('m22a: sujeitos diferentes → ignore', () => {
  const result = resolveMemoryConflict(
    current(),
    candidate({ subjectKey: 'merchant_account::padaria' }),
  );
  assert.equal(result.outcome, 'ignore');
  assert.equal(result.reason, 'different_subject');
});

test('m22b: mesmo sujeito e mesmo valor → same', () => {
  const result = resolveMemoryConflict(
    current(),
    candidate({ value: { merchant: 'mercado', account: 'Nubank' }, normalizedValue: 'merchant=mercado;account=nubank' }),
  );
  assert.equal(result.outcome, 'same');
});

test('m22c: mesmo sujeito, valores compatíveis → reinforce', () => {
  const result = resolveMemoryConflict(
    current(),
    candidate({ value: { merchant: 'mercado', account: 'nubank' }, normalizedValue: 'merchant=mercado;account=nubank' }),
  );
  assert.equal(result.outcome, 'same', 'normalização de valor torna igual');
});

test('m22d: correção explícita substitui → supersede', () => {
  const result = resolveMemoryConflict(
    current(),
    candidate({ evidenceType: 'user_correction', memoryType: 'user_correction', status: 'confirmed', confidence: 0.675 }),
  );
  assert.equal(result.outcome, 'supersede');
  assert.equal(result.reason, 'explicit_correction');
});

test('m22e: valor diferente + memória atual com confiança alta → contest', () => {
  const result = resolveMemoryConflict(current({ confidence: 0.92 }), candidate({ confidence: 0.5 }));
  assert.equal(result.outcome, 'contest');
  assert.equal(result.reason, 'current_high_confidence');
});

test('m22f: valor diferente + candidato de confiança baixa → requires_confirmation', () => {
  const result = resolveMemoryConflict(
    current({ confidence: 0.5, status: 'candidate' }),
    candidate({ confidence: 0.2 }),
  );
  assert.equal(result.outcome, 'requires_confirmation');
  assert.equal(result.reason, 'low_candidate_confidence');
});

test('m22g: valor diferente sem correção → requires_confirmation', () => {
  const result = resolveMemoryConflict(
    current({ confidence: 0.5, status: 'confirmed' }),
    candidate({ confidence: 0.7 }),
  );
  assert.equal(result.outcome, 'requires_confirmation');
  assert.equal(result.reason, 'different_value_without_correction');
});

test('m22h: entrada ausente → ignore', () => {
  assert.equal(resolveMemoryConflict(null, candidate()).outcome, 'ignore');
  assert.equal(resolveMemoryConflict(current(), null).outcome, 'ignore');
});
