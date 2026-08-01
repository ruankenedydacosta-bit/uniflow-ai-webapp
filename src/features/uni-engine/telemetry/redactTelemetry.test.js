// Testes de redação e telemetria do Uni Engine (Fase 1 — Shadow Mode).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  redactTelemetry,
  TELEMETRY_ALLOWED_FIELDS,
  redactText,
  redactSensitiveValue,
  buildRedactedTelemetryEntry,
} from './redactTelemetry.js';
import {
  buildUniEngineTelemetry,
  emitUniEngineTelemetry,
} from './uniEngineTelemetry.js';
import { UNI_ENGINE_VERSION } from '../uniEngineContracts.js';

const SENSITIVE_ENTRY = {
  correlationId: 'ue_corr_123',
  engineVersion: UNI_ENGINE_VERSION,
  messageType: 'action',
  engineIntent: 'register_expense',
  pipelineIntent: 'register_expense',
  confidence: 0.95,
  decision: 'ask',
  missingFields: ['account'],
  comparisonStatus: 'agreement',
  fallbackUsed: false,
  latencyMs: 3.5,
  errorCode: null,
  messageText: 'Gastei 50 reais no mercado',
  userId: 'user-1',
  email: 'wagner@uniflow.ai',
  accountName: 'Nubank',
  rawPayload: { amount: 50, account: 'Nubank' },
  token: 'sk-secreto',
};

test('segurança 66: telemetria redigida nunca contém texto, IDs ou valores sensíveis', () => {
  const redacted = redactTelemetry(SENSITIVE_ENTRY);
  const serialized = JSON.stringify(redacted);
  assert.equal(Object.hasOwn(redacted, 'messageText'), false);
  assert.equal(Object.hasOwn(redacted, 'userId'), false);
  assert.equal(Object.hasOwn(redacted, 'email'), false);
  assert.equal(Object.hasOwn(redacted, 'accountName'), false);
  assert.equal(Object.hasOwn(redacted, 'rawPayload'), false);
  assert.equal(Object.hasOwn(redacted, 'token'), false);
  assert.equal(serialized.includes('Gastei'), false);
  assert.equal(serialized.includes('user-1'), false);
  assert.equal(serialized.includes('Nubank'), false);
  assert.equal(serialized.includes('sk-secreto'), false);
  assert.ok(Object.keys(redacted).every((key) => TELEMETRY_ALLOWED_FIELDS.includes(key)));
});

test('segurança 67: buildUniEngineTelemetry emite somente campos da allowlist', () => {
  const telemetry = buildUniEngineTelemetry({
    correlationId: 'ue_corr_123',
    classification: {
      messageType: 'action',
      primaryIntent: 'register_expense',
      confidence: 0.9542,
      rulesUsed: ['financial_statement'],
    },
    plan: {
      decision: 'ask',
      missingFields: ['account'],
      theoreticalExecutor: 'PendingActionInput',
    },
    validation: { errors: ['AMOUNT_INVALID'], warnings: [], blockedReasons: [], requiresClarification: true },
    comparison: { status: 'intent_divergence', pipelineIntent: 'register_income' },
    diagnostics: { fallbackUsed: true, errorCode: null },
    latencyMs: 4.123,
  });
  const keys = Object.keys(telemetry);
  assert.ok(keys.every((key) => TELEMETRY_ALLOWED_FIELDS.includes(key)));
  assert.equal(telemetry.engineVersion, UNI_ENGINE_VERSION);
  assert.equal(telemetry.messageType, 'action');
  assert.equal(telemetry.engineIntent, 'register_expense');
  assert.equal(telemetry.pipelineIntent, 'register_income');
  assert.equal(telemetry.confidence, 0.954);
  assert.equal(telemetry.decision, 'ask');
  assert.deepEqual(telemetry.missingFields, ['account']);
  assert.equal(telemetry.comparisonStatus, 'intent_divergence');
  assert.equal(telemetry.fallbackUsed, true);
  assert.equal(telemetry.errorCode, 'AMOUNT_INVALID');
});

test('segurança 68: adapter nunca recebe entrada sensível mesmo com dado arbitrário', () => {
  let received = null;
  const adapter = (entry) => {
    received = entry;
  };
  const redacted = emitUniEngineTelemetry(SENSITIVE_ENTRY, adapter);
  assert.ok(received, 'adapter deve receber o registro redigido');
  const serialized = JSON.stringify(redacted);
  assert.equal(serialized.includes('Gastei'), false);
  assert.equal(serialized.includes('user-1'), false);
  assert.equal(serialized.includes('Nubank'), false);
  assert.equal(serialized.includes('sk-secreto'), false);
  assert.equal(received, redacted);
});

test('segurança: entrada arbitrária é convertida em entrada redigida estruturada', () => {
  const entry = buildRedactedTelemetryEntry({
    messageText: 'Gastei 50 reais no mercado',
    userId: 'user-1',
    correlationId: 'ue_corr_123',
    messageType: 'action',
    engineIntent: 'register_expense',
    confidence: 0.9,
    decision: 'ask',
    missingFields: ['account'],
    comparisonStatus: 'agreement',
    fallbackUsed: false,
    latencyMs: 2,
    errorCode: null,
    lixoDesconhecido: { deep: true },
  });
  assert.equal(entry.messageText, undefined);
  assert.equal(entry.userId, undefined);
  assert.equal(entry.lixoDesconhecido, undefined);
  assert.equal(entry.correlationId, 'ue_corr_123');
  assert.equal(entry.confidence, 0.9);
});

test('segurança: texto de mensagem vira [redacted]', () => {
  assert.equal(redactText('Gastei 50 reais no mercado'), '[redacted]');
  assert.equal(redactText(''), null);
  assert.equal(redactText(null), null);
  assert.equal(redactSensitiveValue(), '[redacted]');
});

test('telemetria: adapter que lança exceção nunca quebra o emissor', () => {
  const throwing = () => {
    throw new Error('adapter quebrado');
  };
  const redacted = emitUniEngineTelemetry({ correlationId: 'ue_x' }, throwing);
  assert.equal(redacted.correlationId, 'ue_x');
});

test('telemetria: campos ausentes viram nulos em vez de quebrar', () => {
  const telemetry = buildUniEngineTelemetry({});
  assert.equal(telemetry.messageType, null);
  assert.equal(telemetry.engineIntent, null);
  assert.equal(telemetry.decision, null);
  assert.equal(telemetry.latencyMs, null);
  assert.equal(telemetry.errorCode, null);
  assert.deepEqual(telemetry.missingFields, []);
});
