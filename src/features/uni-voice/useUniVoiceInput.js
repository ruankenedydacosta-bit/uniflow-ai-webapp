import { useCallback, useEffect, useReducer, useRef } from 'react';
import {
  createMediaRecorderAdapter,
  requestVoiceMicrophonePermission,
} from './mediaRecorderAdapter.js';
import { uniVoiceTranscriptionProvider } from './uniVoiceTranscriptionProvider.js';
import {
  initialVoiceCaptureState,
  isVoiceCaptureActive,
  voiceCaptureReducer,
  VOICE_CAPTURE_STATES,
} from './voiceCaptureReducer.js';
import { getVoiceInputMessage } from './voiceInputMessages.js';
import { normalizeTelemetryErrorCode, telemetry } from '../observability/index.js';
import { recordVoicePipelineDiagnostic } from './voicePipelineDiagnostics.js';
import { createSilenceMonitor, VOICE_ENDPOINT_EVENTS } from './voiceEndpointing.js';
import {
  createGa4VoiceEventLifecycle,
} from '../analytics/ga4ProductEvents.js';
import { GA4_VOICE_RESULTS } from '../analytics/ga4ProductContracts.js';

const CAPTURE_ERROR_STATES = Object.freeze({
  permission_denied: VOICE_CAPTURE_STATES.PERMISSION_DENIED,
  duration_limit: VOICE_CAPTURE_STATES.LIMIT_EXCEEDED,
  size_limit: VOICE_CAPTURE_STATES.LIMIT_EXCEEDED,
  empty_audio: VOICE_CAPTURE_STATES.NO_SPEECH,
});

export function useUniVoiceInput({
  onFinalTranscript,
  onBeforeStart,
  onCaptureStart,
  onCaptureEnd,
  onUnsupported,
  profileId = 'balanced',
  workspaceId,
  runtime,
  transcriptionProvider = uniVoiceTranscriptionProvider,
  // ENVIO-AUTO: envia sozinho quando a pessoa para de falar. O toque em
  // "Enviar" continua valendo para quem quiser encerrar antes.
  autoStopOnSilence = true,
} = {}) {
  const [state, dispatch] = useReducer(voiceCaptureReducer, initialVoiceCaptureState);
  const adapterRef = useRef(null);
  const sessionSequenceRef = useRef(0);
  const activeSessionIdRef = useRef(null);
  const requestIdRef = useRef(0);
  const transcriptionAbortRef = useRef(null);
  const captureEndNotifiedRef = useRef(true);
  const voiceAnalyticsRef = useRef(null);
  if (voiceAnalyticsRef.current == null) {
    voiceAnalyticsRef.current = createGa4VoiceEventLifecycle();
  }
  // BUG 3: referencia ao MESMO MediaStream do adapter (nunca um segundo
  // getUserMedia) -- exposta via getActiveStream() para quem quiser
  // visualizar a intensidade da voz (AnalyserNode), puramente informativo.
  const activeStreamRef = useRef(null);
  const silenceMonitorRef = useRef(null);
  const autoEndRef = useRef(null);
  const callbacksRef = useRef({
    onFinalTranscript,
    onBeforeStart,
    onCaptureStart,
    onCaptureEnd,
    onUnsupported,
  });

  useEffect(() => {
    callbacksRef.current = {
      onFinalTranscript,
      onBeforeStart,
      onCaptureStart,
      onCaptureEnd,
      onUnsupported,
    };
  }, [onBeforeStart, onCaptureEnd, onCaptureStart, onFinalTranscript, onUnsupported]);

  const releaseAdapter = useCallback((expectedSessionId = null) => {
    if (
      expectedSessionId !== null
      && activeSessionIdRef.current !== expectedSessionId
    ) return false;
    silenceMonitorRef.current?.dispose();
    silenceMonitorRef.current = null;
    adapterRef.current?.dispose();
    adapterRef.current = null;
    activeStreamRef.current = null;
    activeSessionIdRef.current = null;
    if (!captureEndNotifiedRef.current) {
      captureEndNotifiedRef.current = true;
      callbacksRef.current.onCaptureEnd?.();
    }
    return true;
  }, []);

  const transcribe = useCallback(async ({ audio, durationMs, sessionId }) => {
    if (activeSessionIdRef.current !== sessionId) return;
    const transcriptionStartedAt = Date.now();
    const requestId = ++requestIdRef.current;
    dispatch({ type: 'PROCESS' });
    releaseAdapter(sessionId);
    transcriptionAbortRef.current?.abort('superseded');
    const transcriptionController = new AbortController();
    transcriptionAbortRef.current = transcriptionController;

    recordVoicePipelineDiagnostic('STT_REQUEST_STARTED', {
      blobSizeBytes: audio?.size,
      mimeType: audio?.type,
      durationMs,
      sessionId,
    });

    let result;
    try {
      result = await transcriptionProvider.transcribe({
        audio,
        durationMs,
        workspaceId,
        sessionId,
        signal: transcriptionController.signal,
      });
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      recordVoicePipelineDiagnostic('STT_ERROR', { sessionId });
      const code = error?.code ?? 'transcription_failed';
      void telemetry.metric('voice.latency_ms', {
        value: Math.max(0, Date.now() - transcriptionStartedAt),
        unit: 'ms',
        source: 'transcription',
        status: 'error',
      }, { workspaceId, requestId: String(requestId) });
      void telemetry.error('voice.failure', {
        errorCode: normalizeTelemetryErrorCode(code, 'TRANSCRIPTION_FAILED'),
        stage: 'transcription',
        source: 'microphone',
        recoverable: true,
      }, { workspaceId, requestId: String(requestId) });
      dispatch({
        type: 'FAIL',
        status: VOICE_CAPTURE_STATES.ERROR,
        errorCode: code,
      });
      voiceAnalyticsRef.current.complete(sessionId, GA4_VOICE_RESULTS.ERROR);
      return;
    } finally {
      if (transcriptionAbortRef.current === transcriptionController) {
        transcriptionAbortRef.current = null;
      }
    }
    if (requestId !== requestIdRef.current) return;

    recordVoicePipelineDiagnostic('STT_RESPONSE_RECEIVED', {
      sessionId,
      transcriptEmpty: !result?.text,
    });
    void telemetry.metric('voice.latency_ms', {
      value: Math.max(0, Date.now() - transcriptionStartedAt),
      unit: 'ms',
      source: 'transcription',
      status: result?.text ? 'success' : 'error',
    }, { workspaceId, requestId: String(requestId) });

    if (result?.text) {
      recordVoicePipelineDiagnostic('TRANSCRIPT_NON_EMPTY', {
        transcriptLength: result.text.length,
        sessionId,
        transcriptEmpty: false,
      });
      dispatch({ type: 'COMPLETE' });
      voiceAnalyticsRef.current.complete(sessionId, GA4_VOICE_RESULTS.SUCCESS);
      const finalTranscriptHandler = callbacksRef.current.onFinalTranscript;
      finalTranscriptHandler?.(result.text);
      recordVoicePipelineDiagnostic('MESSAGE_SENT_TO_UNI', {
        messageDelivered: typeof finalTranscriptHandler === 'function',
        sessionId,
      });
      return;
    }

    recordVoicePipelineDiagnostic('EMPTY_TRANSCRIPT', { sessionId, transcriptEmpty: true });
    const code = result?.error?.code ?? 'transcription_failed';
    void telemetry.error('voice.failure', {
      errorCode: normalizeTelemetryErrorCode(code, 'TRANSCRIPTION_FAILED'),
      stage: 'transcription',
      source: 'microphone',
      recoverable: true,
    }, { workspaceId, requestId: String(requestId) });
    dispatch({
      type: 'FAIL',
      status: code === 'EMPTY_TRANSCRIPT'
        ? VOICE_CAPTURE_STATES.NO_SPEECH
        : VOICE_CAPTURE_STATES.ERROR,
      errorCode: code,
    });
    voiceAnalyticsRef.current.complete(sessionId, GA4_VOICE_RESULTS.ERROR);
  }, [releaseAdapter, transcriptionProvider, workspaceId]);

  const start = useCallback(async () => {
    if (adapterRef.current || isVoiceCaptureActive(state.status) || !workspaceId) return false;

    const browserRuntime = runtime ?? (typeof window !== 'undefined' ? window : undefined);
    const sessionId = ++sessionSequenceRef.current;
    activeSessionIdRef.current = sessionId;
    voiceAnalyticsRef.current.begin(sessionId);
    let adapter;
    const isCurrentSession = () => activeSessionIdRef.current === sessionId
      && adapterRef.current === adapter;
    adapter = createMediaRecorderAdapter({
      runtime: browserRuntime,
      sessionId,
      onStart: () => {
        if (!isCurrentSession()) return;
        dispatch({ type: 'START_LISTENING' });
        void telemetry.event('voice.lifecycle', {
          status: 'listening',
          stage: 'capture',
          source: 'microphone',
        }, { workspaceId });
        voiceAnalyticsRef.current.markStarted(sessionId);
        callbacksRef.current.onCaptureStart?.();
      },
      onStreamReady: (stream) => {
        if (!isCurrentSession()) return;
        activeStreamRef.current = stream;
        if (!autoStopOnSilence) return;
        silenceMonitorRef.current?.dispose();
        silenceMonitorRef.current = createSilenceMonitor({
          stream,
          runtime: browserRuntime,
          onEndOfSpeech: () => autoEndRef.current?.(sessionId, VOICE_ENDPOINT_EVENTS.END_OF_SPEECH),
          onNoSpeech: () => autoEndRef.current?.(sessionId, VOICE_ENDPOINT_EVENTS.NO_SPEECH),
        });
      },
      onAudio: (capture) => {
        if (!isCurrentSession()) return;
        void transcribe({ ...capture, sessionId });
      },
      onCancel: () => {
        if (!isCurrentSession()) return;
        dispatch({ type: 'CANCEL' });
        void telemetry.event('voice.lifecycle', {
          status: 'cancelled',
          stage: 'capture',
          source: 'microphone',
        }, { workspaceId });
        voiceAnalyticsRef.current.complete(sessionId, GA4_VOICE_RESULTS.CANCELLED);
      },
      onError: ({ code }) => {
        if (!isCurrentSession()) return;
        void telemetry.error('voice.failure', {
          errorCode: normalizeTelemetryErrorCode(code, 'CAPTURE_FAILED'),
          stage: 'capture',
          source: 'microphone',
          recoverable: true,
        }, { workspaceId });
        dispatch({
          type: 'FAIL',
          status: CAPTURE_ERROR_STATES[code] ?? VOICE_CAPTURE_STATES.ERROR,
          errorCode: code,
        });
        voiceAnalyticsRef.current.complete(sessionId, GA4_VOICE_RESULTS.ERROR);
        releaseAdapter(sessionId);
      },
    });

    if (!adapter.supported) {
      activeSessionIdRef.current = null;
      dispatch({
        type: 'FAIL',
        status: VOICE_CAPTURE_STATES.UNSUPPORTED,
        errorCode: 'unsupported',
      });
      callbacksRef.current.onUnsupported?.();
      return false;
    }

    callbacksRef.current.onBeforeStart?.();
    captureEndNotifiedRef.current = false;
    dispatch({ type: 'REQUEST_PERMISSION' });
    adapterRef.current = adapter;
    const started = await adapter.start();
    if (!started && adapterRef.current === adapter) releaseAdapter(sessionId);
    return started;
  }, [autoStopOnSilence, releaseAdapter, runtime, state.status, transcribe, workspaceId]);

  const prepareMicrophone = useCallback(() => {
    const browserRuntime = runtime ?? (typeof window !== 'undefined' ? window : undefined);
    return requestVoiceMicrophonePermission(browserRuntime);
  }, [runtime]);

  const cancel = useCallback(() => {
    requestIdRef.current += 1;
    transcriptionAbortRef.current?.abort('cancelled');
    transcriptionAbortRef.current = null;
    if (!adapterRef.current) {
      if (state.status === VOICE_CAPTURE_STATES.PROCESSING) {
        dispatch({ type: 'CANCEL' });
        voiceAnalyticsRef.current.completeCurrent(GA4_VOICE_RESULTS.CANCELLED);
        return true;
      }
      return false;
    }
    const sessionId = activeSessionIdRef.current;
    adapterRef.current.cancel();
    dispatch({ type: 'CANCEL' });
    voiceAnalyticsRef.current.complete(sessionId, GA4_VOICE_RESULTS.CANCELLED);
    releaseAdapter(sessionId);
    return true;
  }, [releaseAdapter, state.status]);

  // HOTFIX FINAL (deadlock "OUVINDO..." travado ao tocar para parar):
  // adapterRef.current.stop() (mediaRecorderAdapter.js) retorna false, em
  // silêncio, sempre que o MediaRecorder nativo não está exatamente em
  // "recording" (ex.: já tinha parado sozinho por algum evento nativo não
  // percebido, ou nunca chegou a iniciar de fato) -- sem nenhum dispatch,
  // sem nenhum erro. O status React ficava travado em LISTENING para
  // sempre: como toggle()/handleVoiceClick tratam um segundo toque em
  // LISTENING como "chamar stop() de novo", e stop() repetia a mesma
  // checagem sempre-falsa, o botão nunca mais saía desse estado. cancel()
  // é a única saída deste hook que SEMPRE limpa o estado (dispatch CANCEL +
  // releaseAdapter), então vira o fallback garantido quando o stop nativo
  // falha -- o usuário nunca fica preso em "Ouvindo..." sem nenhuma saída.
  const stop = useCallback(() => {
    if (!adapterRef.current) return false;
    const stopped = adapterRef.current.stop('released');
    if (!stopped) return cancel();
    return stopped;
  }, [cancel]);

  // ENVIO-AUTO: fim de fala detectado -> mesmo caminho do toque em "Enviar".
  // Nada dito em alguns segundos -> encerra sem enviar áudio para
  // transcrição (silêncio puro costuma virar texto inventado no STT).
  const handleAutoEnd = useCallback((sessionId, reason) => {
    if (activeSessionIdRef.current !== sessionId || !adapterRef.current) return;
    if (reason === VOICE_ENDPOINT_EVENTS.NO_SPEECH) {
      void telemetry.error('voice.failure', {
        errorCode: normalizeTelemetryErrorCode('no_speech', 'CAPTURE_FAILED'),
        stage: 'capture',
        source: 'microphone',
        recoverable: true,
      }, { workspaceId });
      dispatch({
        type: 'FAIL',
        status: VOICE_CAPTURE_STATES.NO_SPEECH,
        errorCode: 'no_speech',
      });
      voiceAnalyticsRef.current.complete(sessionId, GA4_VOICE_RESULTS.ERROR);
      releaseAdapter(sessionId);
      return;
    }
    const stopped = adapterRef.current.stop(VOICE_ENDPOINT_EVENTS.END_OF_SPEECH);
    if (!stopped) cancel();
  }, [cancel, releaseAdapter, workspaceId]);

  useEffect(() => {
    autoEndRef.current = handleAutoEnd;
  }, [handleAutoEnd]);

  const toggle = useCallback(() => {
    if (state.status === VOICE_CAPTURE_STATES.LISTENING) return stop();
    if (isVoiceCaptureActive(state.status)) return false;
    void start();
    return true;
  }, [start, state.status, stop]);

  const reset = useCallback(() => {
    cancel();
    dispatch({ type: 'RESET' });
  }, [cancel]);

  useEffect(() => {
    const browserRuntime = runtime ?? (typeof window !== 'undefined' ? window : undefined);
    const browserDocument = browserRuntime?.document;
    if (!browserRuntime?.addEventListener || !browserDocument?.addEventListener) return undefined;

    const cancelForLifecycle = () => {
      const hasCapture = Boolean(adapterRef.current);
      const hasPendingTranscription = state.status === VOICE_CAPTURE_STATES.PROCESSING;
      if (!hasCapture && !hasPendingTranscription) return;

      requestIdRef.current += 1;
      transcriptionAbortRef.current?.abort('lifecycle');
      transcriptionAbortRef.current = null;
      adapterRef.current?.cancel();
      dispatch({ type: 'CANCEL' });
      voiceAnalyticsRef.current.completeCurrent(GA4_VOICE_RESULTS.CANCELLED);
      releaseAdapter();
    };

    const handleVisibilityChange = () => {
      if (browserDocument.visibilityState === 'hidden') cancelForLifecycle();
    };

    browserRuntime.addEventListener('pagehide', cancelForLifecycle);
    browserDocument.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      browserRuntime.removeEventListener('pagehide', cancelForLifecycle);
      browserDocument.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [releaseAdapter, runtime, state.status]);

  useEffect(() => () => {
    requestIdRef.current += 1;
    transcriptionAbortRef.current?.abort('unmount');
    transcriptionAbortRef.current = null;
    voiceAnalyticsRef.current.completeCurrent(GA4_VOICE_RESULTS.CANCELLED);
    releaseAdapter();
  }, [releaseAdapter]);

  const getActiveStream = useCallback(() => activeStreamRef.current, []);
  const getRecorderState = useCallback(
    () => adapterRef.current?.getRecorderState?.() ?? 'inactive',
    [],
  );
  const getActiveSessionId = useCallback(() => activeSessionIdRef.current, []);

  return {
    ...state,
    isListening: state.status === VOICE_CAPTURE_STATES.LISTENING,
    isActive: isVoiceCaptureActive(state.status),
    message: getVoiceInputMessage({ ...state, profileId }),
    start,
    stop,
    cancel,
    toggle,
    reset,
    prepareMicrophone,
    getActiveStream,
    getRecorderState,
    getActiveSessionId,
  };
}
