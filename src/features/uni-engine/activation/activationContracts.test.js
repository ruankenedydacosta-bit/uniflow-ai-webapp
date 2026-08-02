// Testes contratuais do Activation Engine (Fase 9).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVATION_VERSION,
  computeRolloutBucket,
  createActivationDecision,
  createActivationGate,
  createActivationShadow,
  createEmptyActivationDecision,
  djb2,
  validateActivationDecision,
} from './activationContracts.js';
import { findFunctionsInValue } from '../uniEngineContracts.js';

test('contrato 1: resultado serializável', () => {
  const decision = createEmptyActivationDecision({});
  assert.doesNotThrow(() => JSON.stringify(decision));
  assert.doesNotThrow(() => JSON.stringify(createActivationDecision({})));
});

test('contrato 2: defaults seguros', () => {
  const decision = createEmptyActivationDecision({});
  assert.equal(decision.enabled, false);
  assert.equal(decision.activationStatus, 'DISABLED');
  assert.equal(decision.rolloutMode, 'OFF');
  assert.equal(decision.eligible, false);
  assert.equal(decision.applied, false);
  assert.equal(decision.fallbackUsed, true);
  assert.deepEqual(decision.gates, []);
  assert.equal(decision.rolloutBucket, null);
});

test('contrato 3: enums válidos', () => {
  const decision = createActivationDecision({
    capability: 'QUESTION_GUIDANCE',
    activationStatus: 'ACTIVE_TEST',
    rolloutMode: 'TEST_USERS',
    environment: 'development',
  });
  assert.equal(decision.capability, 'QUESTION_GUIDANCE');
  assert.equal(decision.activationStatus, 'ACTIVE_TEST');
  assert.equal(decision.rolloutMode, 'TEST_USERS');
  assert.equal(decision.environment, 'development');
});

test('contrato 3b: enums inválidos caem em UNKNOWN', () => {
  const decision = createActivationDecision({
    capability: 'NAO_EXISTE',
    activationStatus: 'NAO_EXISTE',
    rolloutMode: 'NAO_EXISTE',
    environment: 'NAO_EXISTE',
  });
  assert.equal(decision.capability, 'UNKNOWN');
  assert.equal(decision.activationStatus, 'UNKNOWN');
  assert.equal(decision.rolloutMode, 'UNKNOWN');
  assert.equal(decision.environment, 'unknown');
});

test('contrato 4: gates serializáveis', () => {
  const gates = [
    createActivationGate({ name: 'ENGINE_ENABLED', passed: true, reasonCode: 'ENGINE_ENABLED', severity: 'none' }),
    createActivationGate({ name: 'CONFIDENCE_THRESHOLD', passed: false, reasonCode: 'CONFIDENCE_BELOW_THRESHOLD', severity: 'medium' }),
  ];
  for (const gate of gates) {
    assert.doesNotThrow(() => JSON.stringify(gate));
    assert.ok(['name', 'passed', 'reasonCode', 'severity', 'metadata'].every((k) => k in gate));
  }
});

test('contrato 5: shadow flags padrão seguras', () => {
  const shadow = createActivationShadow({});
  assert.equal(shadow.appliedToDecision, false);
  assert.equal(shadow.appliedToResponse, false);
  assert.equal(shadow.executed, false);
  assert.equal(shadow.persisted, false);
  assert.equal(shadow.changedBehavior, false);
  assert.equal(shadow.memoryModified, false);
  assert.equal(shadow.databaseCalled, false);
  assert.equal(shadow.voiceTouched, false);
});

test('contrato 6: nenhuma função no resultado', () => {
  const decision = createActivationDecision({
    capability: 'METADATA_ONLY',
    activationStatus: 'SHADOW_ONLY',
    rolloutMode: 'SHADOW',
    environment: 'development',
    gates: [
      createActivationGate({ name: 'ENGINE_ENABLED', passed: true }),
    ],
    appliedEffect: { effect: 'metadata', fields: ['hasData'] },
    comparison: { divergenceType: 'none' },
    telemetry: { capability: 'METADATA_ONLY' },
    shadow: createActivationShadow({ shadowMode: true }),
  });
  assert.deepEqual(findFunctionsInValue(decision), []);
});

test('contrato 7: nenhum objeto externo', () => {
  const decision = createActivationDecision({});
  assert.equal(decision.shadow instanceof Map, false);
  assert.equal(decision.gates instanceof Map, false);
  assert.doesNotThrow(() => JSON.stringify(decision));
});

test('contrato 8: fallback válido', () => {
  const fallback = createEmptyActivationDecision({
    enabled: true,
    shadowMode: true,
    environment: 'development',
    capability: 'QUESTION_GUIDANCE',
    requested: true,
  });
  assert.equal(fallback.fallbackUsed, true);
  assert.equal(fallback.activationStatus, 'DISABLED');
  const validation = validateActivationDecision(fallback);
  assert.equal(validation.valid, true);
  assert.deepEqual(validation.errors, []);
});

test('contrato: capacidade desconhecida normaliza para UNKNOWN', () => {
  const decision = createActivationDecision({ capability: 'NAO_EXISTE' });
  assert.equal(decision.capability, 'UNKNOWN');
  const validation = validateActivationDecision(decision);
  assert.equal(validation.valid, true);
});

test('contrato: validate rejeita shadow executed/persisted', () => {
  const decision = createActivationDecision({
    shadow: { executed: true, persisted: true },
  });
  const validation = validateActivationDecision(decision);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.includes('SHADOW_EXECUTED_FORBIDDEN'));
  assert.ok(validation.errors.includes('SHADOW_PERSISTED_FORBIDDEN'));
});

test('contrato: djb2 é determinístico e estável', () => {
  assert.equal(djb2('abc'), djb2('abc'));
  assert.equal(typeof djb2('abc'), 'number');
  assert.ok(djb2('abc') >= 0);
  assert.equal(djb2(123), djb2('123'));
});

test('contrato: bucket é 0–99 e determinístico', () => {
  assert.equal(computeRolloutBucket('user-1'), computeRolloutBucket('user-1'));
  for (const id of ['a', 'b', 'user-1', 'user-2']) {
    const bucket = computeRolloutBucket(id);
    assert.ok(bucket >= 0 && bucket <= 99, `bucket ${bucket} fora de 0–99`);
  }
});

test('contrato: sem identidade o bucket é null', () => {
  assert.equal(computeRolloutBucket(null), null);
  assert.equal(computeRolloutBucket(''), null);
  assert.equal(computeRolloutBucket('   '), null);
});

test('contrato: versão presente', () => {
  assert.equal(ACTIVATION_VERSION, '1.0');
});
