import { useCallback, useEffect, useReducer, useRef } from 'react';
import { createSpeechRecognitionAdapter } from './speechRecognitionAdapter.js';
import {
  initialVoiceCaptureState,
  isVoiceCaptureActive,
  voiceCaptureReducer,
  VOICE_CAPTURE_STATES,
} from './voiceCaptureReducer.js';
import { getVoiceInputMessage } from './voiceInputMessages.js';

export function useUniVoiceInput({
  onFinalTranscript,
  onBeforeStart,
  onCaptureStart,
  onCaptureEnd,
  onUnsupported,
  profileId = 'balanced',
  runtime,
} = {}) {
  const [state, dispatch] = useReducer(voiceCaptureReducer, initialVoiceCaptureState);
  const adapterRef = useRef(null);
  const callbacksRef = useRef({ onFinalTranscript, onBeforeStart, onCaptureStart, onCaptureEnd, onUnsupported });

  useEffect(() => {
    callbacksRef.current = { onFinalTranscript, onBeforeStart, onCaptureStart, onCaptureEnd, onUnsupported };
  }, [onBeforeStart, onCaptureEnd, onCaptureStart, onFinalTranscript, onUnsupported]);

  const releaseAdapter = useCallback(() => {
    adapterRef.current?.dispose();
    adapterRef.current = null;
    callbacksRef.current.onCaptureEnd?.();
  }, []);

  const start = useCallback(() => {
    if (adapterRef.current || isVoiceCaptureActive(state.status)) return false;

    const browserRuntime = runtime ?? (typeof window !== 'undefined' ? window : undefined);
    const adapter = createSpeechRecognitionAdapter({
      runtime: browserRuntime,
      onStart: () => {
        dispatch({ type: 'START_LISTENING' });
        callbacksRef.current.onCaptureStart?.();
      },
      onInterim: (transcript) => dispatch({ type: 'UPDATE_INTERIM', transcript }),
      onProcessing: () => dispatch({ type: 'PROCESS' }),
      onFinal: (transcript) => {
        dispatch({ type: 'COMPLETE' });
        releaseAdapter();
        callbacksRef.current.onFinalTranscript?.(transcript);
      },
      onError: ({ status, code }) => {
        dispatch({ type: 'FAIL', status, errorCode: code });
        releaseAdapter();
      },
    });

    if (!adapter.supported) {
      dispatch({ type: 'FAIL', status: VOICE_CAPTURE_STATES.UNSUPPORTED, errorCode: 'unsupported' });
      callbacksRef.current.onUnsupported?.();
      return false;
    }

    callbacksRef.current.onBeforeStart?.();
    dispatch({ type: 'REQUEST_PERMISSION' });
    adapterRef.current = adapter;

    try {
      return adapter.start();
    } catch {
      dispatch({ type: 'FAIL', status: VOICE_CAPTURE_STATES.ERROR, errorCode: 'start-failed' });
      releaseAdapter();
      return false;
    }
  }, [releaseAdapter, runtime, state.status]);

  const stop = useCallback(() => {
    if (!adapterRef.current) return false;
    dispatch({ type: 'PROCESS' });
    return adapterRef.current.stop();
  }, []);

  const cancel = useCallback(() => {
    if (!adapterRef.current) return false;
    adapterRef.current.cancel();
    dispatch({ type: 'CANCEL' });
    releaseAdapter();
    return true;
  }, [releaseAdapter]);

  const toggle = useCallback(() => {
    if (adapterRef.current) return stop();
    return start();
  }, [start, stop]);

  const reset = useCallback(() => {
    if (adapterRef.current) cancel();
    dispatch({ type: 'RESET' });
  }, [cancel]);

  useEffect(() => () => {
    adapterRef.current?.cancel();
    adapterRef.current?.dispose();
    adapterRef.current = null;
    callbacksRef.current.onCaptureEnd?.();
  }, []);

  return {
    ...state,
    isListening: isVoiceCaptureActive(state.status),
    message: getVoiceInputMessage({ ...state, profileId }),
    start,
    stop,
    cancel,
    toggle,
    reset,
  };
}
