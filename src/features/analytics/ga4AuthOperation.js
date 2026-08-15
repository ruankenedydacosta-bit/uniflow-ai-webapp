import {
  GA4_AUTH_METHODS,
  GA4_PRODUCT_EVENT_NAMES,
} from './ga4ProductContracts.js';
import { trackGa4Login } from './ga4ProductEvents.js';

const PENDING_GOOGLE_AUTH_KEY = 'uniflow:ga4-google-auth:v1';
const GOOGLE_AUTH_EVENT = GA4_PRODUCT_EVENT_NAMES.LOGIN;

function resolveStorage(storage) {
  if (storage !== undefined) return storage;
  try {
    return globalThis.sessionStorage;
  } catch {
    return null;
  }
}

export function persistPendingGa4GoogleAuth(eventName, storage) {
  if (eventName !== GOOGLE_AUTH_EVENT) return false;
  const resolvedStorage = resolveStorage(storage);
  try {
    resolvedStorage?.setItem(PENDING_GOOGLE_AUTH_KEY, eventName);
    return resolvedStorage?.getItem(PENDING_GOOGLE_AUTH_KEY) === eventName;
  } catch {
    return false;
  }
}

export function readPendingGa4GoogleAuth(storage) {
  const resolvedStorage = resolveStorage(storage);
  try {
    const eventName = resolvedStorage?.getItem(PENDING_GOOGLE_AUTH_KEY);
    return eventName === GOOGLE_AUTH_EVENT ? eventName : null;
  } catch {
    return null;
  }
}

export function clearPendingGa4GoogleAuth(storage) {
  const resolvedStorage = resolveStorage(storage);
  try {
    resolvedStorage?.removeItem(PENDING_GOOGLE_AUTH_KEY);
    return true;
  } catch {
    return false;
  }
}

export function trackConfirmedGa4GoogleAuth({
  storage,
  trackLogin = trackGa4Login,
} = {}) {
  const eventName = readPendingGa4GoogleAuth(storage);
  if (!eventName) return Object.freeze({ sent: false, reason: 'missing_pending_auth' });
  clearPendingGa4GoogleAuth(storage);

  try {
    return trackLogin(GA4_AUTH_METHODS.GOOGLE);
  } catch {
    return Object.freeze({ sent: false, reason: 'failed' });
  }
}
