// Testes de fontes de conhecimento e fábricas de evidência (Fase 4).
// Itens 7-12 da especificação: banco, FinancialSnapshot, usuário, memória,
// contexto e inferência — cada fonte nasce com tipo, peso e origem corretos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evidenceFromDatabaseRecord,
  evidenceFromFinancialSnapshot,
  evidenceFromUserStatement,
  evidenceFromUserConfirmation,
  evidenceFromUserCorrection,
  evidenceFromMemoryRetrieval,
  evidenceFromContextReference,
  evidenceFromDeterministicRule,
  evidenceFromContradiction,
  dedupeEvidence,
} from './buildEpistemicEvidence.js';
import { validateEpistemicEvidence } from './epistemicContracts.js';
import { getEvidenceWeight } from './epistemicPolicy.js';

const NOW = '2026-07-30T10:00:00.000Z';

test('epistêmico 7: fonte banco (database_record) — evidência direta de banco', () => {
  const evidence = evidenceFromDatabaseRecord({ subject: 'balance:total', value: 950, observedAt: NOW });
  assert.equal(evidence.type, 'direct_database');
  assert.equal(evidence.source, 'database_record');
  assert.equal(evidence.weight, getEvidenceWeight('direct_database'));
  assert.equal(validateEpistemicEvidence(evidence).valid, true);
});

test('epistêmico 8: fonte FinancialSnapshot — oficial para contexto financeiro', () => {
  const evidence = evidenceFromFinancialSnapshot({ subject: 'balance:account:nubank', value: 480.5, observedAt: NOW });
  assert.equal(evidence.type, 'direct_database');
  assert.equal(evidence.source, 'financial_snapshot');
  assert.equal(evidence.weight, getEvidenceWeight('direct_database'));
  assert.equal(validateEpistemicEvidence(evidence).valid, true);
});

test('epistêmico 9: fonte usuário (user_explicit_statement)', () => {
  const evidence = evidenceFromUserStatement({ subject: 'amount', value: 50, observedAt: NOW });
  assert.equal(evidence.type, 'direct_user_statement');
  assert.equal(evidence.source, 'user_explicit_statement');
  assert.equal(evidence.weight, getEvidenceWeight('direct_user_statement'));
  assert.equal(validateEpistemicEvidence(evidence).valid, true);
});

test('epistêmico 10: fonte memória (persistent_memory) — peso menor que banco', () => {
  const evidence = evidenceFromMemoryRetrieval({
    subject: 'balance:total',
    value: 1000,
    observedAt: NOW,
    confidence: 0.8,
    metadata: { memoryStatus: 'confirmed', subjectKey: 'fact::saldo' },
  });
  assert.equal(evidence.type, 'memory_retrieval');
  assert.equal(evidence.source, 'persistent_memory');
  assert.ok(evidence.weight < getEvidenceWeight('direct_database'), 'memória pesa menos que banco');
  assert.equal(validateEpistemicEvidence(evidence).valid, true);
});

test('epistêmico 10b: memória candidata tem peso menor que memória confirmada', () => {
  const candidate = evidenceFromMemoryRetrieval({
    subject: 'x', value: 1, observedAt: NOW, confidence: 0.3,
    metadata: { memoryStatus: 'candidate' },
  });
  const confirmed = evidenceFromMemoryRetrieval({
    subject: 'x', value: 1, observedAt: NOW, confidence: 0.8,
    metadata: { memoryStatus: 'confirmed' },
  });
  assert.ok(candidate.weight < confirmed.weight);
});

test('epistêmico 11: fonte contexto conversacional — resolve referência, não cria fato', () => {
  const evidence = evidenceFromContextReference({ subject: 'account:nubank', value: 'Nubank', observedAt: NOW });
  assert.equal(evidence.type, 'context_reference');
  assert.equal(evidence.source, 'conversation_context');
  assert.equal(validateEpistemicEvidence(evidence).valid, true);
});

test('epistêmico 12: fonte inferência determinística', () => {
  const evidence = evidenceFromDeterministicRule({ subject: 'category:alimentação', value: 'Alimentação', observedAt: NOW });
  assert.equal(evidence.type, 'deterministic_rule');
  assert.equal(evidence.source, 'deterministic_inference');
  assert.equal(validateEpistemicEvidence(evidence).valid, true);
});

test('epistêmico: confirmação e correção explícitas têm origem própria e peso alto', () => {
  const confirmation = evidenceFromUserConfirmation({ subject: 'amount', value: 50, observedAt: NOW });
  assert.equal(confirmation.type, 'user_confirmation');
  const correction = evidenceFromUserCorrection({ subject: 'amount', value: 60, observedAt: NOW });
  assert.equal(correction.type, 'user_correction');
  assert.equal(correction.source, 'user_correction');
  assert.ok(correction.weight > confirmation.weight, 'correção pesa mais que confirmação');
});

test('epistêmico: evidência contraditória é marcada e tem peso negativo', () => {
  const contradiction = evidenceFromContradiction({
    subject: 'balance:total',
    value: 950,
    observedAt: NOW,
    metadata: { contradictionSource: 'financial_snapshot' },
  });
  assert.equal(contradiction.type, 'contradicting_evidence');
  assert.ok(contradiction.weight < 0);
});

test('epistêmico: deduplicação — evidências idênticas contam uma única vez', () => {
  const a = evidenceFromUserStatement({ subject: 'amount', value: 50, observedAt: NOW });
  const b = evidenceFromUserStatement({ subject: 'amount', value: 50, observedAt: NOW });
  const c = evidenceFromUserStatement({ subject: 'amount', value: 50, observedAt: '2026-07-30T11:00:00.000Z' });
  assert.equal(dedupeEvidence([a, b]).length, 1);
  assert.equal(dedupeEvidence([a, c]).length, 2, 'observações em instantes distintos permanecem');
});
