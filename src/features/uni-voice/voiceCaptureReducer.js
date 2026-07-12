export const VOICE_CAPTURE_STATES = Object.freeze({
  IDLE: 'idle',
  REQUESTING_PERMISSION: 'requesting_permission',
  LISTENING: 'listening',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  PERMISSION_DENIED: 'permission_denied',
  UNSUPPORTED: 'unsupported',
  NO_SPEECH: 'no_speech',
  ERROR: 'error',
  CANCELED: 'canceled',
});

export const initialVoiceCaptureState = Object.freeze({
  status: VOICE_CAPTURE_STATES.IDLE,
  interimTranscript: '',
  errorCode: null,
});

export function voiceCaptureReducer(state, action) {
  switch (action.type) {
    case 'REQUEST_PERMISSION':
      return { ...initialVoiceCaptureState, status: VOICE_CAPTURE_STATES.REQUESTING_PERMISSION };
    case 'START_LISTENING':
      return { ...initialVoiceCaptureState, status: VOICE_CAPTURE_STATES.LISTENING };
    case 'UPDATE_INTERIM':
      return {
        ...state,
        status: VOICE_CAPTURE_STATES.LISTENING,
        interimTranscript: action.transcript ?? '',
      };
    case 'PROCESS':
      return { ...state, status: VOICE_CAPTURE_STATES.PROCESSING };
    case 'COMPLETE':
      return { ...initialVoiceCaptureState, status: VOICE_CAPTURE_STATES.COMPLETED };
    case 'FAIL':
      return {
        ...initialVoiceCaptureState,
        status: action.status ?? VOICE_CAPTURE_STATES.ERROR,
        errorCode: action.errorCode ?? 'unknown',
      };
    case 'CANCEL':
      return { ...initialVoiceCaptureState, status: VOICE_CAPTURE_STATES.CANCELED };
    case 'RESET':
      return initialVoiceCaptureState;
    default:
      return state;
  }
}

export function isVoiceCaptureActive(status) {
  return [
    VOICE_CAPTURE_STATES.REQUESTING_PERMISSION,
    VOICE_CAPTURE_STATES.LISTENING,
    VOICE_CAPTURE_STATES.PROCESSING,
  ].includes(status);
}
