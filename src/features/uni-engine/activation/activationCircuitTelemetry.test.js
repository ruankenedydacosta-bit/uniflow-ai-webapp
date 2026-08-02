// Testes do circuit breaker e da telemetria redigida (Fase 9).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isCircuitOpen,
  recordCircuitFailure,
  recordCircuitDivergence,
  recordCircuitSuccess,
  resetCircuitBreaker,
  getCircuitBreakerStatus,
  getCircuitBreakerStateSize,
} from './circuitBreaker.js';
import {
  buildActivationTelemetry,
  redactActivationTelemetry,
  emitActivationTelemetry,
  ACTIVATION_TELEMETRY_ALLOWED_FIELDS,
} from './telemetry/activationTelemetry.js';
import { ACTIVATION_POLICY } from './activationPolicy.js';

test('circuit 93: começa fechado e sem estado', () => {
  resetCircuitBreaker();
  assert.equal(getCircuitBreakerStateSize(), 0);
  assert.equal(isCircuitOpen('QUESTION_GUIDANCE'), false);
});

test('circuit 94: falhas abrem após threshold', () => {
  resetCircuitBreaker();
  const threshold = ACTIVATION_POLICY.circuitBreaker.failureThreshold;
  for (let i = 0; i < threshold - 1; i += 1) {
    assert.equal(recordCircuitFailure('QUESTION_GUIDANCE').open, false);
  }
  assert.equal(recordCircuitFailure('QUESTION_GUIDANCE').open, true);
  assert.equal(isCircuitOpen('QUESTION_GUIDANCE'), true);
});

test('circuit 95: divergências também abrem', () => {
  resetCircuitBreaker();
  const threshold = ACTIVATION_POLICY.circuitBreaker.divergenceThreshold;
  for (let i = 0; i < threshold; i += 1) {
    recordCircuitDivergence('RISK_WARNING');
  }
  assert.equal(isCircuitOpen('RISK_WARNING'), true);
});

test('circuit 96: sucessos estabilizam após 2', () => {
  resetCircuitBreaker();
  for (let i = 0; i < 5; i += 1) recordCircuitFailure('METADATA_ONLY');
  assert.equal(isCircuitOpen('METADATA_ONLY'), true);
  recordCircuitSuccess('METADATA_ONLY');
  assert.equal(isCircuitOpen('METADATA_ONLY'), true);
  recordCircuitSuccess('METADATA_ONLY');
  assert.equal(isCircuitOpen('METADATA_ONLY'), false);
  assert.equal(getCircuitBreakerStatus('METADATA_ONLY').failures, 0);
});

test('circuit 97: uma capacidade não afeta outra', () => {
  resetCircuitBreaker();
  for (let i = 0; i < 5; i += 1) recordCircuitFailure('QUESTION_GUIDANCE');
  assert.equal(isCircuitOpen('QUESTION_GUIDANCE'), true);
  assert.equal(isCircuitOpen('CLARIFICATION_GUIDANCE'), false);
});

test('circuit 98: estado é descartável (reset limpa)', () => {
  resetCircuitBreaker();
  for (let i = 0; i < 5; i += 1) recordCircuitFailure('QUESTION_GUIDANCE');
  resetCircuitBreaker();
  assert.equal(getCircuitBreakerStateSize(), 0);
  assert.equal(isCircuitOpen('QUESTION_GUIDANCE'), false);
});

test('circuit 99: status reporta contadores', () => {
  resetCircuitBreaker();
  recordCircuitFailure('GOAL_SUGGESTION');
  const status = getCircuitBreakerStatus('GOAL_SUGGESTION');
  assert.equal(status.capability, 'GOAL_SUGGESTION');
  assert.equal(status.failures, 1);
  assert.equal(status.open, false);
});

test('telemetria 100: build produz forma estável', () => {
  const telemetry = buildActivationTelemetry({
    engineVersion: '1.0',
    activationVersion: '1.0',
    enabled: true,
    shadowMode: true,
    capability: 'QUESTION_GUIDANCE',
    activationStatus: 'SHADOW_ONLY',
    rolloutMode: 'SHADOW',
    rolloutBucket: null,
    confidenceBand: 'high',
    riskBand: 'LOW',
    workspaceType: 'personal',
    dataSufficient: true,
    gates: [{ passed: true }, { passed: false }],
    fallbackUsed: true,
    fallbackReason: 'SHADOW_ONLY',
    circuitBreakerStatus: 'closed',
    latencyMs: 1.23,
    errorCode: null,
  });
  assert.equal(telemetry.gatesPassed, 1);
  assert.equal(telemetry.gatesFailed, 1);
  assert.equal(telemetry.rolloutBucket, null);
  assert.equal(typeof telemetry.latencyMs, 'number');
});

test('telemetria 101: redator remove dados sensíveis', () => {
  const redacted = redactActivationTelemetry({
    capability: 'QUESTION_GUIDANCE',
    userId: 'u-123',
    workspaceId: 'w-999',
    messageText: 'pagar fatura de 500 reais',
    amount: 500,
    telefono: '11999999999',
    rolloutBucket: 42,
  });
  assert.equal(redacted.capability, 'QUESTION_GUIDANCE');
  assert.equal(redacted.rolloutBucket, 42);
  assert.equal('userId' in redacted, false);
  assert.equal('workspaceId' in redacted, false);
  assert.equal('messageText' in redacted, false);
  assert.equal('amount' in redacted, false);
  assert.equal('telefono' in redacted, false);
});

test('telemetria 102: redator nunca registra o ID do usuário', () => {
  const redacted = redactActivationTelemetry({ userId: 'user-secreto-123', rolloutBucket: 7 });
  assert.ok(JSON.stringify(redacted).includes('user-secreto-123') === false);
  assert.equal(redacted.rolloutBucket, 7);
});

test('telemetria 103: allowlist é finita e sem campos sensíveis', () => {
  assert.equal(ACTIVATION_TELEMETRY_ALLOWED_FIELDS.length, 19);
  const joined = ACTIVATION_TELEMETRY_ALLOWED_FIELDS.join(',');
  for (const forbidden of ['userId', 'workspaceId', 'accountId', 'transactionId', 'message', 'amount', 'secret', 'token']) {
    assert.ok(joined.includes(forbidden) === false, `${forbidden} não deveria existir na allowlist`);
  }
});

test('telemetria 104: emit chama o adapter uma vez', () => {
  let calls = 0;
  let received = null;
  const adapter = (payload) => { calls += 1; received = payload; };
  const telemetry = buildActivationTelemetry({ capability: 'QUESTION_GUIDANCE', userId: 'u-1' });
  const result = emitActivationTelemetry(telemetry, adapter);
  assert.equal(calls, 1);
  assert.equal('userId' in received, false);
  assert.deepEqual(result, received);
});

test('telemetria 105: adapter que lança não quebra', () => {
  const result = emitActivationTelemetry({ capability: 'QUESTION_GUIDANCE' }, () => { throw new Error('boom'); });
  assert.equal(result.capability, 'QUESTION_GUIDANCE');
});

test('telemetria 106: redator aceita entradas inválidas sem lançar', () => {
  assert.deepEqual(redactActivationTelemetry(null), {});
  assert.deepEqual(redactActivationTelemetry(undefined), {});
  assert.deepEqual(redactActivationTelemetry('texto'), {});
  assert.deepEqual(redactActivationTelemetry(42), {});
});

test('telemetria 107: telemetria nunca contém função', () => {
  const telemetry = buildActivationTelemetry({ capability: 'QUESTION_GUIDANCE', fn: () => {} });
  assert.doesNotThrow(() => JSON.stringify(telemetry));
});
