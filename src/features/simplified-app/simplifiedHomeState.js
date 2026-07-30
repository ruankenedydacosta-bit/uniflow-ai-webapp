import { VOICE_CAPTURE_STATES } from '../uni-voice/voiceCaptureReducer.js';

const VOICE_ERROR_STATES = new Set([
  VOICE_CAPTURE_STATES.PERMISSION_DENIED,
  VOICE_CAPTURE_STATES.UNSUPPORTED,
  VOICE_CAPTURE_STATES.NO_SPEECH,
  VOICE_CAPTURE_STATES.LIMIT_EXCEEDED,
  VOICE_CAPTURE_STATES.ERROR,
]);

export const SIMPLIFIED_UNI_STATES = Object.freeze({
  IDLE: 'idle',
  LISTENING: 'listening',
  TRANSCRIBING: 'transcribing',
  INTERPRETING: 'interpreting',
  WAITING_CONFIRMATION: 'waiting_confirmation',
  EXECUTING: 'executing',
  SPEAKING: 'speaking',
  SUCCESS: 'success',
  ERROR: 'error',
});

export function isVoiceErrorState(status) {
  return VOICE_ERROR_STATES.has(status);
}

// BLOCO UNI 2: `isSpeaking` reflete a saída de voz (TTS tocando/gerando),
// nunca a captura -- as duas nunca ficam ativas ao mesmo tempo na prática
// (a Home recusa iniciar uma gravação nova enquanto a Uni está falando),
// mas a prioridade abaixo garante que um estado mais acionável (erro,
// executando, confirmação pendente, digitando) sempre vence "falando",
// que é só informativo.
export function resolveSimplifiedUniState({
  voiceStatus,
  isTyping,
  isExecuting,
  hasPendingConfirmation,
  hasError,
  isSpeaking,
} = {}) {
  if (hasError || isVoiceErrorState(voiceStatus)) return SIMPLIFIED_UNI_STATES.ERROR;
  if (isExecuting) return SIMPLIFIED_UNI_STATES.EXECUTING;
  if (hasPendingConfirmation) return SIMPLIFIED_UNI_STATES.WAITING_CONFIRMATION;
  if (isTyping) return SIMPLIFIED_UNI_STATES.INTERPRETING;
  if (isSpeaking) return SIMPLIFIED_UNI_STATES.SPEAKING;
  if (voiceStatus === VOICE_CAPTURE_STATES.PROCESSING) {
    return SIMPLIFIED_UNI_STATES.TRANSCRIBING;
  }
  if (
    voiceStatus === VOICE_CAPTURE_STATES.LISTENING
    || voiceStatus === VOICE_CAPTURE_STATES.REQUESTING_PERMISSION
  ) {
    return SIMPLIFIED_UNI_STATES.LISTENING;
  }
  if (voiceStatus === VOICE_CAPTURE_STATES.COMPLETED) return SIMPLIFIED_UNI_STATES.SUCCESS;
  return SIMPLIFIED_UNI_STATES.IDLE;
}
