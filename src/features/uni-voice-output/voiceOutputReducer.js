export const VOICE_OUTPUT_STATES = Object.freeze({
  IDLE: 'idle',
  PREPARING: 'preparing',
  GENERATING: 'generating',
  PLAYING: 'playing',
  STOPPED: 'stopped',
  QUOTA_REACHED: 'quota_reached',
  UNAUTHORIZED: 'unauthorized',
  UNSUPPORTED: 'unsupported',
  PROVIDER_ERROR: 'provider_error',
  FALLBACK_ACTIVE: 'fallback_active',
});

export const INITIAL_VOICE_OUTPUT_STATE = Object.freeze({
  status: VOICE_OUTPUT_STATES.IDLE,
  providerName: null,
  error: null,
  sessionGenerations: 0,
});

export function voiceOutputReducer(state, action) {
  switch (action.type) {
    case 'PREPARE':
      return { ...state, status: VOICE_OUTPUT_STATES.PREPARING, providerName: action.providerName, error: null };
    case 'GENERATE':
      return {
        ...state,
        status: VOICE_OUTPUT_STATES.GENERATING,
        providerName: action.providerName,
        sessionGenerations: action.sessionGenerations ?? state.sessionGenerations,
        error: null,
      };
    case 'PLAY':
      return { ...state, status: VOICE_OUTPUT_STATES.PLAYING, providerName: action.providerName, error: null };
    case 'STOP':
      return { ...state, status: VOICE_OUTPUT_STATES.STOPPED, error: null };
    case 'FAIL':
      return { ...state, status: action.status, error: action.error ?? null };
    case 'RESET':
      return { ...INITIAL_VOICE_OUTPUT_STATE, sessionGenerations: state.sessionGenerations };
    default:
      return state;
  }
}
