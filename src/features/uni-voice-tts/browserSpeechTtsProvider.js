import { VOICE_TTS_ERROR_CODES } from './voiceTtsStatus.js';

function browserSpeechError(code, message, diagnostics = null) {
  return Object.assign(new Error(message ?? code), {
    code,
    retryable: false,
    providerStatus: null,
    nativeError: diagnostics?.nativeError ?? null,
    diagnostics,
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

  function getVoices() {
    return speechSynthesis?.getVoices?.() ?? [];
  }

  function buildDiagnostics({ voices = getVoices(), voice = null, nativeError = null } = {}) {
    return Object.freeze({
      supported: isSupported(),
      voicesCount: voices.length,
      selectedVoiceName: voice?.name ?? null,
      selectedVoiceLanguage: voice?.lang ?? 'pt-BR',
      selectedVoiceLocalService: typeof voice?.localService === 'boolean' ? voice.localService : null,
      speaking: Boolean(speechSynthesis?.speaking),
      pending: Boolean(speechSynthesis?.pending),
      paused: Boolean(speechSynthesis?.paused),
      nativeError,
    });
  }

  function loadVoices() {
    const currentVoices = getVoices();
    if (currentVoices.length > 0 || !speechSynthesis) return Promise.resolve(currentVoices);

    return new Promise((resolve) => {
      let settled = false;
      let removeListener = () => {};
      const finish = () => {
        if (settled) return;
        settled = true;
        runtime.clearTimeout?.(timer);
        removeListener();
        resolve(getVoices());
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

  function startSpeaking(text, voices, { onPlaying, onEnded, onError, onDiagnostic } = {}) {
    stop();
    if (!isSupported()) {
      throw browserSpeechError(
        VOICE_TTS_ERROR_CODES.BROWSER_FALLBACK_UNAVAILABLE,
        'browser_speech_unavailable',
        buildDiagnostics({ voices }),
      );
    }

    const utterance = new Utterance(text);
    utterance.lang = 'pt-BR';
    utterance.volume = 1;
    const voice = resolvePortugueseVoice(voices);
    if (voice) utterance.voice = voice;
    activeUtterance = utterance;
    onDiagnostic?.({ stage: 'before_speak', ...buildDiagnostics({ voices, voice }) });

    return new Promise((resolve, reject) => {
      activeSettle = { resolve, reject };
      utterance.onstart = () => {
        onDiagnostic?.({ stage: 'start', ...buildDiagnostics({ voices, voice }) });
        onPlaying?.();
      };
      utterance.onend = () => {
        onDiagnostic?.({ stage: 'end', ...buildDiagnostics({ voices, voice }) });
        activeSettle = null;
        clearActiveUtterance();
        onEnded?.();
        resolve({
          providerName: 'browser_speech_tts',
          voice: Object.freeze({
            name: voice?.name ?? null,
            lang: voice?.lang ?? 'pt-BR',
            localService: typeof voice?.localService === 'boolean' ? voice.localService : null,
          }),
        });
      };
      utterance.onerror = (event) => {
        activeSettle = null;
        clearActiveUtterance();
        const nativeError = String(event?.error ?? 'browser_speech_failed');
        const diagnostics = buildDiagnostics({ voices, voice, nativeError });
        onDiagnostic?.({ stage: 'error', ...diagnostics });
        const code = event?.error === 'not-allowed'
          ? VOICE_TTS_ERROR_CODES.AUTOPLAY_BLOCKED
          : VOICE_TTS_ERROR_CODES.BROWSER_FALLBACK_ERROR;
        const error = browserSpeechError(code, nativeError, diagnostics);
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
          buildDiagnostics({ voices, voice, nativeError: cause?.name ?? 'speak_threw' }),
        );
        onError?.(error);
        reject(error);
      }
    });
  }

  async function speak(text, callbacks = {}) {
    const voices = await loadVoices();
    return startSpeaking(text, voices, callbacks);
  }

  // Chrome mobile exige que speak() aconteca no mesmo stack do clique.
  // Neste caminho nao existe await antes de speechSynthesis.speak(). Se as
  // vozes ainda nao carregaram, lang=pt-BR deixa o sistema escolher a voz e
  // voiceschanged fica disponivel para as proximas falas.
  function speakFromUserGesture(text, callbacks = {}) {
    // Limpa qualquer fila nativa residual, inclusive uma fala criada por uma
    // instancia anterior do provider. O novo speak continua no mesmo stack.
    speechSynthesis?.cancel?.();
    return startSpeaking(text, getVoices(), callbacks);
  }

  return {
    providerName: 'browser_speech_tts',
    isSupported,
    healthCheck,
    preparePlayback,
    speak,
    speakFromUserGesture,
    play,
    pause,
    resume,
    stop,
    cancel: stop,
  };
}
