import { shouldUseBrowserFallback } from './voiceFallbackPolicy.js';
import {
  VOICE_PROVIDER_IDS,
  createVoiceProviderRegistry,
  resolveVoiceProvider,
} from './voiceProviderRegistry.js';

export function createFallbackVoiceTtsProvider({
  primaryProvider,
  browserProvider,
  policy,
  selectedProvider = null,
}) {
  let activeProvider = null;
  const registry = createVoiceProviderRegistry({
    native: browserProvider,
    elevenlabs: primaryProvider,
  });
  const selectedProviderId = resolveVoiceProvider(
    selectedProvider,
    policy.forceBrowserTts ? VOICE_PROVIDER_IDS.NATIVE : VOICE_PROVIDER_IDS.ELEVENLABS,
  );
  const selectedVoiceProvider = registry.get(selectedProviderId);
  const fallbackProvider = selectedProviderId === VOICE_PROVIDER_IDS.ELEVENLABS
    ? registry.get(VOICE_PROVIDER_IDS.NATIVE)
    : null;

  function isSupported() {
    return selectedVoiceProvider.isSupported()
      || Boolean(policy.browserFallbackAllowed && fallbackProvider?.isSupported());
  }

  async function healthCheck() {
    const [primary, browser] = await Promise.all([
      primaryProvider.healthCheck(),
      browserProvider.healthCheck(),
    ]);
    return {
      available: selectedProviderId === VOICE_PROVIDER_IDS.NATIVE
        ? browser.available
        : primary.available || (policy.browserFallbackAllowed && browser.available),
      reason: null,
      selectedProvider: selectedProviderId,
      primary,
      browser,
    };
  }

  function stop() {
    primaryProvider.stop();
    browserProvider.stop();
    activeProvider = null;
  }

  async function preparePlayback() {
    return selectedVoiceProvider.preparePlayback?.() ?? selectedVoiceProvider.isSupported();
  }

  async function speak(text, callbacks) {
    stop();

    const notify = (event) => callbacks?.onProviderEvent?.(event);

    if (selectedProviderId === VOICE_PROVIDER_IDS.NATIVE) {
      activeProvider = browserProvider;
      notify({ provider: 'browser', status: 'requested', fallbackUsed: true });
      try {
        const result = await browserProvider.speak(text, callbacks);
        notify({ provider: 'browser', status: 'success', fallbackUsed: true });
        return result;
      } catch (error) {
        notify({ provider: 'browser', status: 'error', fallbackUsed: true });
        throw error;
      }
    }

    activeProvider = primaryProvider;
    notify({ provider: 'elevenlabs', status: 'requested', fallbackUsed: false });
    try {
      const result = await primaryProvider.speak(text, callbacks);
      notify({
        provider: result?.cacheHit ? 'cache' : 'elevenlabs',
        status: 'success',
        fallbackUsed: false,
      });
      return result;
    } catch (error) {
      notify({ provider: 'elevenlabs', status: 'error', fallbackUsed: false });
      if (!shouldUseBrowserFallback(error, policy) || !fallbackProvider?.isSupported()) throw error;
      activeProvider = fallbackProvider;
      notify({ provider: 'browser', status: 'requested', fallbackUsed: true });
      try {
        const result = await fallbackProvider.speak(text, callbacks);
        notify({ provider: 'browser', status: 'success', fallbackUsed: true });
        return result;
      } catch (fallbackError) {
        notify({ provider: 'browser', status: 'error', fallbackUsed: true });
        throw fallbackError;
      }
    }
  }

  function speakFromUserGesture(text, callbacks) {
    if (
      selectedProviderId !== VOICE_PROVIDER_IDS.NATIVE
      || typeof browserProvider.speakFromUserGesture !== 'function'
    ) {
      return null;
    }

    stop();
    activeProvider = browserProvider;
    callbacks?.onProviderEvent?.({ provider: 'browser', status: 'requested', fallbackUsed: true });
    const speaking = browserProvider.speakFromUserGesture(text, callbacks);
    return Promise.resolve(speaking).then(
      (result) => {
        callbacks?.onProviderEvent?.({ provider: 'browser', status: 'success', fallbackUsed: true });
        return result;
      },
      (error) => {
        callbacks?.onProviderEvent?.({
          provider: 'browser',
          status: 'error',
          fallbackUsed: true,
          errorCode: error?.code ?? null,
        });
        throw error;
      },
    );
  }

  function play() {
    return activeProvider?.play() ?? false;
  }

  function pause() {
    activeProvider?.pause();
  }

  function resume() {
    return activeProvider?.resume();
  }

  function cancel() {
    activeProvider?.cancel();
  }

  return {
    providerName: 'fallback_voice_tts',
    selectedProvider: selectedProviderId,
    isSupported,
    healthCheck,
    preparePlayback,
    speak,
    speakFromUserGesture,
    play,
    pause,
    resume,
    stop,
    cancel,
  };
}
