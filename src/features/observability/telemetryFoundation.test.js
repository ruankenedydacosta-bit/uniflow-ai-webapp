import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TELEMETRY_KINDS,
  containsForbiddenTelemetryField,
  createDisabledExternalAdapter,
  createPseudonymousCorrelation,
  createTelemetryAdapter,
  createTelemetryClient,
  createTelemetryContext,
  isSanitizedTelemetryData,
  pseudonymizeIdentifier,
  sanitizeTelemetryData,
} from './index.js';

const SESSION_SALT = '0123456789abcdef0123456789abcdef';
const FIXED_TIME = 1786200000000;

test('redaction mantém apenas campos permitidos e primitivos seguros', () => {
  const result = sanitizeTelemetryData(TELEMETRY_KINDS.EVENT, {
    status: 'completed',
    shadowMode: true,
    latencyMs: 12.34567,
    unknown: 'discarded',
  });

  assert.deepEqual(result, { latencyMs: 12.346, shadowMode: true, status: 'completed' });
  assert.equal(isSanitizedTelemetryData(TELEMETRY_KINDS.EVENT, result), true);
  assert.equal(Object.isFrozen(result), true);
});

test('campos proibidos são detectados inclusive em objetos aninhados', () => {
  assert.equal(containsForbiddenTelemetryField({ transcript: 'segredo' }), true);
  assert.equal(containsForbiddenTelemetryField({ safe: { accountName: 'Banco' } }), true);
  assert.equal(containsForbiddenTelemetryField({ status: 'ok' }), false);
});

test('texto, e-mail, URL, token e payloads arbitrários nunca sobrevivem à sanitização', () => {
  const result = sanitizeTelemetryData(TELEMETRY_KINDS.EVENT, {
    status: 'mensagem com espacos',
    source: 'user@example.com',
    provider: 'https://provider.test',
    reasonCode: 'eyJhbGciOi.test.payload',
    message: 'Gastei cinquenta reais',
    token: 'secret',
    payload: { amount: 50 },
  });

  assert.deepEqual(result, {});
});

test('pseudonimização é determinística na sessão e separada por escopo', async () => {
  const first = await pseudonymizeIdentifier('raw-user-id', { scope: 'user', sessionSalt: SESSION_SALT });
  const repeated = await pseudonymizeIdentifier('raw-user-id', { scope: 'user', sessionSalt: SESSION_SALT });
  const workspace = await pseudonymizeIdentifier('raw-user-id', { scope: 'workspace', sessionSalt: SESSION_SALT });

  assert.equal(first, repeated);
  assert.notEqual(first, workspace);
  assert.match(first, /^psn_[a-f0-9]{32}$/);
  assert.equal(first.includes('raw-user-id'), false);
});

test('pseudonimização falha fechada sem Web Crypto', async () => {
  const result = await pseudonymizeIdentifier('raw-id', {
    scope: 'user',
    sessionSalt: SESSION_SALT,
    cryptoProvider: {},
  });
  assert.equal(result, null);
});

test('correlação nunca devolve IDs brutos', async () => {
  const result = await createPseudonymousCorrelation({
    userId: 'user-123',
    workspaceId: 'workspace-456',
    messageId: 'message-789',
  }, { sessionSalt: SESSION_SALT });
  const serialized = JSON.stringify(result);

  assert.equal(serialized.includes('user-123'), false);
  assert.equal(serialized.includes('workspace-456'), false);
  assert.equal(serialized.includes('message-789'), false);
  assert.deepEqual(Object.keys(result), ['user', 'workspace', 'message']);
});

test('contexto técnico aceita somente environment, release, versão e origem seguros', () => {
  const context = createTelemetryContext({
    environment: 'preview',
    release: '7bae41b',
    appVersion: '2.0.0',
    origin: 'ios_safari',
    email: 'ignored@example.com',
  });

  assert.equal(context.environment, 'preview');
  assert.equal(context.release, '7bae41b');
  assert.equal(context.appVersion, '2.0.0');
  assert.equal(context.origin, 'ios_safari');
  assert.equal(Object.hasOwn(context, 'email'), false);
});

test('client nasce desligado e não entrega eventos', async () => {
  let calls = 0;
  const client = createTelemetryClient({
    adapters: [createTelemetryAdapter({ enabled: true, send: () => { calls += 1; } })],
  });
  const result = await client.recordEvent('uni_engine.shadow_completed', { status: 'completed' });

  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'disabled');
  assert.equal(calls, 0);
});

test('evento permitido gera envelope sanitizado e imutável', async () => {
  const received = [];
  const client = createTelemetryClient({
    enabled: true,
    context: { environment: 'test', release: 'gate-0', appVersion: '1.0.0', origin: 'test' },
    sessionSalt: SESSION_SALT,
    now: () => FIXED_TIME,
    adapters: [createTelemetryAdapter({ name: 'test', enabled: true, send: (entry) => received.push(entry) })],
  });
  const result = await client.recordEvent('uni_engine.shadow_completed', {
    status: 'completed',
    shadowMode: true,
    executionAllowed: false,
    message: 'conteúdo proibido',
  }, { userId: 'raw-user' });

  assert.equal(result.accepted, true);
  assert.equal(result.delivery.delivered, 1);
  assert.equal(received.length, 1);
  assert.equal(received[0].data.message, undefined);
  assert.equal(JSON.stringify(received[0]).includes('raw-user'), false);
  assert.equal(Object.isFrozen(received[0]), true);
});

test('nomes de eventos fora do catálogo são rejeitados', async () => {
  const client = createTelemetryClient({ enabled: true, sessionSalt: SESSION_SALT });
  const result = await client.recordEvent('custom.raw_event', { status: 'ok' });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'event_not_allowed');
});

test('eventos, erros e métricas usam contratos separados', async () => {
  const client = createTelemetryClient({ enabled: true, sessionSalt: SESSION_SALT, now: () => FIXED_TIME });
  const event = await client.recordEvent('voice.lifecycle', { status: 'started' });
  const error = await client.recordError('voice.failure', { errorCode: 'PROVIDER_QUOTA', recoverable: true });
  const metric = await client.recordMetric('voice.latency_ms', { value: 42.25, unit: 'ms' });

  assert.equal(event.envelope.kind, 'event');
  assert.equal(error.envelope.kind, 'error');
  assert.equal(metric.envelope.kind, 'metric');
  assert.equal(metric.envelope.data.value, 42.25);
  assert.equal(error.envelope.data.value, undefined);
});

test('métrica sem valor numérico é recusada', async () => {
  const client = createTelemetryClient({ enabled: true, sessionSalt: SESSION_SALT });
  const result = await client.recordMetric('voice.latency_ms', { value: 'quarenta' });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'metric_value_required');
});

test('adapter externo permanece desligado por padrão', async () => {
  const client = createTelemetryClient({
    enabled: true,
    sessionSalt: SESSION_SALT,
    adapters: [createDisabledExternalAdapter('future-sentry')],
  });
  const result = await client.recordEvent('planning.completed', { status: 'ready' });
  assert.deepEqual(result.delivery, { delivered: 0, failed: 0 });
});

test('falha síncrona ou assíncrona de adapter nunca quebra a experiência', async () => {
  const client = createTelemetryClient({
    enabled: true,
    sessionSalt: SESSION_SALT,
    adapters: [
      createTelemetryAdapter({ name: 'throws', enabled: true, send: () => { throw new Error('offline'); } }),
      createTelemetryAdapter({ name: 'rejects', enabled: true, send: async () => Promise.reject(new Error('offline')) }),
    ],
  });

  const result = await client.recordEvent('activation.evaluated', { status: 'blocked' });
  assert.equal(result.accepted, true);
  assert.deepEqual(result.delivery, { delivered: 0, failed: 2 });
});

test('conversa, transcrição, áudio, valores financeiros e secrets não vazam no envelope', async () => {
  const client = createTelemetryClient({ enabled: true, sessionSalt: SESSION_SALT, now: () => FIXED_TIME });
  const sensitive = {
    message: 'Recebi mil reais',
    transcript: 'Recebi mil reais',
    audio: 'base64-audio',
    amount: 1000,
    description: 'Salário',
    token: 'token-secret',
    status: 'completed',
  };
  const result = await client.recordEvent('financial_runtime.evaluated', sensitive, {
    userId: 'raw-user-id',
    workspaceId: 'raw-workspace-id',
    turnId: 'raw-turn-id',
  });
  const serialized = JSON.stringify(result.envelope);

  for (const forbidden of ['Recebi mil reais', 'base64-audio', '1000', 'Salário', 'token-secret', 'raw-user-id', 'raw-workspace-id', 'raw-turn-id']) {
    assert.equal(serialized.includes(forbidden), false, `não deve conter ${forbidden}`);
  }
  assert.equal(result.envelope.data.status, 'completed');
});
