export const SIMPLIFIED_UNI_STATES = Object.freeze({
  IDLE: 'idle',
  INTERPRETING: 'interpreting',
  WAITING_CONFIRMATION: 'waiting_confirmation',
  EXECUTING: 'executing',
  ERROR: 'error',
});

// Estado da Uni no card da Home. A voz é só a conversa em tempo real, que
// tem o próprio estado (REALTIME_STATUS).
export function resolveSimplifiedUniState({
  isTyping,
  isExecuting,
  hasPendingConfirmation,
  hasError,
} = {}) {
  if (hasError) return SIMPLIFIED_UNI_STATES.ERROR;
  if (isExecuting) return SIMPLIFIED_UNI_STATES.EXECUTING;
  if (hasPendingConfirmation) return SIMPLIFIED_UNI_STATES.WAITING_CONFIRMATION;
  if (isTyping) return SIMPLIFIED_UNI_STATES.INTERPRETING;
  return SIMPLIFIED_UNI_STATES.IDLE;
}
