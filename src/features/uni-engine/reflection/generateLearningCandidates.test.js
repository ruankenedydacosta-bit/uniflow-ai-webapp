// Testes de geração de candidatos de aprendizado (Fase 8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateLearningCandidates } from './generateLearningCandidates.js';

const NOW = Date.parse('2026-08-01T00:00:00.000Z');

test('candidatos: correção explícita de categoria gera CATEGORY_PREFERENCE', () => {
  const { candidates } = generateLearningCandidates({
    messageText: 'não é alimentação, é saúde',
    userCorrection: { isCorrection: true, correctionPair: { from: 'alimentação', to: 'saúde' } },
    signals: [{ type: 'USER_CORRECTION' }],
    outcome: 'USER_CORRECTED',
    now: NOW,
  });
  assert.ok(candidates.some((c) => c.type === 'CATEGORY_PREFERENCE'));
  const candidate = candidates.find((c) => c.type === 'CATEGORY_PREFERENCE');
  assert.equal(candidate.subjectKey, 'category::saude');
  assert.equal(candidate.proposedValue, 'saúde');
});

test('candidatos: repetição consistente gera INTENT_PATTERN', () => {
  const { candidates } = generateLearningCandidates({
    messageText: 'quero transferir 100',
    signals: [{ type: 'INTENT_MISMATCH' }],
    repetitionCount: 3,
    outcome: 'UNRESOLVED',
    now: NOW,
  });
  assert.ok(candidates.some((c) => c.type === 'INTENT_PATTERN'));
});

test('candidatos: ocorrência única fraca não gera candidato', () => {
  const { candidates } = generateLearningCandidates({
    messageText: 'quero transferir 100',
    signals: [],
    repetitionCount: 0,
    outcome: 'UNKNOWN',
    now: NOW,
  });
  assert.deepEqual(candidates, []);
});

test('candidatos: segredo não gera candidato', () => {
  const { candidates } = generateLearningCandidates({
    messageText: 'minha senha é abc123def456ghi789jkl0',
    userCorrection: { isCorrection: true },
    signals: [{ type: 'USER_CORRECTION' }],
    outcome: 'USER_CORRECTED',
    now: NOW,
  });
  assert.deepEqual(candidates, []);
});

test('candidatos: CPF não gera candidato', () => {
  const { candidates } = generateLearningCandidates({
    messageText: 'o cpf é 123.456.789-09',
    signals: [{ type: 'USER_CORRECTION' }],
    outcome: 'USER_CORRECTED',
    now: NOW,
  });
  assert.deepEqual(candidates, []);
});

test('candidatos: provider error não gera candidato', () => {
  const { candidates, blockedReasons } = generateLearningCandidates({
    messageText: 'quero transferir 100',
    signals: [{ type: 'PROVIDER_FAILURE' }],
    outcome: 'PROVIDER_ERROR',
    providerFailed: true,
    now: NOW,
  });
  assert.deepEqual(candidates, []);
  assert.deepEqual(blockedReasons, ['EXTERNAL_FAILURE_IGNORED']);
});

test('candidatos: saudação não gera candidato', () => {
  const { candidates } = generateLearningCandidates({
    messageText: 'oi',
    signals: [],
    outcome: 'UNKNOWN',
    now: NOW,
  });
  assert.deepEqual(candidates, []);
});

test('candidatos: valor financeiro isolado não gera candidato', () => {
  const { candidates } = generateLearningCandidates({
    messageText: 'R$ 50,00',
    signals: [],
    outcome: 'UNKNOWN',
    now: NOW,
  });
  assert.deepEqual(candidates, []);
});

test('candidatos: pergunta desnecessária recorrente gera QUESTION_STRATEGY', () => {
  const { candidates } = generateLearningCandidates({
    messageText: 'quero transferir 100',
    signals: [{ type: 'UNNECESSARY_QUESTION' }],
    repetitionCount: 2,
    outcome: 'PARTIAL_SUCCESS',
    now: NOW,
  });
  assert.ok(candidates.some((c) => c.type === 'QUESTION_STRATEGY'));
});

test('candidatos: divergência de decisão gera DECISION_POLICY_SIGNAL', () => {
  const { candidates } = generateLearningCandidates({
    messageText: 'quero transferir 100',
    signals: [{ type: 'DECISION_MISMATCH' }],
    outcome: 'AMBIGUOUS_RESULT',
    now: NOW,
  });
  assert.ok(candidates.some((c) => c.type === 'DECISION_POLICY_SIGNAL'));
});

test('candidatos: divergência de plano gera PLANNING_POLICY_SIGNAL', () => {
  const { candidates } = generateLearningCandidates({
    messageText: 'quero transferir 100',
    signals: [{ type: 'PLANNING_MISMATCH' }],
    outcome: 'PARTIAL_SUCCESS',
    now: NOW,
  });
  assert.ok(candidates.some((c) => c.type === 'PLANNING_POLICY_SIGNAL'));
});

test('candidatos: divergência de objetivo gera GOAL_POLICY_SIGNAL', () => {
  const { candidates } = generateLearningCandidates({
    messageText: 'quero transferir 100',
    signals: [{ type: 'GOAL_MISMATCH' }],
    outcome: 'PARTIAL_SUCCESS',
    now: NOW,
  });
  assert.ok(candidates.some((c) => c.type === 'GOAL_POLICY_SIGNAL'));
});

test('candidatos: conflito epistêmico gera EPISTEMIC_POLICY_SIGNAL', () => {
  const { candidates } = generateLearningCandidates({
    messageText: 'quero transferir 100',
    signals: [{ type: 'EPISTEMIC_CONFLICT' }],
    outcome: 'PARTIAL_SUCCESS',
    now: NOW,
  });
  assert.ok(candidates.some((c) => c.type === 'EPISTEMIC_POLICY_SIGNAL'));
});

test('candidatos: sucesso confirmado gera SUCCESS_REINFORCEMENT', () => {
  const { candidates } = generateLearningCandidates({
    messageText: 'quero transferir 100',
    signals: [{ type: 'SUCCESSFUL_PATTERN' }],
    outcome: 'SUCCESS_CONFIRMED',
    now: NOW,
  });
  assert.ok(candidates.some((c) => c.type === 'SUCCESS_REINFORCEMENT'));
});

test('candidatos: limite máximo respeitado', () => {
  const { candidates } = generateLearningCandidates({
    messageText: 'quero transferir 100',
    signals: [
      { type: 'INTENT_MISMATCH' },
      { type: 'DECISION_MISMATCH' },
      { type: 'PLANNING_MISMATCH' },
      { type: 'GOAL_MISMATCH' },
      { type: 'EPISTEMIC_CONFLICT' },
      { type: 'MEMORY_CONFLICT' },
      { type: 'UNNECESSARY_QUESTION' },
      { type: 'MISSING_QUESTION' },
      { type: 'SUCCESSFUL_PATTERN' },
    ],
    repetitionCount: 5,
    outcome: 'SUCCESS_CONFIRMED',
    now: NOW,
  });
  assert.ok(candidates.length <= 12);
});

test('candidatos: todos nascem com shadow.applied = false', () => {
  const { candidates } = generateLearningCandidates({
    messageText: 'não é alimentação, é saúde',
    userCorrection: { isCorrection: true, correctionPair: { from: 'alimentação', to: 'saúde' } },
    signals: [{ type: 'USER_CORRECTION' }],
    outcome: 'USER_CORRECTED',
    now: NOW,
  });
  for (const candidate of candidates) {
    assert.equal(candidate.shadow.applied, false);
    assert.equal(candidate.shadow.persisted, false);
    assert.equal(candidate.shadow.changedBehavior, false);
  }
});

test('candidatos: candidato tem expiração e forma completa', () => {
  const { candidates } = generateLearningCandidates({
    messageText: 'não é alimentação, é saúde',
    userCorrection: { isCorrection: true, correctionPair: { from: 'alimentação', to: 'saúde' } },
    signals: [{ type: 'USER_CORRECTION' }],
    outcome: 'USER_CORRECTED',
    now: NOW,
  });
  const candidate = candidates[0];
  assert.ok(candidate.expiresAt);
  assert.ok(Date.parse(candidate.expiresAt) > NOW);
  assert.ok(candidate.candidateId.startsWith('cand_'));
  assert.equal(candidate.status, 'DETECTED');
});

test('candidatos: mensagem vazia ou nula não gera candidato', () => {
  const { candidates } = generateLearningCandidates({ messageText: '' });
  assert.deepEqual(candidates, []);
  const { candidates: c2 } = generateLearningCandidates({});
  assert.deepEqual(c2, []);
});
