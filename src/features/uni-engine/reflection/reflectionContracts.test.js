// Testes de contratos do Reflection & Learning Engine (Fase 8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createEmptyReflectionResult,
  createLearningCandidate,
  createReflectionResult,
  createReflectionReview,
  createReflectionShadow,
  createCandidateShadow,
  validateLearningCandidate,
  validateReflectionResult,
  createCandidateId,
  REFLECTION_VERSION,
} from './reflectionContracts.js';
import {
  findFunctionsInValue,
  isSerializableValue,
} from '../uniEngineContracts.js';

test('reflection contracts: resultado serializável e sem funções', () => {
  const result = createReflectionResult({ enabled: true, shadowMode: true });
  assert.deepEqual(findFunctionsInValue(result), []);
  assert.equal(isSerializableValue(result), true);
  assert.doesNotThrow(() => JSON.stringify(result));
});

test('reflection contracts: candidato serializável e sem funções', () => {
  const candidate = createLearningCandidate({ type: 'CATEGORY_PREFERENCE' });
  assert.deepEqual(findFunctionsInValue(candidate), []);
  assert.equal(isSerializableValue(candidate), true);
});

test('reflection contracts: candidato nunca é aplicado', () => {
  const candidate = createLearningCandidate({
    type: 'ACCOUNT_PREFERENCE',
    shadow: { applied: true },
  });
  assert.equal(candidate.shadow.applied, false);
  assert.equal(candidate.shadow.persisted, false);
  assert.equal(candidate.shadow.changedBehavior, false);
});

test('reflection contracts: shadow flags do resultado são sempre falsas', () => {
  const result = createReflectionResult({ shadow: { appliedToDecision: true, executed: true } });
  assert.equal(result.shadow.appliedToDecision, false);
  assert.equal(result.shadow.appliedToResponse, false);
  assert.equal(result.shadow.executed, false);
  assert.equal(result.shadow.persisted, false);
  assert.equal(result.shadow.changedBehavior, false);
});

test('reflection contracts: createReflectionShadow e createCandidateShadow seguros', () => {
  const shadow = createReflectionShadow();
  assert.equal(shadow.shadowMode, true);
  assert.equal(shadow.appliedToDecision, false);
  assert.equal(shadow.executed, false);
  assert.equal(shadow.memoryModified, false);
  const candidateShadow = createCandidateShadow();
  assert.equal(candidateShadow.applied, false);
  assert.equal(candidateShadow.persisted, false);
});

test('reflection contracts: validateReflectionResult valida forma completa', () => {
  const result = createReflectionResult({ enabled: true, shadowMode: true });
  const validation = validateReflectionResult(result);
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
});

test('reflection contracts: validateReflectionResult rejeita outcome inválido', () => {
  const result = createReflectionResult({ outcome: 'NAO_EXISTE' });
  assert.equal(result.outcome, 'UNKNOWN');
  assert.equal(validateReflectionResult(result).valid, true);
});

test('reflection contracts: validateReflectionResult rejeita shadow aplicado', () => {
  const result = createReflectionResult({});
  result.shadow.appliedToDecision = true;
  const validation = validateReflectionResult(result);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.includes('SHADOW_INVALID'));
});

test('reflection contracts: validateLearningCandidate rejeita confiança fora de 0–1', () => {
  const candidate = createLearningCandidate({ type: 'INTENT_PATTERN' });
  candidate.confidence = 1.5;
  const validation = validateLearningCandidate(candidate);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.includes('CONFIDENCE_INVALID'));
});

test('reflection contracts: candidato padrão é determinístico e seguro', () => {
  const candidate = createLearningCandidate({ type: 'QUESTION_STRATEGY' });
  assert.equal(candidate.type, 'QUESTION_STRATEGY');
  assert.equal(candidate.status, 'DETECTED');
  assert.equal(candidate.priority, 'UNDETERMINED');
  assert.equal(candidate.risk, 'UNKNOWN');
  assert.equal(candidate.confidence, 0);
  assert.ok(candidate.candidateId.startsWith('cand_'));
});

test('reflection contracts: candidateId é determinístico', () => {
  const seed = { type: 'CATEGORY_PREFERENCE', subjectKey: 'category::saude', normalizedValue: 'saude' };
  assert.equal(createCandidateId(seed), createCandidateId(seed));
  assert.notEqual(
    createCandidateId(seed),
    createCandidateId({ ...seed, normalizedValue: 'transporte' }),
  );
});

test('reflection contracts: review tem forma completa', () => {
  const review = createReflectionReview({
    targetLayer: 'decision',
    status: 'DIVERGENT',
    confidence: 0.5,
    expected: ['a'],
    observed: ['b'],
    divergence: ['c'],
    blockers: [],
    diagnostics: ['SHADOW_ONLY'],
  });
  assert.equal(review.targetLayer, 'decision');
  assert.equal(review.status, 'DIVERGENT');
  assert.equal(review.confidence, 0.5);
  assert.deepEqual(review.divergence, ['c']);
});

test('reflection contracts: enums inválidos caem em UNKNOWN/UNDETERMINED', () => {
  const result = createReflectionResult({
    outcome: 'QUALQUER_COISA',
    signals: [{ type: 'QUALQUER_COISA' }],
    recommendedNextStep: 'QUALQUER_COISA',
  });
  assert.equal(result.outcome, 'UNKNOWN');
  assert.equal(result.signals[0].type, 'UNKNOWN');
  assert.equal(result.recommendedNextStep, 'NO_ACTION');
});

test('reflection contracts: limite de sinais e candidatos no resultado', () => {
  const result = createReflectionResult({
    signals: Array.from({ length: 100 }, (_, i) => ({ type: 'UNKNOWN', reasonCode: `s${i}` })),
    learningCandidates: Array.from({ length: 100 }, (_, i) => ({ type: 'UNKNOWN', reasonCode: `c${i}` })),
  });
  assert.ok(result.signals.length <= 24);
  assert.ok(result.learningCandidates.length <= 12);
});

test('reflection contracts: resultado vazio é válido e seguro', () => {
  const empty = createEmptyReflectionResult({ shadowMode: true });
  assert.equal(empty.version, REFLECTION_VERSION);
  assert.equal(empty.enabled, false);
  assert.equal(empty.outcome, 'UNKNOWN');
  assert.deepEqual(empty.signals, []);
  assert.deepEqual(empty.learningCandidates, []);
  assert.equal(empty.shadow.appliedToDecision, false);
  assert.equal(isSerializableValue(empty), true);
});

test('reflection contracts: resultado vazio valida como forma válida', () => {
  const empty = createEmptyReflectionResult({ shadowMode: true });
  assert.equal(validateReflectionResult(empty).valid, true);
});

test('reflection contracts: candidato não contém função, cliente ou áudio', () => {
  const candidate = createLearningCandidate({
    type: 'ACCOUNT_PREFERENCE',
    proposedValue: 'Nubank',
    subjectKey: 'account::nubank',
  });
  const json = JSON.stringify(candidate);
  assert.equal(json.includes('function'), false);
  assert.equal(json.includes('supabase'), false);
  assert.equal(json.includes('audio'), false);
  assert.equal(json.includes('secret'), false);
});
