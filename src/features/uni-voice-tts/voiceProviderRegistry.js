export const VOICE_PROVIDER_IDS = Object.freeze({
  NATIVE: 'native',
  ELEVENLABS: 'elevenlabs',
});

export const VOICE_PROVIDER_OPTIONS = Object.freeze([
  Object.freeze({
    id: VOICE_PROVIDER_IDS.NATIVE,
    title: 'Voz Nativa',
    description: 'Voz do Google ou do dispositivo',
    badge: 'Incluída',
  }),
  Object.freeze({
    id: VOICE_PROVIDER_IDS.ELEVENLABS,
    title: 'Uni Premium',
    description: 'Voz natural da Uni',
    badge: 'Premium',
  }),
]);

const VALID_VOICE_PROVIDERS = Object.freeze(Object.values(VOICE_PROVIDER_IDS));

export function isValidVoiceProvider(value) {
  return VALID_VOICE_PROVIDERS.includes(value);
}

export function resolveVoiceProvider(value, fallback = VOICE_PROVIDER_IDS.NATIVE) {
  if (isValidVoiceProvider(value)) return value;
  return isValidVoiceProvider(fallback) ? fallback : VOICE_PROVIDER_IDS.NATIVE;
}

export function createVoiceProviderRegistry({ native, elevenlabs }) {
  const providers = Object.freeze({
    [VOICE_PROVIDER_IDS.NATIVE]: native,
    [VOICE_PROVIDER_IDS.ELEVENLABS]: elevenlabs,
  });

  return Object.freeze({
    get(providerId) {
      return providers[resolveVoiceProvider(providerId)] ?? providers[VOICE_PROVIDER_IDS.NATIVE];
    },
    has: isValidVoiceProvider,
    ids: VALID_VOICE_PROVIDERS,
  });
}
