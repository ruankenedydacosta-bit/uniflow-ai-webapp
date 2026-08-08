import assert from 'node:assert/strict';
import test from 'node:test';

import {
  initializeTelemetry,
  installGlobalTelemetryHandlers,
  recordReactError,
  recordReactRecoverableError,
  resetTelemetryRuntimeForTests,
  resolveTelemetryRuntimeConfig,
  telemetry,
} from './index.js';

const TEST_DSN = 'https://public@example.ingest.sentry.io/12345';

function createRuntime() {
  const listeners = new Map();
  return {
    navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS) AppleWebKit Safari' },
    matchMedia: () => ({ matches: false }),
    addEventListener(type, handler) { listeners.set(type, handler); },
    removeEventListener(type, handler) {
      if (listeners.get(type) === handler) listeners.delete(type);
    },
    listeners,
  };
}

function createSdk() {
  return {
    initialized: 0,
    init() { this.initialized += 1; },
    withScope(callback) {
      return callback({ clear() {}, setLevel() {}, setTag() {}, setContext() {} });
    },
    captureMessage() { return 'event-id'; },
  };
}

test.afterEach(() => resetTelemetryRuntimeForTests());

test('gates ausentes mantêm telemetria e Sentry desligados', () => {
  const config = resolveTelemetryRuntimeConfig({}, createRuntime());
  assert.equal(config.enabled, false);
  assert.equal(config.sentryEnabled, false);
  assert.equal(config.context.origin, 'ios_safari');
});

test('Sentry exige fundação, flag própria e DSN válidos simultaneamente', () => {
  const runtime = createRuntime();
  const sdk = createSdk();
  const state = initializeTelemetry({
    env: {
      MODE: 'production',
      PROD: true,
      VITE_UNIFLOW_TELEMETRY_ENABLED: 'true',
      VITE_SENTRY_ENABLED: 'true',
      VITE_SENTRY_DSN: TEST_DSN,
      VITE_APP_RELEASE: 'release-abc',
      VITE_APP_VERSION: '2.1.0',
    },
    runtime,
    sentrySdk: sdk,
  });

  assert.equal(state.enabled, true);
  assert.equal(state.sentryInitialized, true);
  assert.equal(state.context.environment, 'production');
  assert.equal(state.context.release, 'release-abc');
  assert.equal(state.context.appVersion, '2.1.0');
  assert.equal(sdk.initialized, 1);
});

test('DSN ausente impede inicialização sem quebrar a API local', async () => {
  const sdk = createSdk();
  const state = initializeTelemetry({
    env: {
      MODE: 'production',
      PROD: true,
      VITE_UNIFLOW_TELEMETRY_ENABLED: 'true',
      VITE_SENTRY_ENABLED: 'true',
    },
    runtime: createRuntime(),
    sentrySdk: sdk,
  });

  const result = await telemetry.error('bootstrap.failure', {
    errorCode: 'TYPE_ERROR',
    stage: 'global_error',
    source: 'browser',
    recoverable: false,
  });
  assert.equal(state.sentryInitialized, false);
  assert.equal(sdk.initialized, 0);
  assert.equal(result.accepted, true);
  assert.deepEqual(result.delivery, { delivered: 0, failed: 0 });
});

test('listeners globais registram somente códigos técnicos e são removidos', () => {
  const runtime = createRuntime();
  const received = [];
  const api = { error: (name, data) => received.push({ name, data }) };
  const cleanup = installGlobalTelemetryHandlers({ runtime, api });

  runtime.listeners.get('error')({ error: new TypeError('private message') });
  runtime.listeners.get('unhandledrejection')({ reason: new Error('private rejection') });

  assert.deepEqual(received, [
    {
      name: 'bootstrap.failure',
      data: { errorCode: 'TypeError', stage: 'global_error', source: 'browser', recoverable: false },
    },
    {
      name: 'bootstrap.failure',
      data: { errorCode: 'Error', stage: 'unhandled_rejection', source: 'browser', recoverable: false },
    },
  ]);
  assert.equal(JSON.stringify(received).includes('private'), false);

  cleanup();
  assert.equal(runtime.listeners.size, 0);
});

test('erros React fatais e recuperáveis preservam somente o código técnico', async () => {
  const received = [];
  const api = { error: (name, data) => received.push({ name, data }) };

  await recordReactError(new TypeError('private fatal detail'), { api });
  await recordReactRecoverableError(new RangeError('private recoverable detail'), api);

  assert.deepEqual(received, [
    {
      name: 'bootstrap.failure',
      data: { errorCode: 'TypeError', stage: 'react_uncaught', source: 'react', recoverable: false },
    },
    {
      name: 'bootstrap.failure',
      data: { errorCode: 'RangeError', stage: 'react_recoverable', source: 'react', recoverable: true },
    },
  ]);
  assert.equal(JSON.stringify(received).includes('private'), false);
});
