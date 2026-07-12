function selectPortugueseVoice(voices = []) {
  const portuguese = voices.filter((voice) => /^pt(?:-|_)/i.test(voice.lang));
  const feminineName = /(luciana|francisca|fernanda|mariana|victoria|female|mulher)/i;
  return portuguese.find((voice) => /^pt-BR$/i.test(voice.lang) && feminineName.test(voice.name))
    ?? portuguese.find((voice) => /^pt-BR$/i.test(voice.lang))
    ?? portuguese.find((voice) => feminineName.test(voice.name))
    ?? portuguese[0]
    ?? null;
}

export function createBrowserVoiceProvider(runtime = globalThis) {
  let activeUtterance = null;
  let cancelActive = null;

  function isSupported() {
    return Boolean(runtime?.speechSynthesis && runtime?.SpeechSynthesisUtterance);
  }

  function stop() {
    runtime?.speechSynthesis?.cancel?.();
    activeUtterance = null;
    cancelActive?.();
    cancelActive = null;
  }

  async function speak(text, options = {}) {
    if (!isSupported()) {
      throw Object.assign(new Error('browser_voice_unsupported'), { code: 'UNSUPPORTED' });
    }

    stop();
    const synthesis = runtime.speechSynthesis;
    const utterance = new runtime.SpeechSynthesisUtterance(text);
    activeUtterance = utterance;
    utterance.lang = 'pt-BR';
    utterance.rate = options.preset?.speed ?? 1;

    return new Promise((resolve, reject) => {
      let started = false;
      const applyVoice = () => {
        const voice = selectPortugueseVoice(synthesis.getVoices?.() ?? []);
        if (voice) utterance.voice = voice;
      };
      const start = () => {
        if (started || activeUtterance !== utterance) return;
        started = true;
        applyVoice();
        synthesis.speak(utterance);
      };

      utterance.onstart = () => options.onPlaying?.();
      utterance.onend = () => {
        if (activeUtterance === utterance) activeUtterance = null;
        cancelActive = null;
        resolve({ providerName: 'browser' });
      };
      utterance.onerror = (event) => {
        if (activeUtterance === utterance) activeUtterance = null;
        cancelActive = null;
        reject(Object.assign(new Error('browser_voice_failed'), { code: event?.error ?? 'PROVIDER_ERROR' }));
      };
      cancelActive = () => reject(Object.assign(new Error('browser_voice_stopped'), { code: 'CANCELED' }));

      applyVoice();
      if ((synthesis.getVoices?.() ?? []).length) start();
      else {
        synthesis.addEventListener?.('voiceschanged', start, { once: true });
        runtime.setTimeout?.(start, 250);
      }
    });
  }

  return { providerName: 'browser', isSupported, speak, stop };
}

export { selectPortugueseVoice };
