import { computeRmsFromTimeDomainData } from './useVoiceIntensity.js';

// ENVIO-AUTO: detecção do fim da fala no próprio navegador. A captura
// continua a mesma (MediaRecorder + uni-voice-transcribe); isto só decide
// QUANDO chamar o "enviar" que hoje depende de um segundo toque.
//
// silenceMs é longo de propósito: quem dita um gasto pensa enquanto fala
// ("gastei... quarenta e cinco... no mercado"), e um corte curto mandaria a
// frase pela metade.
export const VOICE_ENDPOINT_DEFAULTS = Object.freeze({
  minSpeechRms: 0.02,
  noiseFloorMultiplier: 2.5,
  calibrationMs: 300,
  minSpeechMs: 250,
  silenceMs: 1300,
  noSpeechTimeoutMs: 7000,
});

export const VOICE_ENDPOINT_EVENTS = Object.freeze({
  END_OF_SPEECH: 'end_of_speech',
  NO_SPEECH: 'no_speech',
});

// Hysteresis: depois que a fala começou, um volume um pouco abaixo do limiar
// ainda conta como fala -- evita encerrar no fim de uma palavra mais baixa.
const SPEECH_HOLD_RATIO = 0.7;

/**
 * Máquina de estados pura: recebe o volume (RMS 0-1) de cada amostra com o
 * instante em ms e devolve um evento quando a fala termina ou quando nada foi
 * dito. Sem DOM, sem relógio próprio -- testável com tempo controlado.
 */
export function createVoiceEndpointer(options = {}) {
  const config = { ...VOICE_ENDPOINT_DEFAULTS, ...options };
  let startedAt = null;
  let lastSampleAt = null;
  let calibrationFloor = Infinity;
  let threshold = config.minSpeechRms;
  let voicedRunMs = 0;
  let hasSpeech = false;
  let lastVoiceAt = null;
  let finished = false;

  function push(rms, nowMs) {
    if (finished || !Number.isFinite(rms) || !Number.isFinite(nowMs)) return null;
    if (startedAt === null) startedAt = nowMs;
    const elapsedMs = nowMs - startedAt;
    const deltaMs = lastSampleAt === null ? 0 : Math.max(0, nowMs - lastSampleAt);
    lastSampleAt = nowMs;

    // O piso de ruído usa o MENOR volume da calibração: se a pessoa já
    // começar a falar nesse intervalo, o limiar não sobe junto.
    if (elapsedMs < config.calibrationMs) {
      calibrationFloor = Math.min(calibrationFloor, rms);
      threshold = Math.max(config.minSpeechRms, calibrationFloor * config.noiseFloorMultiplier);
      return null;
    }

    const isVoice = rms >= (hasSpeech ? threshold * SPEECH_HOLD_RATIO : threshold);
    if (isVoice) {
      voicedRunMs += deltaMs;
      lastVoiceAt = nowMs;
      if (!hasSpeech && voicedRunMs >= config.minSpeechMs) hasSpeech = true;
    } else if (!hasSpeech) {
      // Antes de a fala ser confirmada, só um trecho CONTÍNUO conta: estalos
      // e batidas no microfone não abrem a fala.
      voicedRunMs = 0;
    }

    if (hasSpeech && !isVoice && nowMs - lastVoiceAt >= config.silenceMs) {
      finished = true;
      return VOICE_ENDPOINT_EVENTS.END_OF_SPEECH;
    }
    if (!hasSpeech && elapsedMs >= config.noSpeechTimeoutMs) {
      finished = true;
      return VOICE_ENDPOINT_EVENTS.NO_SPEECH;
    }
    return null;
  }

  return {
    push,
    hasSpeech: () => hasSpeech,
  };
}

const MONITOR_INTERVAL_MS = 50;

/**
 * Liga o endpointer ao MESMO MediaStream da captura (nunca um segundo
 * getUserMedia). Sem AudioContext ou sem timer, devolve um monitor inerte: o
 * botão "Enviar" continua funcionando como antes.
 */
export function createSilenceMonitor({
  stream,
  runtime,
  onEndOfSpeech,
  onNoSpeech,
  endpointerOptions,
  intervalMs = MONITOR_INTERVAL_MS,
} = {}) {
  const inert = Object.freeze({ supported: false, dispose() {} });
  const AudioContextClass = runtime?.AudioContext ?? runtime?.webkitAudioContext;
  if (!stream || !AudioContextClass || typeof runtime?.setInterval !== 'function') return inert;

  let audioContext;
  let source;
  let analyser;
  try {
    audioContext = new AudioContextClass();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
  } catch {
    try {
      void audioContext?.close?.();
    } catch {
      // nada a liberar
    }
    return inert;
  }

  const buffer = new Uint8Array(analyser.fftSize);
  const endpointer = createVoiceEndpointer(endpointerOptions);
  const now = () => runtime.performance?.now?.() ?? Date.now();
  let disposed = false;
  let timer = null;

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (timer !== null) runtime.clearInterval?.(timer);
    timer = null;
    try {
      source.disconnect();
    } catch {
      // já desconectado
    }
    if (audioContext.state !== 'closed') void audioContext.close().catch(() => {});
  }

  timer = runtime.setInterval(() => {
    if (disposed) return;
    // iOS pode criar o AudioContext suspenso fora do gesto do usuário: aí o
    // analisador só lê silêncio. Nesse caso o monitor não decide nada (nem
    // "não ouvi"), e o envio volta a depender do toque.
    if (audioContext.state !== 'running') {
      if (audioContext.state === 'suspended') void audioContext.resume?.().catch(() => {});
      return;
    }
    analyser.getByteTimeDomainData(buffer);
    const event = endpointer.push(computeRmsFromTimeDomainData(buffer), now());
    if (event === VOICE_ENDPOINT_EVENTS.END_OF_SPEECH) {
      dispose();
      onEndOfSpeech?.();
    } else if (event === VOICE_ENDPOINT_EVENTS.NO_SPEECH) {
      dispose();
      onNoSpeech?.();
    }
  }, intervalMs);

  return { supported: true, dispose };
}
