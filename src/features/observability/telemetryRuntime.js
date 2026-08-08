import { createTelemetryClient } from './telemetryClient.js';
import { createTelemetryContext } from './telemetryContext.js';
import { createSentryTelemetryAdapter } from './sentryTelemetryAdapter.js';

const SAFE_ERROR_CODE = /^[A-Za-z0-9_.:-]{1,80}$/;

let activeClient = createTelemetryClient();
let runtimeState = Object.freeze({
  enabled: false,
  sentryInitialized: false,
  context: createTelemetryContext(),
});

function isEnabled(value) {
  return String(value ?? '').trim().toLowerCase() === 'true';
}

function resolveEnvironment(env) {
  if (env?.MODE === 'test') return 'test';
  if (env?.DEV === true || env?.MODE === 'development') return 'development';
  if (env?.VITE_VERCEL_ENV === 'preview') return 'preview';
  if (env?.PROD === true || env?.MODE === 'production') return 'production';
  return 'unknown';
}

export function resolveTelemetryOrigin(runtime = globalThis) {
  const navigator = runtime?.navigator;
  const userAgent = String(navigator?.userAgent ?? '');
  const standalone = runtime?.matchMedia?.('(display-mode: standalone)')?.matches === true
    || navigator?.standalone === true;
  if (standalone) return 'pwa';
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios_safari';
  if (/Android/i.test(userAgent) && /Chrome|CriOS/i.test(userAgent)) return 'android_chrome';
  return 'web';
}

export function normalizeTelemetryErrorCode(value, fallback = 'UNKNOWN_ERROR') {
  return typeof value === 'string' && SAFE_ERROR_CODE.test(value) ? value : fallback;
}

export function resolveTelemetryRuntimeConfig(env = {}, runtime = globalThis) {
  const context = createTelemetryContext({
    environment: resolveEnvironment(env),
    release: env.VITE_APP_RELEASE ?? null,
    appVersion: env.VITE_APP_VERSION ?? null,
    origin: resolveTelemetryOrigin(runtime),
  });
  const enabled = isEnabled(env.VITE_UNIFLOW_TELEMETRY_ENABLED);
  return Object.freeze({
    enabled,
    sentryEnabled: enabled && isEnabled(env.VITE_SENTRY_ENABLED),
    sentryDsn: typeof env.VITE_SENTRY_DSN === 'string' ? env.VITE_SENTRY_DSN : '',
    context,
  });
}

export function initializeTelemetry({
  env = import.meta.env ?? {},
  runtime = globalThis,
  sentrySdk,
} = {}) {
  const config = resolveTelemetryRuntimeConfig(env, runtime);
  const sentry = createSentryTelemetryAdapter({
    dsn: config.sentryDsn,
    enabled: config.sentryEnabled,
    context: config.context,
    ...(sentrySdk ? { sdk: sentrySdk } : {}),
  });

  activeClient = createTelemetryClient({
    enabled: config.enabled,
    context: config.context,
    adapters: [sentry.adapter],
  });
  runtimeState = Object.freeze({
    enabled: config.enabled,
    sentryInitialized: sentry.initialized,
    sentryReason: sentry.reason,
    context: config.context,
  });
  return runtimeState;
}

export const telemetry = Object.freeze({
  event: (name, data, identity) => activeClient.recordEvent(name, data, identity),
  error: (name, data, identity) => activeClient.recordError(name, data, identity),
  metric: (name, data, identity) => activeClient.recordMetric(name, data, identity),
  getState: () => runtimeState,
});

export function resetTelemetryRuntimeForTests() {
  activeClient = createTelemetryClient();
  runtimeState = Object.freeze({
    enabled: false,
    sentryInitialized: false,
    context: createTelemetryContext({ environment: 'test', origin: 'test' }),
  });
}
