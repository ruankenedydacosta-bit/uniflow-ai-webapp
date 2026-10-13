export const SIMPLIFIED_UNI_STATES = Object.freeze({
  IDLE: 'idle',
  INTERPRETING: 'interpreting',
  WAITING_CONFIRMATION: 'waiting_confirmation',
  EXECUTING: 'executing',
  SPEAKING: 'speaking',
  ERROR: 'error',
});

// Estado da Uni no card da Home. `isSpeaking` reflete a voz do chat
// tocando, nunca o microfone: falar com a Uni é só pela conversa em tempo
// real, que tem o próprio estado (REALTIME_STATUS).
export function resolveSimplifiedUniState({
  isTyping,
  isExecuting,
  hasPendingConfirmation,
  hasError,
  isSpeaking,
} = {}) {
  if (hasError) return SIMPLIFIED_UNI_STATES.ERROR;
  if (isExecuting) return SIMPLIFIED_UNI_STATES.EXECUTING;
  if (hasPendingConfirmation) return SIMPLIFIED_UNI_STATES.WAITING_CONFIRMATION;
  if (isTyping) return SIMPLIFIED_UNI_STATES.INTERPRETING;
  if (isSpeaking) return SIMPLIFIED_UNI_STATES.SPEAKING;
  return SIMPLIFIED_UNI_STATES.IDLE;
}
