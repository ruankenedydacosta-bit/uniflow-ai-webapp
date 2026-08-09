const ERROR_STATUS = Object.freeze({
  'not-allowed': 'permission_denied',
  'service-not-allowed': 'permission_denied',
  'no-speech': 'no_speech',
  aborted: 'canceled',
});

export function getSpeechRecognitionConstructor(runtime = globalThis) {
  return runtime?.SpeechRecognition ?? runtime?.webkitSpeechRecognition ?? null;
}

export function sanitizeVoiceTranscript(value, maxLength = 600) {
  const text = typeof value === 'string' ? value : '';
  const printableText = Array.from(text)
    .map((character) => {
      const code = character.charCodeAt(0);
      if ([9, 10, 13].includes(code)) return ' ';
      return code >= 32 && code !== 127 ? character : '';
    })
    .join('');

  return printableText.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export function mapSpeechRecognitionError(errorCode) {
  return ERROR_STATUS[errorCode] ?? 'error';
}

export function createSpeechRecognitionAdapter({
  runtime = globalThis,
  onStart,
  onInterim,
  onProcessing,
  onFinal,
  onError,
} = {}) {
  const SpeechRecognition = getSpeechRecognitionConstructor(runtime);

  if (!SpeechRecognition) {
    return {
      supported: false,
      start: () => false,
      stop: () => false,
      cancel: () => false,
      dispose: () => {},
    };
  }

  const recognition = new SpeechRecognition();
  const finalResults = new Map();
  let active = false;
  let stopping = false;
  let canceled = false;
  let terminalError = null;
  let finalWasSent = false;
  let ended = true;

  recognition.lang = 'pt-BR';
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;

  function getFinalTranscript() {
    return sanitizeVoiceTranscript(
      [...finalResults.entries()]
        .sort(([left], [right]) => left - right)
        .map(([, transcript]) => transcript)
        .join(' '),
    );
  }

  recognition.onstart = () => {
    active = true;
    ended = false;
    onStart?.();
  };

  recognition.onresult = (event) => {
    const interimResults = [];

    for (let index = 0; index < (event?.results?.length ?? 0); index += 1) {
      const result = event.results[index];
      const transcript = sanitizeVoiceTranscript(result?.[0]?.transcript);

      if (!transcript) continue;
      if (result.isFinal) finalResults.set(index, transcript);
      else interimResults.push(transcript);
    }

    onInterim?.(sanitizeVoiceTranscript(interimResults.join(' ')));
  };

  recognition.onerror = (event) => {
    terminalError = mapSpeechRecognitionError(event?.error);
    onError?.({ status: terminalError, code: event?.error ?? 'unknown' });
  };

  recognition.onend = () => {
    if (ended) return;
    ended = true;
    active = false;
    stopping = false;

    if (canceled || terminalError || finalWasSent) return;
    onProcessing?.();

    const transcript = getFinalTranscript();
    if (!transcript) {
      onError?.({ status: 'no_speech', code: 'empty-final-transcript' });
      return;
    }

    finalWasSent = true;
    onFinal?.(transcript);
    finalResults.clear();
  };

  return {
    supported: true,
    start() {
      if (active) return false;
      canceled = false;
      terminalError = null;
      finalWasSent = false;
      stopping = false;
      ended = false;
      finalResults.clear();
      active = true;

      try {
        recognition.start();
        return true;
      } catch (error) {
        active = false;
        throw error;
      }
    },
    stop() {
      if (!active || stopping) return false;
      stopping = true;
      recognition.stop();
      return true;
    },
    cancel() {
      if (!active) return false;
      canceled = true;
      recognition.abort();
      return true;
    },
    dispose() {
      canceled = true;
      ended = true;
      recognition.onstart = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      if (active) recognition.abort();
      active = false;
      stopping = false;
      finalResults.clear();
    },
  };
}
