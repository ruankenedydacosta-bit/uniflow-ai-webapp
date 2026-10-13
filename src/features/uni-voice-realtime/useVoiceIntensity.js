import { useCallback, useEffect, useRef, useState } from 'react';
import { recordVoicePipelineDiagnostic } from './voicePipelineDiagnostics.js';

// HOTFIX CRÍTICO 2: threshold mínimo de RMS para considerar que existe
// sinal de áudio real chegando ao AnalyserNode (silêncio puro fica bem
// próximo de 0) -- só usado para o diagnóstico ANALYSER_RECEIVING_SIGNAL
// (DEV only), nunca para decidir cancelar/continuar a captura.
const SIGNAL_DETECTION_RMS_THRESHOLD = 0.01;
const SILENT_TIMEOUT_MS = 2000;

// BUG 3: animação de escuta do botão da Uni -- calcula a intensidade REAL
// do microfone (RMS/energia) a partir do MESMO MediaStream já capturado
// pelo motor de voz existente (useUniVoiceInput -> getActiveStream()),
// sem pedir acesso ao microfone uma segunda vez. Só entra em ação enquanto
// `active` for true (tipicamente durante VOICE_CAPTURE_STATES.LISTENING);
// libera AudioContext/AnalyserNode/requestAnimationFrame sempre que
// `active` cai ou o componente desmonta -- nunca deixa o microfone
// "vazando" um analisador aberto.

const SMOOTHING_FACTOR = 0.35;
const LEVEL_GAIN = 4;

export function prefersReducedMotion(runtime) {
  return Boolean(runtime?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
}

/**
 * RMS (root mean square) de um buffer de amostras de domínio do tempo de
 * um AnalyserNode (Uint8Array, 0-255, silêncio = 128) -- energia real do
 * áudio, não só o pico. Pura, sem nenhuma dependência de DOM/React;
 * testável isoladamente.
 */
export function computeRmsFromTimeDomainData(buffer) {
  if (!buffer || !buffer.length) return 0;
  let sumSquares = 0;
  for (let i = 0; i < buffer.length; i += 1) {
    const centered = (buffer[i] - 128) / 128;
    sumSquares += centered * centered;
  }
  return Math.sqrt(sumSquares / buffer.length);
}

/**
 * Suavização exponencial de um valor bruto (RMS) para uma transição
 * contínua na UI, sem tremulação frame a frame -- nunca aplica o valor
 * bruto direto.
 */
export function smoothLevel(previousSmoothed, rawValue, factor = SMOOTHING_FACTOR) {
  return previousSmoothed + (rawValue - previousSmoothed) * factor;
}

/**
 * Converte um valor suavizado (tipicamente pequeno, RMS de voz normal
 * fica bem abaixo de 1) num nível visual 0-1, com ganho e teto.
 */
export function toVisualLevel(smoothedValue, gain = LEVEL_GAIN) {
  return Math.min(1, Math.max(0, smoothedValue * gain));
}

export function useVoiceIntensity({
  getStream,
  getSessionId,
  active,
  runtime,
  onLevel,
  publishState = true,
} = {}) {
  const browserRuntime = runtime ?? (typeof window !== 'undefined' ? window : undefined);
  const [level, setLevel] = useState(0);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const rafRef = useRef(null);
  const smoothedRef = useRef(0);

  const stopAnalysis = useCallback(() => {
    if (rafRef.current !== null) {
      (browserRuntime?.cancelAnimationFrame ?? clearTimeout)(rafRef.current);
      rafRef.current = null;
    }
    try {
      sourceRef.current?.disconnect();
    } catch {
      // já desconectado -- nunca impede a limpeza do restante.
    }
    sourceRef.current = null;
    analyserRef.current = null;
    const audioContext = audioContextRef.current;
    audioContextRef.current = null;
    if (audioContext && audioContext.state !== 'closed') {
      void audioContext.close().catch(() => {});
    }
    smoothedRef.current = 0;
    if (publishState) setLevel(0);
    onLevel?.(0);
  }, [browserRuntime, onLevel, publishState]);

  useEffect(() => {
    if (!active) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza o nível visual com o fim da captura (nunca um loop: só roda quando `active` muda para false)
      stopAnalysis();
      return undefined;
    }

    const stream = getStream?.();
    const sessionId = getSessionId?.() ?? null;
    const AudioContextClass = browserRuntime?.AudioContext ?? browserRuntime?.webkitAudioContext;
    if (!stream || !AudioContextClass) return undefined;
    // Respeita prefers-reduced-motion desligando a análise em si (não só o
    // CSS) -- o nível fica em 0 e o botão usa o estado visual mínimo.
    if (prefersReducedMotion(browserRuntime)) return undefined;

    let disposed = false;
    const audioContext = new AudioContextClass();
    recordVoicePipelineDiagnostic('AUDIO_CONTEXT_CREATED', { audioContextState: audioContext.state });
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.6;
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    recordVoicePipelineDiagnostic('ANALYSER_CONNECTED', { audioContextState: audioContext.state });

    audioContextRef.current = audioContext;
    analyserRef.current = analyser;
    sourceRef.current = source;

    const buffer = new Uint8Array(analyser.frequencyBinCount);
    const requestFrame = browserRuntime?.requestAnimationFrame ?? ((cb) => setTimeout(cb, 32));

    // HOTFIX CRÍTICO 2: diagnóstico PURAMENTE informativo (DEV only) de que
    // sinal real de áudio chegou ao AnalyserNode -- nunca decide
    // cancelar/continuar a captura (isso continua 100% governado pelo
    // pointer lifecycle em SimplifiedHomeView.jsx). Existe só para provar,
    // num teste físico, se a "onda parada" é o analyser nunca recebendo
    // sinal (bug real de captura) ou só um problema puramente visual.
    let signalDetected = false;
    let sampleCount = 0;
    let rmsTotal = 0;
    let peak = 0;
    const setTimeoutFn = browserRuntime?.setTimeout ?? setTimeout;
    const silentTimeout = setTimeoutFn(() => {
      if (!disposed && !signalDetected) {
        recordVoicePipelineDiagnostic('ANALYSER_SILENT_TIMEOUT', { sessionId });
      }
    }, SILENT_TIMEOUT_MS);

    const tick = () => {
      if (disposed) return;
      analyser.getByteTimeDomainData(buffer);
      const rms = computeRmsFromTimeDomainData(buffer);
      sampleCount += 1;
      rmsTotal += rms;
      peak = Math.max(peak, rms);
      if (!signalDetected && rms > SIGNAL_DETECTION_RMS_THRESHOLD) {
        signalDetected = true;
        recordVoicePipelineDiagnostic('ANALYSER_RECEIVING_SIGNAL', { sessionId, peak: rms });
      }
      smoothedRef.current = smoothLevel(smoothedRef.current, rms);
      const visualLevel = toVisualLevel(smoothedRef.current);
      if (publishState) setLevel(visualLevel);
      onLevel?.(visualLevel);
      rafRef.current = requestFrame(tick);
    };
    const startAnalysis = () => {
      if (disposed) return;
      recordVoicePipelineDiagnostic('AUDIO_CONTEXT_STATE', { audioContextState: audioContext.state });
      rafRef.current = requestFrame(tick);
    };
    const resumeResult = audioContext.state === 'suspended'
      ? audioContext.resume?.()
      : null;
    if (resumeResult?.then) {
      void resumeResult.catch(() => {}).finally(startAnalysis);
    } else {
      startAnalysis();
    }

    return () => {
      (browserRuntime?.clearTimeout ?? clearTimeout)(silentTimeout);
      disposed = true;
      recordVoicePipelineDiagnostic('ANALYSER_LEVEL_SUMMARY', {
        sessionId,
        rmsMean: sampleCount ? rmsTotal / sampleCount : 0,
        peak,
      });
      stopAnalysis();
    };
  }, [active, browserRuntime, getSessionId, getStream, onLevel, publishState, stopAnalysis]);

  useEffect(() => () => stopAnalysis(), [stopAnalysis]);

  return { level };
}
