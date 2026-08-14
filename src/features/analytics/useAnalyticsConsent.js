import { useSyncExternalStore } from 'react';
import {
  acceptAnalyticsConsent,
  getAnalyticsConsentState,
  refuseAnalyticsConsent,
  setAnalyticsConsentPreference,
  subscribeAnalyticsConsent,
} from './analyticsConsentController.js';

export function useAnalyticsConsent() {
  const state = useSyncExternalStore(
    subscribeAnalyticsConsent,
    getAnalyticsConsentState,
    getAnalyticsConsentState,
  );

  return Object.freeze({
    ...state,
    accept: acceptAnalyticsConsent,
    deny: refuseAnalyticsConsent,
    setConsent: setAnalyticsConsentPreference,
  });
}
