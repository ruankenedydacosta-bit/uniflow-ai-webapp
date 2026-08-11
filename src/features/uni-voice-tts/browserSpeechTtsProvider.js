import { VOICE_TTS_ERROR_CODES } from './voiceTtsStatus.js';

function browserSpeechError(code, message) {
  return Object.assign(new Error(message ?? code), {
    code,
    retryable: false,
    providerStatus: null,
  });
}

function resolvePortugueseVoice(voices) {
  const language = (voice) => String(voice?.lang ?? '').toLowerCase();
  const identity = (voice) => `${voice?.name ?? ''} ${voice?.voiceURI ?? ''}`.toLowerCase();
  return voices.find((voice) => language(voice) === 'pt-br' && identity(voice).includes('google'))
    ?? voices.find((voice) => language(voice) === 'pt-br')
    ?? voices.find((voice) => language(voice).startsWith('pt'))
    ?? null;
}

export function createBrowserSpeechTtsProvider({ runtime = globalThis, voiceLoadTimeoutMs = 500 } = {}) {
  const speechSynthesis = runtime?.speechSynthesis;
  const Utterance = runtime?.SpeechSynthesisUtterance;
  let activeUtterance = null;
  let activeSettle = null;

  function loadVoices() {
    const currentVoices = speechSynthesis?.getVoices?.() ?? [];
    if (currentVoices.length > 0 || !speechSynthesis) return Promise.resolve(currentVoices);

    return new Promise((resolve) => {
      let settled = false;
      let removeListener = () => {};
      const finish = () => {
        if (settled) return;
        settled = true;
        runtime.clearTimeout?.(timer);
        removeListener();
        resolve(speechSynthesis.getVoices?.() ?? []);
      };
      const handleVoicesChanged = () => finish();
      const timer = runtime.setTimeout?.(finish, voiceLoadTimeoutMs);

      if (speechSynthesis.addEventListener) {
        speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged, { once: true });
        removeListener = () => speechSynthesis.removeEventListener?.('voiceschanged', handleVoicesChanged);
      } else {
        const previousHandler = speechSynthesis.onvoiceschanged;
        const handleLegacyVoicesChanged = (event) => {
          previousHandler?.call(speechSynthesis, event);
          finish();
        };
        speechSynthesis.onvoiceschanged = handleLegacyVoicesChanged;
        removeListener = () => {
          if (speechSynthesis.onvoiceschanged === handleLegacyVoicesChanged) {
            speechSynthesis.onvoiceschanged = previousHandler ?? null;
          }
        };
      }
    });
  }

  function isSupported() {
    return Boolean(speechSynthesis?.speak && speechSynthesis?.cancel && Utterance);
  }

  async function healthCheck() {
    return isSupported()
      ? { available: true, reason: null }
      : { available: false, reason: 'BROWSER_SPEECH_UNAVAILABLE' };
  }

  async function preparePlayback() {
    return isSupported();
  }

  function clearActiveUtterance() {
    if (activeUtterance) {
      activeUtterance.onstart = null;
      activeUtterance.onend = null;
      activeUtterance.onerror = null;
    }
    activeUtterance = null;
  }

  function stop() {
    if (!activeUtterance && !activeSettle) return;
    const settle = activeSettle;
    activeSettle = null;
    clearActiveUtterance();
    speechSynthesis?.cancel?.();
    settle?.reject(browserSpeechError(VOICE_TTS_ERROR_CODES.CANCELLED, 'browser_speech_stopped'));
  }

  function play() {
    if (!activeUtterance || !speechSynthesis?.paused) return false;
    speechSynthesis.resume?.();
    return true;
  }

  function pause() {
    if (activeUtterance) speechSynthesis?.pause?.();
  }

  function resume() {
    if (activeUtterance) speechSynthesis?.resume?.();
  }

  async function speak(text, { onPlaying, onEnded, onError } = {}) {
    stop();
    if (!isSupported()) {
      throw browserSpeechError(
        VOICE_TTS_ERROR_CODES.BROWSER_FALLBACK_UNAVAILABLE,
        'browser_speech_unavailable',
      );
    }

    const voices = await loadVoices();
    const utterance = new Utterance(text);
    utterance.lang = 'pt-BR';
    utterance.volume = 1;
    const voice = resolvePortugueseVoice(voices);
    if (voice) utterance.voice = voice;
    activeUtterance = utterance;

    return new Promise((resolve, reject) => {
      activeSettle = { resolve, reject };
      utterance.onstart = () => onPlaying?.();
      utterance.onend = () => {
        activeSettle = null;
        clearActiveUtterance();
        onEnded?.();
        resolve({ providerName: 'browser_speech_tts' });
      };
      utterance.onerror = (event) => {
        activeSettle = null;
        clearActiveUtterance();
        const code = event?.error === 'not-allowed'
          ? VOICE_TTS_ERROR_CODES.AUTOPLAY_BLOCKED
          : VOICE_TTS_ERROR_CODES.BROWSER_FALLBACK_ERROR;
        const error = browserSpeechError(code, event?.error ?? 'browser_speech_failed');
        onError?.(error);
        reject(error);
      };

      try {
        speechSynthesis.speak(utterance);
      } catch (cause) {
        activeSettle = null;
        clearActiveUtterance();
        const error = browserSpeechError(
          VOICE_TTS_ERROR_CODES.BROWSER_FALLBACK_ERROR,
          cause?.message ?? 'browser_speech_failed',
        );
        onError?.(error);
        reject(error);
      }
    });
  }

  return {
    providerName: 'browser_speech_tts',
    isSupported,
    healthCheck,
    preparePlayback,
    speak,
    play,
    pause,
    resume,
    stop,
    cancel: stop,
  };
}
