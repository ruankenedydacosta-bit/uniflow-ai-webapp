import {
  denyGa4AnalyticsConsent,
  grantGa4AnalyticsConsent,
  setGa4AnalyticsConsent,
} from './ga4Client.js';
import { GA4_CONSENT_STATUS } from './ga4Contracts.js';
import {
  persistAnalyticsConsent,
  readAnalyticsConsent,
  resolveAnalyticsConsentStorage,
} from './analyticsConsentStorage.js';

const DEFAULT_ANALYTICS_API = Object.freeze({
  denyConsent: denyGa4AnalyticsConsent,
  grantConsent: grantGa4AnalyticsConsent,
  setConsent: setGa4AnalyticsConsent,
});

function createState(status, persistence, isConsentHydrated) {
  return Object.freeze({ status, persistence, isConsentHydrated });
}

export function createAnalyticsConsentController({
  analyticsApi = DEFAULT_ANALYTICS_API,
  storage = resolveAnalyticsConsentStorage(),
} = {}) {
  let initialized = false;
  let state = createState(GA4_CONSENT_STATUS.UNKNOWN, 'unknown', false);
  const listeners = new Set();

  function publish(nextState) {
    if (
      state.status === nextState.status
      && state.persistence === nextState.persistence
      && state.isConsentHydrated === nextState.isConsentHydrated
    ) {
      return state;
    }

    state = nextState;
    listeners.forEach((listener) => {
      try {
        listener();
      } catch {
        // Consentimento nunca interfere na aplicação consumidora.
      }
    });
    return state;
  }

  function applyRestoredConsent(status) {
    try {
      analyticsApi.setConsent?.(status);
    } catch {
      // GA4 é opcional e fail-open para a UniFlow.
    }
  }

  function initialize() {
    if (initialized) return state;
    initialized = true;

    const restored = readAnalyticsConsent(storage);
    applyRestoredConsent(restored.status);

    return publish(createState(
      restored.status,
      restored.status === GA4_CONSENT_STATUS.UNKNOWN
        ? (restored.storageAvailable ? 'not_saved' : 'unavailable')
        : 'persisted',
      true,
    ));
  }

  function choose(status) {
    if (
      status !== GA4_CONSENT_STATUS.GRANTED
      && status !== GA4_CONSENT_STATUS.DENIED
    ) {
      return state;
    }

    if (!initialized) initialize();
    const persisted = persistAnalyticsConsent(storage, status);

    try {
      if (status === GA4_CONSENT_STATUS.GRANTED) {
        analyticsApi.grantConsent?.();
      } else {
        analyticsApi.denyConsent?.();
      }
    } catch {
      // A decisão local permanece válida mesmo se GA4 estiver indisponível.
    }

    return publish(createState(status, persisted ? 'persisted' : 'session_only', true));
  }

  return Object.freeze({
    initialize,
    accept: () => choose(GA4_CONSENT_STATUS.GRANTED),
    deny: () => choose(GA4_CONSENT_STATUS.DENIED),
    setConsent: choose,
    getState: () => state,
    subscribe(listener) {
      if (typeof listener !== 'function') return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
}

const analyticsConsentController = createAnalyticsConsentController();

export function initializeAnalyticsConsent() {
  return analyticsConsentController.initialize();
}

export function acceptAnalyticsConsent() {
  return analyticsConsentController.accept();
}

export function refuseAnalyticsConsent() {
  return analyticsConsentController.deny();
}

export function setAnalyticsConsentPreference(status) {
  return analyticsConsentController.setConsent(status);
}

export function getAnalyticsConsentState() {
  return analyticsConsentController.getState();
}

export function subscribeAnalyticsConsent(listener) {
  return analyticsConsentController.subscribe(listener);
}
