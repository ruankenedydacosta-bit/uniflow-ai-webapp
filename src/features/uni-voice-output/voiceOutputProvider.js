import { createPremiumVoiceProvider } from './premiumVoiceProvider.js';

export function createVoiceOutputProviders(options = {}) {
  return Object.freeze({
    elevenlabs_demo: createPremiumVoiceProvider(options),
  });
}

export function getVoiceOutputProvider(providers, providerName) {
  return providers?.[providerName] ?? null;
}
