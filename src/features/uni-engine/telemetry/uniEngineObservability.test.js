import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createTelemetryAdapter,
  createTelemetryClient,
} from '../../observability/index.js';
import {
  recordFinancialShadowValidation,
  recordShadowFailure,
  recordShadowResult,
  recordShadowStarted,
  recordToolCallingProposal,
  recordToolCallingResult,
} from './uniEngineObservability.js';

const RAW_IDS = Object.freeze({
  userId: 'user-private-123',
  workspaceId: 'workspace-private-456',
  conversationId: 'conversation-private-789',
  messageId: 'message-private-012',
  turnId: 'turn-private-345',
});

function createHarness() {
  const envelopes = [];
  const client = createTelemetryClient({
    enabled: true,
    sessionSalt: 'shadow-observability-test-salt-123456789',
    context: { environment: 'test', release: 'test-release', appVersion: '1', origin: 'test' },
    adapters: [createTelemetryAdapter({
      name: 'test',
      enabled: true,
      send: (envelope) => envelopes.push(envelope),
    })],
  });
  return {
    envelopes,
    api: {
      event: client.recordEvent,
      error: client.recordError,
      metric: client.recordMetric,
    },
  };
}

test('Shadow emite início, módulos, validações, resultado e latência sem conteúdo sensível', async () => {
  const { api, envelopes } = createHarness();
  const input = {
    message: { id: RAW_IDS.messageId, text: 'texto privado com R$ 999' },
    session: RAW_IDS,
  };
  const result = {
    correlationId: 'request-private-678',
    enabled: true,
    fallbackUsed: false,
    classification: { primaryIntent: 'register_expense', safetyBlocked: false },
    plan: { decision: 'ask' },
    validation: { valid: true, errors: [] },
    decisionLayer: { decisionType: 'ask' },
    activation: {
      decisions: [{
        activationStatus: 'SHADOW_ONLY',
        capability: 'QUESTION_GUIDANCE',
        fallbackUsed: true,
        fallbackReason: null,
        risk: 'LOW',
        telemetry: { confidenceBand: 'high', circuitBreakerStatus: 'closed' },
      }],
    },
    diagnostics: { errorCode: null, latencyMs: 4.2 },
  };

  await recordShadowStarted({ api, input, correlationId: result.correlationId });
  await recordShadowResult({ api, input, result });

  assert.ok(envelopes.some((entry) => entry.name === 'uni_engine.shadow_started'));
  assert.ok(envelopes.some((entry) => entry.name === 'uni_engine.shadow_completed'));
  assert.ok(envelopes.some((entry) => entry.name === 'activation.evaluated'));
  assert.ok(envelopes.some((entry) => entry.name === 'uni_engine.latency_ms'));
  const serialized = JSON.stringify(envelopes);
  assert.equal(serialized.includes('texto privado'), false);
  assert.equal(serialized.includes('999'), false);
  for (const rawId of [...Object.values(RAW_IDS), result.correlationId]) {
    assert.equal(serialized.includes(rawId), false);
  }
  assert.ok(envelopes.every((entry) => entry.data.executionAllowed !== true));
  assert.ok(envelopes.every((entry) => entry.data.writes !== true));
});

test('validações financeira e de segurança expõem somente status e códigos', async () => {
  const { api, envelopes } = createHarness();
  await recordFinancialShadowValidation({
    api,
    identity: RAW_IDS,
    runtimeResult: { intent: { type: 'balance_query' }, latencyMs: 3, narrative: { text: 'privado' } },
    factualValidation: { valid: false, reasonCodes: ['FACTS_INVALID'], privateText: 'não enviar' },
    safetyValidation: { approved: true, reasonCodes: [] },
  });

  assert.equal(envelopes.length, 2);
  assert.deepEqual(envelopes.map((entry) => entry.data.stage), ['factual_validation', 'safety_validation']);
  assert.equal(JSON.stringify(envelopes).includes('privado'), false);
});

test('Tool Calling registra proposta, recusa, permissão conceitual, timeout e erro sem argumentos', async () => {
  const { api, envelopes } = createHarness();
  await recordToolCallingProposal({
    api,
    identity: RAW_IDS,
    count: 1,
    authorization: { authorized: false, reason: 'SHADOW_MODE', arguments: { amount: 500 } },
  });
  await recordToolCallingProposal({
    api,
    identity: RAW_IDS,
    count: 1,
    authorization: { authorized: true, executionAllowed: false, reason: 'SHADOW_MODE' },
  });
  await recordToolCallingResult({
    api,
    identity: RAW_IDS,
    result: {
      count: 1,
      executed: false,
      reason: 'TOOL_CALLS_PROCESSED',
      responseText: 'resposta privada',
      results: [{ status: 'timeout', errorCode: 'TOOL_TIMEOUT', arguments: { amount: 500 } }],
    },
  });

  assert.ok(envelopes.some((entry) => entry.data.decision === 'refused'));
  assert.ok(envelopes.some((entry) => entry.data.decision === 'conceptually_allowed'));
  assert.ok(envelopes.some((entry) => entry.data.status === 'timeout'));
  assert.ok(envelopes.some((entry) => entry.kind === 'error'));
  const serialized = JSON.stringify(envelopes);
  assert.equal(serialized.includes('resposta privada'), false);
  assert.equal(serialized.includes('500'), false);
});

test('falha técnica e falha do adapter permanecem fail-safe', async () => {
  const api = {
    event() { throw new Error('adapter offline'); },
    error() { return Promise.reject(new Error('adapter offline')); },
    metric() { throw new Error('adapter offline'); },
  };
  await assert.doesNotReject(() => recordShadowFailure({
    api,
    input: { message: {}, session: {} },
    errorCode: 'ENGINE_INTERNAL_ERROR',
    latencyMs: 2,
  }));
});
