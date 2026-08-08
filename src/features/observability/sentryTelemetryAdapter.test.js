import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSentryTelemetryAdapter,
  createTelemetryClient,
  sanitizeSentryEvent,
} from './index.js';

const TEST_DSN = 'https://public@example.ingest.sentry.io/12345';
const SESSION_SALT = '0123456789abcdef0123456789abcdef';

function createFakeSentrySdk({ failInit = false, failCapture = false } = {}) {
  const calls = { init: [], messages: [], scopes: [] };
  let options = null;
  return {
    calls,
    init(nextOptions) {
      if (failInit) throw new Error('sdk_init_failed');
      options = nextOptions;
      calls.init.push(nextOptions);
    },
    withScope(callback) {
      const scope = {
        tags: {},
        contexts: {},
        clear() {},
        setLevel(level) { this.level = level; },
        setTag(key, value) { this.tags[key] = value; },
        setContext(key, value) { this.contexts[key] = value; },
      };
      calls.scopes.push(scope);
      return callback(scope);
    },
    captureMessage(message, level) {
      if (failCapture) throw new Error('sdk_capture_failed');
      const scope = calls.scopes.at(-1);
      const candidate = {
        event_id: '0123456789abcdef0123456789abcdef',
        timestamp: 1786200000,
        message,
        level,
        environment: options?.environment,
        release: options?.release,
        tags: scope?.tags,
        contexts: scope?.contexts,
        user: { id: 'must-not-survive' },
        request: { url: 'https://private.test/path?token=secret' },
        breadcrumbs: [{ message: 'private breadcrumb' }],
      };
      const sanitized = options?.beforeSend?.(candidate) ?? null;
      calls.messages.push(sanitized);
      return candidate.event_id;
    },
  };
}

test('Sentry permanece desativado sem DSN mesmo quando solicitado', () => {
  const sdk = createFakeSentrySdk();
  const result = createSentryTelemetryAdapter({ enabled: true, dsn: '', sdk });

  assert.equal(result.initialized, false);
  assert.equal(result.reason, 'dsn_missing_or_invalid');
  assert.equal(result.adapter.enabled, false);
  assert.equal(sdk.calls.init.length, 0);
});

test('inicialização privacy-first desliga PII, integrações automáticas, replay e tracing', () => {
  const sdk = createFakeSentrySdk();
  const result = createSentryTelemetryAdapter({
    enabled: true,
    dsn: TEST_DSN,
    context: { environment: 'preview', release: 'release-123' },
    sdk,
  });

  assert.equal(result.initialized, true);
  assert.equal(sdk.calls.init.length, 1);
  const config = sdk.calls.init[0];
  assert.equal(config.sendDefaultPii, false);
  assert.equal(config.defaultIntegrations, false);
  assert.deepEqual(config.integrations, []);
  assert.equal(config.autoSessionTracking, false);
  assert.equal(config.maxBreadcrumbs, 0);
  assert.equal(config.tracesSampleRate, 0);
  assert.equal(Object.hasOwn(config, 'replaysSessionSampleRate'), false);
  assert.equal(config.environment, 'preview');
  assert.equal(config.release, 'release-123');
});

test('erro técnico permitido chega ao adapter somente como envelope sanitizado', async () => {
  const sdk = createFakeSentrySdk();
  const sentry = createSentryTelemetryAdapter({
    enabled: true,
    dsn: TEST_DSN,
    context: { environment: 'test', release: 'lote-2' },
    sdk,
  });
  const client = createTelemetryClient({
    enabled: true,
    context: { environment: 'test', release: 'lote-2', appVersion: '1.0.0', origin: 'test' },
    sessionSalt: SESSION_SALT,
    adapters: [sentry.adapter],
  });

  const result = await client.recordError('edge_function.failure', {
    errorCode: 'HTTP_502',
    stage: 'uni_llm',
    source: 'edge_function',
    recoverable: true,
    message: 'texto privado',
    amount: 999,
    email: 'person@example.com',
  }, {
    userId: 'raw-user-id',
    workspaceId: 'raw-workspace-id',
    messageId: 'raw-message-id',
  });

  assert.equal(result.delivery.delivered, 1);
  assert.equal(sdk.calls.messages.length, 1);
  const serialized = JSON.stringify(sdk.calls.messages[0]);
  assert.equal(serialized.includes('texto privado'), false);
  assert.equal(serialized.includes('person@example.com'), false);
  assert.equal(serialized.includes('raw-user-id'), false);
  assert.equal(serialized.includes('raw-workspace-id'), false);
  assert.equal(serialized.includes('raw-message-id'), false);
  assert.equal(serialized.includes('999'), false);
  assert.match(sdk.calls.scopes[0].tags['correlation.user'], /^psn_[a-f0-9]{32}$/);
});

test('beforeSend rejeita eventos externos e remove request, user e breadcrumbs', () => {
  assert.equal(sanitizeSentryEvent({ message: 'raw.error' }), null);

  const result = sanitizeSentryEvent({
    message: 'bootstrap.failure',
    level: 'error',
    environment: 'test',
    tags: { 'uniflow.telemetry': 'v1', unsafe: 'value with spaces' },
    contexts: { telemetry: { kind: 'error', name: 'bootstrap.failure', stage: 'global_error' } },
    user: { email: 'private@example.com' },
    request: { url: 'https://private.test' },
    breadcrumbs: [{ message: 'private' }],
  });

  assert.equal(result.user, undefined);
  assert.equal(result.request, undefined);
  assert.equal(result.breadcrumbs, undefined);
  assert.equal(result.tags.unsafe, undefined);
  assert.equal(result.contexts.telemetry.stage, 'global_error');
});

test('falha do SDK durante envio permanece fail-safe para o usuário', async () => {
  const sdk = createFakeSentrySdk({ failCapture: true });
  const sentry = createSentryTelemetryAdapter({ enabled: true, dsn: TEST_DSN, sdk });
  const client = createTelemetryClient({
    enabled: true,
    sessionSalt: SESSION_SALT,
    adapters: [sentry.adapter],
  });

  const result = await client.recordError('auth.failure', {
    errorCode: 'INVALID_CREDENTIALS',
    stage: 'sign_in_password',
    source: 'supabase',
    recoverable: true,
  });

  assert.equal(result.accepted, true);
  assert.deepEqual(result.delivery, { delivered: 0, failed: 1 });
});

test('falha de inicialização do SDK produz adapter desativado', () => {
  const sdk = createFakeSentrySdk({ failInit: true });
  const result = createSentryTelemetryAdapter({ enabled: true, dsn: TEST_DSN, sdk });

  assert.equal(result.initialized, false);
  assert.equal(result.reason, 'initialization_failed');
  assert.equal(result.adapter.enabled, false);
});
