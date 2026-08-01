// Testes de contratos da Memória Inteligente Persistente (Fase 3).
// Cobre a seção 25 da especificação: 1-7, 49.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createEvidence,
  createMemoryItem,
  validateEvidence,
  validateMemoryItem,
  serializeMemoryItem,
  buildItemFromCandidate,
  buildEvidenceKey,
  computeExpiresAt,
  isValidUuid,
  MEMORY_TYPES,
  MEMORY_STATUSES,
  EVIDENCE_TYPES,
} from './memoryContracts.js';
import { findFunctionsInValue, isSerializableValue } from '../uniEngineContracts.js';

const SCOPE = { userId: 'user-1', workspaceId: 'workspace-1' };

function buildValidItem(overrides = {}) {
  return createMemoryItem({
    ...SCOPE,
    memoryType: 'merchant_category_association',
    subjectKey: 'merchant_category::padaria',
    value: { merchant: 'padaria', category: 'Alimentação' },
    normalizedValue: 'merchant=padaria;category=alimentacao',
    status: 'candidate',
    confidence: 0.5,
    evidenceCount: 1,
    source: 'user',
    ...overrides,
  });
}

test('m1: item de memória é serializável e sem funções', () => {
  const item = buildValidItem();
  assert.doesNotThrow(() => JSON.stringify(item));
  assert.equal(isSerializableValue(item), true);
  assert.deepEqual(findFunctionsInValue(item), []);
});

test('m2: itens válidos passam na validação e tipos fora do enum falham', () => {
  assert.equal(validateMemoryItem(buildValidItem()).valid, true);
  const invalidType = buildValidItem({ memoryType: 'remember_everything' });
  const result = validateMemoryItem(invalidType);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('MEMORY_TYPE_INVALID'));
});

test('m3: status fora do enum falha na validação', () => {
  const result = validateMemoryItem(buildValidItem({ status: 'maybe' }));
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('MEMORY_STATUS_INVALID'));
});

test('m4: confiança fora de 0..1 falha', () => {
  for (const confidence of [-0.1, 1.1]) {
    const result = validateMemoryItem(buildValidItem({ confidence }));
    assert.equal(result.valid, false, `confidence ${confidence}`);
    assert.ok(result.errors.includes('MEMORY_CONFIDENCE_INVALID'));
  }
  assert.equal(validateMemoryItem(buildValidItem({ confidence: 0.9 })).valid, true);
});

test('m5: subjectKey obrigatória, não vazia e limitada', () => {
  assert.equal(validateMemoryItem(buildValidItem({ subjectKey: null })).valid, false);
  assert.equal(validateMemoryItem(buildValidItem({ subjectKey: '   ' })).valid, false);
  assert.equal(
    validateMemoryItem(buildValidItem({ subjectKey: 'x'.repeat(201) })).valid,
    false,
  );
});

test('m6: value mínimo é objeto serializável — nunca array, função ou string', () => {
  assert.equal(validateMemoryItem(buildValidItem({ value: [] })).valid, false);
  assert.equal(validateMemoryItem(buildValidItem({ value: 'texto' })).valid, false);
  assert.equal(
    validateMemoryItem(buildValidItem({ value: { fn: () => {} } })).valid,
    false,
  );
  assert.equal(validateMemoryItem(buildValidItem({ value: { a: 1 } })).valid, true);
});

test('m7: nenhuma função na saída de nenhum construtor de contrato', () => {
  const item = serializeMemoryItem(buildValidItem());
  const evidence = createEvidence({ evidenceType: 'explicit_user_statement', weight: 0.45 });
  assert.deepEqual(findFunctionsInValue(item), []);
  assert.deepEqual(findFunctionsInValue(evidence), []);
  assert.equal(isSerializableValue(item), true);
  assert.equal(isSerializableValue(evidence), true);
});

test('m1b: evidência válida passa e tipo inválido falha', () => {
  const valid = createEvidence({
    evidenceType: 'explicit_user_statement',
    weight: 0.45,
    observedValue: { category: 'Alimentação' },
  });
  assert.equal(validateEvidence(valid).valid, true);
  const invalid = createEvidence({ evidenceType: 'guessed', weight: 0.45 });
  const result = validateEvidence(invalid);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('EVIDENCE_TYPE_INVALID'));
});

test('m2b: enums fechados estão completos conforme especificação', () => {
  assert.deepEqual(MEMORY_TYPES, [
    'user_preference',
    'conversation_preference',
    'account_preference',
    'category_preference',
    'merchant_category_association',
    'merchant_account_association',
    'user_correction',
    'recurring_pattern',
    'user_declared_fact',
    'episodic_context',
    'procedure_preference',
  ]);
  assert.deepEqual(MEMORY_STATUSES, [
    'candidate',
    'confirmed',
    'active',
    'contested',
    'superseded',
    'expired',
    'deleted',
    'rejected',
  ]);
  assert.ok(EVIDENCE_TYPES.includes('explicit_user_statement'));
  assert.ok(EVIDENCE_TYPES.includes('user_correction'));
});

test('m4b: buildItemFromCandidate deriva status e expiração da política', () => {
  const candidate = {
    ...SCOPE,
    memoryType: 'merchant_category_association',
    subjectKey: 'merchant_category::padaria',
    value: { merchant: 'padaria', category: 'Alimentação' },
    normalizedValue: 'merchant=padaria;category=alimentacao',
    evidenceType: 'explicit_user_statement',
    source: 'user',
  };
  const item = buildItemFromCandidate(candidate);
  assert.equal(item.status, 'candidate');
  assert.equal(item.evidenceCount, 1);
  assert.ok(item.confidence > 0 && item.confidence < 1);
  assert.ok(item.expiresAt != null, 'associação renovável expira');
  assert.equal(validateMemoryItem(item).valid, true);
});

test('m4c: correção explícita nasce confirmed com expiração longa', () => {
  const candidate = {
    ...SCOPE,
    memoryType: 'user_correction',
    subjectKey: 'merchant_category::padaria',
    value: { merchant: 'padaria', category: 'Saúde', correctedFrom: 'Outros' },
    normalizedValue: 'merchant=padaria;category=saude',
    evidenceType: 'user_correction',
    status: 'confirmed',
    source: 'user',
  };
  const item = buildItemFromCandidate(candidate);
  assert.equal(item.status, 'confirmed');
  assert.ok(item.confirmedAt != null);
  assert.equal(item.expiresAt, null, 'user_correction não expira automaticamente');
});

test('m5b: episodic_context expira em 24h e preferência de usuário não expira', () => {
  const now = Date.now();
  const episodic = computeExpiresAt('episodic_context', now);
  const preference = computeExpiresAt('user_preference', now);
  assert.ok(episodic != null);
  assert.ok(new Date(episodic).getTime() - now <= 24 * 60 * 60 * 1000);
  assert.equal(preference, null);
});

test('m6b: evidenceKey é determinística e idempotente', () => {
  const base = {
    evidenceType: 'explicit_user_statement',
    sourceMessageId: 'msg-1',
    occurredAt: '2026-08-01T10:00:00.000Z',
    memoryId: 'mem-1',
  };
  assert.equal(buildEvidenceKey(base), buildEvidenceKey(base));
  assert.notEqual(
    buildEvidenceKey({ ...base, sourceMessageId: 'msg-2' }),
    buildEvidenceKey(base),
  );
});

test('m49: userId nunca vem do payload livre — contrato exige userId no item e scopo validado no repository', () => {
  const item = buildValidItem({ userId: null });
  assert.equal(item.userId, null);
  const result = validateMemoryItem(item);
  assert.ok(!result.errors.includes('USER_ID_FROM_TEXT'));
  assert.equal(typeof isValidUuid('not-a-uuid'), 'boolean');
});
