import {
  GA4_CONSENT_STATUS,
  GA4_SCRIPT_ID,
  buildGa4PageView,
  buildGa4SafeEventContext,
  resolveGa4Config,
} from './ga4Contracts.js';
import { buildGa4ProductEvent } from './ga4ProductContracts.js';

const GOOGLE_TAG_BASE_URL = 'https://www.googletagmanager.com/gtag/js';

function hasDom(runtime) {
  return Boolean(
    runtime?.document
    && typeof runtime.document.createElement === 'function'
    && runtime.document.head
    && typeof runtime.document.head.appendChild === 'function',
  );
}

export function createGa4Client({ runtime = globalThis } = {}) {
  let config = resolveGa4Config();
  let consent = GA4_CONSENT_STATUS.UNKNOWN;
  let initialized = false;
  let loadStatus = 'blocked';
  let lastPageViewPath = null;
  let stateVersion = 0;
  let tagCommand = null;
  const listeners = new Set();

  const publish = () => {
    stateVersion += 1;
    listeners.forEach((listener) => {
      try {
        listener();
      } catch {
        // Analytics nunca interfere na aplicação consumidora.
      }
    });
  };

  const setLoadStatus = (nextStatus) => {
    if (loadStatus === nextStatus) return;
    loadStatus = nextStatus;
    publish();
  };

  const setRuntimeCollectionDisabled = (disabled) => {
    if (!config.hasValidMeasurementId) return;
    try {
      runtime[`ga-disable-${config.measurementId}`] = disabled;
    } catch {
      // A revogação nunca interfere na aplicação consumidora.
    }
  };

  const activateIfAllowed = () => {
    if (consent === GA4_CONSENT_STATUS.DENIED) {
      setRuntimeCollectionDisabled(true);
    }

    if (!config.enabled) {
      setLoadStatus(config.requestedEnabled ? 'missing_configuration' : 'disabled');
      return false;
    }

    if (consent !== GA4_CONSENT_STATUS.GRANTED) {
      setLoadStatus('blocked');
      return false;
    }

    setRuntimeCollectionDisabled(false);

    if (initialized) return true;
    if (!hasDom(runtime)) {
      setLoadStatus('unavailable');
      return false;
    }

    try {
      const dataLayer = Array.isArray(runtime.dataLayer) ? runtime.dataLayer : [];
      runtime.dataLayer = dataLayer;
      tagCommand = typeof runtime.gtag === 'function'
        ? runtime.gtag
        : function gtag() {
            dataLayer.push(arguments);
          };
      runtime.gtag = tagCommand;

      tagCommand('js', new Date());
      tagCommand('config', config.measurementId, { send_page_view: false });

      const existingScript = runtime.document.getElementById?.(GA4_SCRIPT_ID);
      if (!existingScript) {
        const script = runtime.document.createElement('script');
        script.id = GA4_SCRIPT_ID;
        script.async = true;
        script.src = `${GOOGLE_TAG_BASE_URL}?id=${encodeURIComponent(config.measurementId)}`;
        script.onload = () => setLoadStatus('ready');
        script.onerror = () => setLoadStatus('failed');
        runtime.document.head.appendChild(script);
      }

      initialized = true;
      setLoadStatus(existingScript ? 'ready' : 'loading');
      return true;
    } catch {
      tagCommand = null;
      setLoadStatus('failed');
      return false;
    }
  };

  const initialize = (env = {}) => {
    const nextConfig = resolveGa4Config(env);
    const configChanged = nextConfig.enabled !== config.enabled
      || nextConfig.requestedEnabled !== config.requestedEnabled
      || nextConfig.measurementId !== config.measurementId;
    config = nextConfig;

    const activated = activateIfAllowed();
    if (configChanged && !activated) publish();
    return getState();
  };

  const setConsent = (nextConsent) => {
    if (!Object.values(GA4_CONSENT_STATUS).includes(nextConsent)) return false;
    if (consent === nextConsent) return activateIfAllowed();

    consent = nextConsent;
    if (nextConsent !== GA4_CONSENT_STATUS.GRANTED) {
      lastPageViewPath = null;
    }
    activateIfAllowed();
    publish();
    return nextConsent !== GA4_CONSENT_STATUS.GRANTED || initialized;
  };

  const trackPageView = ({ pathname, origin = runtime?.location?.origin } = {}) => {
    if (!config.enabled || consent !== GA4_CONSENT_STATUS.GRANTED || !initialized) {
      return Object.freeze({ sent: false, reason: 'blocked' });
    }

    const pageView = buildGa4PageView(pathname, origin);
    if (!pageView) return Object.freeze({ sent: false, reason: 'excluded' });

    const safeContext = buildGa4SafeEventContext({
      location: pageView.page_location,
      referrer: runtime?.document?.referrer,
    });
    if (!safeContext) return Object.freeze({ sent: false, reason: 'unsafe_context' });

    const safePageView = Object.freeze({
      ...pageView,
      ...safeContext,
    });

    const canonicalPathname = new URL(safePageView.page_location).pathname;
    if (canonicalPathname === lastPageViewPath) {
      return Object.freeze({ sent: false, reason: 'duplicate' });
    }

    try {
      tagCommand?.('event', 'page_view', safePageView);
      lastPageViewPath = canonicalPathname;
      return Object.freeze({ sent: true, reason: 'sent', pageView: safePageView });
    } catch {
      return Object.freeze({ sent: false, reason: 'failed' });
    }
  };

  const trackProductEvent = (eventName, params) => {
    if (!config.enabled || consent !== GA4_CONSENT_STATUS.GRANTED || !initialized) {
      return Object.freeze({ sent: false, reason: 'blocked' });
    }

    const event = buildGa4ProductEvent(eventName, params);
    if (!event) return Object.freeze({ sent: false, reason: 'invalid' });

    const safeContext = buildGa4SafeEventContext({
      location: runtime?.location,
      referrer: runtime?.document?.referrer,
    });
    if (!safeContext) return Object.freeze({ sent: false, reason: 'unsafe_context' });

    const safeParams = Object.freeze({
      ...event.params,
      ...safeContext,
    });

    try {
      tagCommand?.('event', event.eventName, safeParams);
      return Object.freeze({ sent: true, reason: 'sent' });
    } catch {
      return Object.freeze({ sent: false, reason: 'failed' });
    }
  };

  function getState() {
    return Object.freeze({
      enabled: config.enabled,
      measurementIdConfigured: config.hasValidMeasurementId,
      consent,
      initialized,
      loadStatus,
    });
  }

  return Object.freeze({
    initialize,
    setConsent,
    grantConsent: () => setConsent(GA4_CONSENT_STATUS.GRANTED),
    denyConsent: () => setConsent(GA4_CONSENT_STATUS.DENIED),
    trackPageView,
    trackProductEvent,
    getState,
    getStateVersion: () => stateVersion,
    subscribe(listener) {
      if (typeof listener !== 'function') return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
}

const ga4Client = createGa4Client();

export function initializeGa4({ env = import.meta.env ?? {} } = {}) {
  return ga4Client.initialize(env);
}

export function setGa4AnalyticsConsent(status) {
  return ga4Client.setConsent(status);
}

export function grantGa4AnalyticsConsent() {
  return ga4Client.grantConsent();
}

export function denyGa4AnalyticsConsent() {
  return ga4Client.denyConsent();
}

export function trackGa4PageView(page) {
  return ga4Client.trackPageView(page);
}

export function emitGa4ProductEvent(eventName, params) {
  return ga4Client.trackProductEvent(eventName, params);
}

export function subscribeGa4State(listener) {
  return ga4Client.subscribe(listener);
}

export function getGa4StateVersion() {
  return ga4Client.getStateVersion();
}

export function getGa4State() {
  return ga4Client.getState();
}
