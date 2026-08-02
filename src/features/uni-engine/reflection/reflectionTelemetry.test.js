// Testes de telemetria redigida da Fase 8.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REFLECTION_TELEMETRY_ALLOWED_FIELDS,
  redactReflectionTelemetry,
} from './telemetry/redactReflectionTelemetry.js';
import { buildReflectionTelemetry, emitReflectionTelemetry } from './telemetry/reflectionTelemetry.js';

test('redação: mantém apenas campos estruturais da allowlist', () => {
  const input = {
    correlationId: 'corr-1',
    outcome: 'USER_CORRECTED',
    signalCount: 2,
    signalTypes: ['USER_CORRECTION'],
    messageText: 'conteúdo sensível da mensagem original',
    accountName: 'nubank',
    amount: 150.5,
    token: 'abc123',
    memoryContent: 'dado de memória',
  };
  const redacted = redactReflectionTelemetry(input);
  assert.equal(redacted.outcome, 'USER_CORRECTED');
  assert.equal(redacted.signalCount, 2);
  assert.ok(!Object.hasOwn(redacted, 'messageText'));
  assert.ok(!Object.hasOwn(redacted, 'accountName'));
  assert.ok(!Object.hasOwn(redacted, 'amount'));
  assert.ok(!Object.hasOwn(redacted, 'token'));
  assert.ok(!Object.hasOwn(redacted, 'memoryContent'));
});

test('redação: arrays e objetos viram [redacted]', () => {
  const redacted = redactReflectionTelemetry({
    signalTypes: ['USER_CORRECTION'],
    riskBand: { level: 'NONE' },
  });
  assert.equal(redacted.signalTypes, '[redacted]');
  assert.equal(redacted.riskBand, '[redacted]');
});

test('redação: primitivos são preservados, null preservado', () => {
  const redacted = redactReflectionTelemetry({
    correlationId: null,
    enabled: true,
    latencyMs: 3.14,
    fallback: false,
  });
  assert.equal(redacted.correlationId, null);
  assert.equal(redacted.enabled, true);
  assert.equal(redacted.latencyMs, 3.14);
  assert.equal(redacted.fallback, false);
});

test('redação: entrada vazia ou inválida', () => {
  assert.deepEqual(redactReflectionTelemetry({}), {});
  assert.deepEqual(redactReflectionTelemetry(null), {});
});

test('telemetria: build com candidatos gera bandas agregadas', () => {
  const telemetry = buildReflectionTelemetry({
    correlationId: 'corr-1',
    engineVersion: '2.0.0',
    enabled: true,
    shadowMode: true,
    reflectionTriggered: true,
    outcome: 'USER_CORRECTED',
    signals: [{ type: 'USER_CORRECTION' }],
    reviews: [{ status: 'ALIGNED' }],
    candidates: [
      { type: 'CATEGORY_PREFERENCE', confidence: 0.71, risk: 'NONE' },
    ],
    conflicts: [],
    confidenceBand: 'medium',
    priorityBand: 'MEDIUM',
    riskBand: 'NONE',
    fallback: false,
    errorCode: null,
    latencyMs: 5.5,
  });
  assert.equal(telemetry.outcome, 'USER_CORRECTED');
  assert.equal(telemetry.signalCount, 1);
  assert.equal(telemetry.reviewCount, 1);
  assert.equal(telemetry.candidateCount, 1);
  assert.equal(telemetry.confidenceBand, 'medium');
  assert.equal(telemetry.riskBand, 'NONE');
  assert.equal(telemetry.fallback, false);
});

test('telemetria: emit respeita adaptador que nunca grava dados', () => {
  let received = null;
  const adapter = (payload) => {
    received = payload;
  };
  emitReflectionTelemetry(
    {
      outcome: 'USER_CORRECTED',
      signalTypes: ['USER_CORRECTION'],
      candidateTypes: ['CATEGORY_PREFERENCE'],
      latencyMs: 4.2,
    },
    adapter,
  );
  assert.ok(received);
  assert.equal(received.outcome, 'USER_CORRECTED');
  assert.equal(received.signalTypes, '[redacted]');
  assert.equal(received.candidateTypes, '[redacted]');
});

test('telemetria: emit sem adaptador não lança', () => {
  assert.doesNotThrow(() => emitReflectionTelemetry({ outcome: 'UNKNOWN' }, null));
  assert.doesNotThrow(() => emitReflectionTelemetry({ outcome: 'UNKNOWN' }));
});

test('telemetria: todo campo da allowlist é permitido pelo redator', () => {
  for (const field of REFLECTION_TELEMETRY_ALLOWED_FIELDS) {
    const redacted = redactReflectionTelemetry({ [field]: 'valor-estrutural' });
    assert.ok(Object.hasOwn(redacted, field), `campo ${field} deve sobreviver`);
  }
});

test('telemetria: redação é determinística', () => {
  const input = { outcome: 'UNKNOWN', signalTypes: ['A'], latencyMs: 1.5 };
  assert.deepEqual(redactReflectionTelemetry(input), redactReflectionTelemetry(input));
});
