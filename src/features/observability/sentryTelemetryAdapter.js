import * as SentryBrowser from '@sentry/browser';

import { createDisabledExternalAdapter, createTelemetryAdapter } from './telemetryAdapters.js';
import { deepFreezeTelemetry } from './telemetryContracts.js';

const SAFE_CODE = /^[A-Za-z0-9_.:-]{1,80}$/;
const SAFE_EVENT_ID = /^[a-f0-9]{32}$/i;
const SAFE_PSEUDONYM = /^psn_[a-f0-9]{32}$/;

function safeCode(value, fallback = null) {
  return typeof value === 'string' && SAFE_CODE.test(value) ? value : fallback;
}

function safeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function isValidSentryDsn(value) {
  if (typeof value !== 'string' || !value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && Boolean(url.username)
      && /^\/[A-Za-z0-9._-]+$/.test(url.pathname);
  } catch {
    return false;
  }
}

function sanitizeTags(tags = {}) {
  const result = {};
  for (const [key, value] of Object.entries(tags)) {
    if (!safeCode(key) || !safeCode(value)) continue;
    result[key] = value;
  }
  return result;
}

function sanitizeTelemetryContext(context = {}) {
  const result = {};
  for (const [key, value] of Object.entries(context)) {
    const safeKey = safeCode(key);
    if (!safeKey) continue;
    if (typeof value === 'boolean') result[safeKey] = value;
    else if (typeof value === 'number') {
      const normalized = safeNumber(value);
      if (normalized !== null) result[safeKey] = normalized;
    } else {
      const normalized = safeCode(value);
      if (normalized) result[safeKey] = normalized;
    }
  }
  return result;
}

export function sanitizeSentryEvent(event = {}) {
  if (event?.tags?.['uniflow.telemetry'] !== 'v1') return null;

  const message = safeCode(event.message);
  const level = safeCode(event.level, 'info');
  const environment = safeCode(event.environment, 'unknown');
  const release = safeCode(event.release);
  const telemetryContext = sanitizeTelemetryContext(event.contexts?.telemetry);
  if (!message || !telemetryContext.kind || !telemetryContext.name) return null;

  return {
    ...(SAFE_EVENT_ID.test(event.event_id ?? '') ? { event_id: event.event_id } : {}),
    ...(safeNumber(event.timestamp) !== null ? { timestamp: event.timestamp } : {}),
    platform: 'javascript',
    level,
    message,
    environment,
    ...(release ? { release } : {}),
    tags: sanitizeTags(event.tags),
    contexts: { telemetry: telemetryContext },
  };
}

function buildSentryContext(envelope) {
  return {
    version: envelope.version,
    kind: envelope.kind,
    name: envelope.name,
    ...envelope.data,
  };
}

function sendEnvelopeToSentry(sdk, envelope) {
  const level = envelope.kind === 'error' ? 'error' : 'info';
  return sdk.withScope((scope) => {
    scope.clear?.();
    scope.setLevel?.(level);
    scope.setTag?.('uniflow.telemetry', 'v1');
    scope.setTag?.('telemetry.kind', envelope.kind);
    scope.setTag?.('telemetry.name', envelope.name);
    for (const [scopeName, pseudonym] of Object.entries(envelope.correlation ?? {})) {
      if (SAFE_PSEUDONYM.test(pseudonym)) {
        scope.setTag?.(`correlation.${scopeName}`, pseudonym);
      }
    }
    scope.setContext?.('telemetry', buildSentryContext(envelope));
    return sdk.captureMessage(envelope.name, level);
  });
}

export function createSentryTelemetryAdapter({
  dsn = '',
  enabled = false,
  context = {},
  sdk = SentryBrowser,
} = {}) {
  const configured = enabled === true && isValidSentryDsn(dsn);
  if (!configured) {
    return deepFreezeTelemetry({
      initialized: false,
      reason: enabled === true ? 'dsn_missing_or_invalid' : 'disabled',
      adapter: createDisabledExternalAdapter('sentry'),
    });
  }

  try {
    sdk.init({
      dsn,
      enabled: true,
      environment: context.environment,
      release: context.release ?? undefined,
      sendDefaultPii: false,
      defaultIntegrations: false,
      integrations: [],
      autoSessionTracking: false,
      attachStacktrace: false,
      maxBreadcrumbs: 0,
      tracesSampleRate: 0,
      beforeBreadcrumb: () => null,
      beforeSend: sanitizeSentryEvent,
    });

    return deepFreezeTelemetry({
      initialized: true,
      reason: null,
      adapter: createTelemetryAdapter({
        name: 'sentry',
        enabled: true,
        send: (envelope) => sendEnvelopeToSentry(sdk, envelope),
      }),
    });
  } catch {
    return deepFreezeTelemetry({
      initialized: false,
      reason: 'initialization_failed',
      adapter: createDisabledExternalAdapter('sentry'),
    });
  }
}
