import { shouldUseBrowserFallback } from './voiceFallbackPolicy.js';

export function createFallbackVoiceTtsProvider({ primaryProvider, browserProvider, policy }) {
  let activeProvider = null;

  function isSupported() {
    if (policy.forceBrowserTts) return browserProvider.isSupported();
    return primaryProvider.isSupported()
      || (policy.browserFallbackAllowed && browserProvider.isSupported());
  }

  async function healthCheck() {
    const [primary, browser] = await Promise.all([
      primaryProvider.healthCheck(),
      browserProvider.healthCheck(),
    ]);
    return {
      available: policy.forceBrowserTts ? browser.available : primary.available || (policy.browserFallbackAllowed && browser.available),
      reason: null,
      primary,
      browser,
    };
  }

  function stop() {
    primaryProvider.stop();
    browserProvider.stop();
    activeProvider = null;
  }

  async function speak(text, callbacks) {
    stop();

    const notify = (event) => callbacks?.onProviderEvent?.(event);

    if (policy.forceBrowserTts) {
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
      if (!shouldUseBrowserFallback(error, policy) || !browserProvider.isSupported()) throw error;
      activeProvider = browserProvider;
      notify({ provider: 'browser', status: 'requested', fallbackUsed: true });
      try {
        const result = await browserProvider.speak(text, callbacks);
        notify({ provider: 'browser', status: 'success', fallbackUsed: true });
        return result;
      } catch (fallbackError) {
        notify({ provider: 'browser', status: 'error', fallbackUsed: true });
        throw fallbackError;
      }
    }
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
    isSupported,
    healthCheck,
    speak,
    play,
    pause,
    resume,
    stop,
    cancel,
  };
}
