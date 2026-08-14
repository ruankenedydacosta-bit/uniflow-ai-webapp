import { GA4_CONSENT_STATUS } from './ga4Contracts.js';

export const ANALYTICS_CONSENT_STORAGE_KEY = 'uniflow:analytics-consent:v1';

const PERSISTED_CONSENT_VALUES = new Set([
  GA4_CONSENT_STATUS.GRANTED,
  GA4_CONSENT_STATUS.DENIED,
]);

export function resolveAnalyticsConsentStorage(runtime = globalThis) {
  try {
    if (!runtime || runtime.window !== runtime) return null;
    return runtime?.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readAnalyticsConsent(storage) {
  if (!storage || typeof storage.getItem !== 'function') {
    return Object.freeze({
      status: GA4_CONSENT_STATUS.UNKNOWN,
      storageAvailable: false,
    });
  }

  try {
    const storedValue = storage.getItem(ANALYTICS_CONSENT_STORAGE_KEY);
    return Object.freeze({
      status: PERSISTED_CONSENT_VALUES.has(storedValue)
        ? storedValue
        : GA4_CONSENT_STATUS.UNKNOWN,
      storageAvailable: true,
    });
  } catch {
    return Object.freeze({
      status: GA4_CONSENT_STATUS.UNKNOWN,
      storageAvailable: false,
    });
  }
}

export function persistAnalyticsConsent(storage, status) {
  if (
    !PERSISTED_CONSENT_VALUES.has(status)
    || !storage
    || typeof storage.setItem !== 'function'
    || typeof storage.getItem !== 'function'
  ) {
    return false;
  }

  try {
    storage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, status);
    return storage.getItem(ANALYTICS_CONSENT_STORAGE_KEY) === status;
  } catch {
    return false;
  }
}
