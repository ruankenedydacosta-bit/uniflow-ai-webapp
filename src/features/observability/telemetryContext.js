import { TELEMETRY_FOUNDATION_VERSION, deepFreezeTelemetry } from './telemetryContracts.js';

const ENVIRONMENTS = Object.freeze(['development', 'preview', 'production', 'test', 'unknown']);
const ORIGINS = Object.freeze(['web', 'pwa', 'ios_safari', 'android_chrome', 'server', 'test', 'unknown']);
const SAFE_LABEL_PATTERN = /^[A-Za-z0-9._:-]{1,80}$/;

function safeEnum(value, allowed) {
  return typeof value === 'string' && allowed.includes(value) ? value : 'unknown';
}

function safeLabel(value) {
  return typeof value === 'string' && SAFE_LABEL_PATTERN.test(value) ? value : null;
}

export function createTelemetryContext({
  environment = 'unknown',
  release = null,
  appVersion = null,
  origin = 'unknown',
} = {}) {
  return deepFreezeTelemetry({
    environment: safeEnum(environment, ENVIRONMENTS),
    release: safeLabel(release),
    appVersion: safeLabel(appVersion),
    origin: safeEnum(origin, ORIGINS),
    telemetryVersion: TELEMETRY_FOUNDATION_VERSION,
  });
}
