// Testes de integração do Reflection & Learning Engine (Fase 8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runReflectionEngine, validateReflectionEngineOutput } from './runReflectionEngine.js';

const FEATURE_FLAGS = {
  reflectionShadowMode: true,
  reflectionTelemetryEnabled: true,
  learningCandidatesEnabled: true,
};

const NOW = Date.parse('2026-08-01T00:00:00.000Z');

function noopAdapter() {}

test('motor: correção explícita produz resultado completo e shadow', () => {
  const result = runReflectionEngine({
    messageText: 'não é alimentação, é saúde',
    featureFlags: FEATURE_FLAGS,
    now: NOW,
    telemetryAdapter: noopAdapter,
  });
  assert.equal(result.outcome, 'USER_CORRECTED');
  assert.ok(result.signals.some((s) => s.type === 'USER_CORRECTION'));
  assert.ok(result.signals.some((s) => s.type === 'CATEGORY_MISMATCH'));
  assert.equal(result.learningCandidates.length, 1);
  const candidate = result.learningCandidates[0];
  assert.equal(candidate.type, 'CATEGORY_PREFERENCE');
  assert.equal(candidate.subjectKey, 'category::saude');
  assert.ok(candidate.confidence >= 0.6);
  assert.equal(candidate.risk, 'NONE');
  assert.equal(candidate.priority, 'MEDIUM');
  assert.equal(candidate.status, 'SUPPORTED');
  assert.equal(candidate.shadow.applied, false);
  assert.equal(candidate.shadow.persisted, false);
  assert.equal(candidate.shadow.changedBehavior, false);
  assert.deepEqual(result.conflicts, []);
  assert.equal(result.recommendedNextStep, 'REVIEW_CANDIDATES');
});

test('motor: candidatos desabilitados não são gerados', () => {
  const result = runReflectionEngine({
    messageText: 'não é alimentação, é saúde',
    featureFlags: { reflectionShadowMode: true, learningCandidatesEnabled: false },
    now: NOW,
  });
  assert.deepEqual(result.learningCandidates, []);
  assert.deepEqual(result.conflicts, []);
});

test('motor: telemetria desabilitada fica null', () => {
  const result = runReflectionEngine({
    messageText: 'não é alimentação, é saúde',
    featureFlags: { reflectionShadowMode: true, reflectionTelemetryEnabled: false },
    now: NOW,
  });
  assert.equal(result.telemetry, null);
});

test('motor: telemetria habilitada é redigida e estrutural', () => {
  const result = runReflectionEngine({
    messageText: 'não é alimentação, é saúde',
    featureFlags: FEATURE_FLAGS,
    now: NOW,
    telemetryAdapter: noopAdapter,
  });
  const telemetry = result.telemetry;
  assert.ok(telemetry);
  assert.equal(telemetry.outcome, 'USER_CORRECTED');
  assert.ok(telemetry.signalCount >= 2);
  assert.ok(telemetry.signalTypes.includes('USER_CORRECTION'));
  assert.equal(telemetry.candidateCount, 1);
  assert.equal(telemetry.shadowMode, true);
  assert.equal(telemetry.triggered, true);
  assert.ok(!('messageText' in telemetry));
  assert.ok(typeof telemetry.latencyMs === 'number');
});

test('motor: falha de provider nunca gera candidato', () => {
  const result = runReflectionEngine({
    messageText: 'quero transferir 100',
    providerError: true,
    featureFlags: FEATURE_FLAGS,
    now: NOW,
    telemetryAdapter: noopAdapter,
  });
  assert.equal(result.outcome, 'PROVIDER_ERROR');
  assert.deepEqual(result.learningCandidates, []);
  assert.ok(result.suggestions.includes('AVOID_LEARNING_FROM_FAILURE'));
  assert.equal(result.recommendedNextStep, 'RETRY_LATER');
});

test('motor: repetição consistente gera sinal USER_REPETITION', () => {
  const result = runReflectionEngine({
    messageText: 'quero transferir 100',
    history: [{ text: 'quero transferir 100' }, { text: 'quero transferir 100' }],
    featureFlags: FEATURE_FLAGS,
    now: NOW,
    telemetryAdapter: noopAdapter,
  });
  assert.ok(result.signals.some((s) => s.type === 'USER_REPETITION'));
});

test('motor: entrada vazia retorna resultado válido e serializável', () => {
  const result = runReflectionEngine({});
  assert.equal(result.outcome, 'UNKNOWN');
  assert.equal(result.signals.some((s) => s.type === 'USER_CORRECTION'), false);
  assert.equal(result.learningCandidates.length, 0);
  assert.doesNotThrow(() => JSON.stringify(result));
  const validation = validateReflectionEngineOutput(result);
  assert.equal(validation.valid, true);
});

test('motor: erro interno cai no fallback seguro com diagnóstico', () => {
  const explodingFlags = new Proxy({}, { get() { throw new Error('boom'); } });
  const result = runReflectionEngine({
    messageText: 'oi',
    featureFlags: explodingFlags,
  });
  assert.equal(result.outcome, 'UNKNOWN');
  assert.deepEqual(result.signals, []);
  assert.equal(result.telemetry.fallback, true);
  assert.equal(result.telemetry.errorCode, 'REFLECTION_INTERNAL_ERROR');
  assert.ok(result.diagnostics.includes('SHADOW_ONLY'));
  assert.ok(result.diagnostics.includes('FALLBACK_USED'));
});

test('motor: resultado com correção passa na validação de contrato', () => {
  const result = runReflectionEngine({
    messageText: 'não é alimentação, é saúde',
    featureFlags: FEATURE_FLAGS,
    now: NOW,
    telemetryAdapter: noopAdapter,
  });
  const validation = validateReflectionEngineOutput(result);
  assert.equal(validation.valid, true);
  assert.deepEqual(validation.errors, []);
});

test('motor: comportamento determinístico exceto medições e ids', () => {
  const run = () => runReflectionEngine({
    messageText: 'não é alimentação, é saúde',
    featureFlags: FEATURE_FLAGS,
    now: NOW,
    telemetryAdapter: noopAdapter,
  });
  const normalize = (result) => {
    const copy = JSON.parse(JSON.stringify(result));
    delete copy.latencyMs;
    if (copy.telemetry) delete copy.telemetry.latencyMs;
    for (const candidate of copy.learningCandidates) {
      delete candidate.candidateId;
      delete candidate.expiresAt;
    }
    return copy;
  };
  assert.deepEqual(normalize(run()), normalize(run()));
});

test('motor: nada é aplicado, persistido ou alterado no comportamento', () => {
  const result = runReflectionEngine({
    messageText: 'não é alimentação, é saúde',
    featureFlags: FEATURE_FLAGS,
    now: NOW,
    telemetryAdapter: noopAdapter,
  });
  for (const candidate of result.learningCandidates) {
    assert.equal(candidate.shadow.applied, false);
    assert.equal(candidate.shadow.persisted, false);
    assert.equal(candidate.shadow.changedBehavior, false);
  }
  assert.equal(result.shadow.appliedToDecision, false);
  assert.equal(result.shadow.appliedToResponse, false);
  assert.equal(result.shadow.executed, false);
  assert.equal(result.shadow.persisted, false);
  assert.equal(result.shadow.memoryModified, false);
  assert.equal(result.shadow.voiceTouched, false);
  assert.equal(result.shadow.databaseCalled, false);
});
