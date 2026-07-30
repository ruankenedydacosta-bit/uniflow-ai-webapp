import { useCallback, useEffect, useReducer, useRef } from 'react';
import { createMediaRecorderAdapter } from './mediaRecorderAdapter.js';
import { uniVoiceTranscriptionProvider } from './uniVoiceTranscriptionProvider.js';
import {
  initialVoiceCaptureState,
  isVoiceCaptureActive,
  voiceCaptureReducer,
  VOICE_CAPTURE_STATES,
} from './voiceCaptureReducer.js';
import { getVoiceInputMessage } from './voiceInputMessages.js';

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
} = {}) {
  const [state, dispatch] = useReducer(voiceCaptureReducer, initialVoiceCaptureState);
  const adapterRef = useRef(null);
  const requestIdRef = useRef(0);
  // BUG 3: referencia ao MESMO MediaStream do adapter (nunca um segundo
  // getUserMedia) -- exposta via getActiveStream() para quem quiser
  // visualizar a intensidade da voz (AnalyserNode), puramente informativo.
  const activeStreamRef = useRef(null);
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

  const releaseAdapter = useCallback(() => {
    adapterRef.current?.dispose();
    adapterRef.current = null;
    activeStreamRef.current = null;
    callbacksRef.current.onCaptureEnd?.();
  }, []);

  const transcribe = useCallback(async ({ audio, durationMs }) => {
    const requestId = ++requestIdRef.current;
    dispatch({ type: 'PROCESS' });
    releaseAdapter();

    const result = await transcriptionProvider.transcribe({
      audio,
      durationMs,
      workspaceId,
    });
    if (requestId !== requestIdRef.current) return;

    if (result?.text) {
      dispatch({ type: 'COMPLETE' });
      callbacksRef.current.onFinalTranscript?.(result.text);
      return;
    }

    const code = result?.error?.code ?? 'transcription_failed';
    dispatch({
      type: 'FAIL',
      status: code === 'EMPTY_TRANSCRIPT'
        ? VOICE_CAPTURE_STATES.NO_SPEECH
        : VOICE_CAPTURE_STATES.ERROR,
      errorCode: code,
    });
  }, [releaseAdapter, transcriptionProvider, workspaceId]);

  const start = useCallback(async () => {
    if (adapterRef.current || isVoiceCaptureActive(state.status) || !workspaceId) return false;

    const browserRuntime = runtime ?? (typeof window !== 'undefined' ? window : undefined);
    const adapter = createMediaRecorderAdapter({
      runtime: browserRuntime,
      onStart: () => {
        dispatch({ type: 'START_LISTENING' });
        callbacksRef.current.onCaptureStart?.();
      },
      onStreamReady: (stream) => {
        activeStreamRef.current = stream;
      },
      onAudio: (capture) => {
        void transcribe(capture);
      },
      onCancel: () => {
        dispatch({ type: 'CANCEL' });
      },
      onError: ({ code }) => {
        dispatch({
          type: 'FAIL',
          status: CAPTURE_ERROR_STATES[code] ?? VOICE_CAPTURE_STATES.ERROR,
          errorCode: code,
        });
        releaseAdapter();
      },
    });

    if (!adapter.supported) {
      dispatch({
        type: 'FAIL',
        status: VOICE_CAPTURE_STATES.UNSUPPORTED,
        errorCode: 'unsupported',
      });
      callbacksRef.current.onUnsupported?.();
      return false;
    }

    callbacksRef.current.onBeforeStart?.();
    dispatch({ type: 'REQUEST_PERMISSION' });
    adapterRef.current = adapter;
    const started = await adapter.start();
    if (!started && adapterRef.current === adapter) releaseAdapter();
    return started;
  }, [releaseAdapter, runtime, state.status, transcribe, workspaceId]);

  const stop = useCallback(() => {
    if (!adapterRef.current || state.status !== VOICE_CAPTURE_STATES.LISTENING) return false;
    return adapterRef.current.stop();
  }, [state.status]);

  const cancel = useCallback(() => {
    requestIdRef.current += 1;
    if (!adapterRef.current) {
      if (state.status === VOICE_CAPTURE_STATES.PROCESSING) {
        dispatch({ type: 'CANCEL' });
        return true;
      }
      return false;
    }
    adapterRef.current.cancel();
    dispatch({ type: 'CANCEL' });
    releaseAdapter();
    return true;
  }, [releaseAdapter, state.status]);

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

  useEffect(() => () => {
    requestIdRef.current += 1;
    adapterRef.current?.dispose();
    adapterRef.current = null;
    callbacksRef.current.onCaptureEnd?.();
  }, []);

  const getActiveStream = useCallback(() => activeStreamRef.current, []);

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
    getActiveStream,
  };
}
