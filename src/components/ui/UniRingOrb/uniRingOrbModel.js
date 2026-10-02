export const UNI_RING_ORB_STATES = Object.freeze({
  IDLE: 'idle',
  LISTENING: 'listening',
  THINKING: 'thinking',
  SPEAKING: 'speaking',
});

// Durações em segundos. Parada é lenta e apagada; pensando gira mais rápido
// e brilha mais; ouvindo e falando soltam ondas do anel.
const MOTION_BY_STATE = Object.freeze({
  [UNI_RING_ORB_STATES.IDLE]: Object.freeze({ ring: 9, mark: 9, glow: 0.48, ripple: 0 }),
  [UNI_RING_ORB_STATES.LISTENING]: Object.freeze({ ring: 4, mark: 6, glow: 0.8, ripple: 2.4 }),
  [UNI_RING_ORB_STATES.THINKING]: Object.freeze({ ring: 1.2, mark: 3.6, glow: 1, ripple: 0 }),
  [UNI_RING_ORB_STATES.SPEAKING]: Object.freeze({ ring: 5, mark: 5, glow: 0.8, ripple: 1.6 }),
});

// Abaixo deste tamanho o símbolo vira um borrão; fica só o anel.
export const UNI_RING_ORB_MIN_MARK_SIZE = 28;

// Ouvindo tem prioridade: a pessoa pode interromper a Uni enquanto ela fala.
export function resolveUniRingOrbState({
  isListening = false,
  isThinking = false,
  isSpeaking = false,
} = {}) {
  if (isListening) return UNI_RING_ORB_STATES.LISTENING;
  if (isThinking) return UNI_RING_ORB_STATES.THINKING;
  if (isSpeaking) return UNI_RING_ORB_STATES.SPEAKING;
  return UNI_RING_ORB_STATES.IDLE;
}

export function resolveUniRingOrbMotion(state) {
  return MOTION_BY_STATE[state] || MOTION_BY_STATE[UNI_RING_ORB_STATES.IDLE];
}

export function resolveUniRingThickness(size) {
  const safeSize = Number.isFinite(Number(size)) ? Number(size) : 0;
  return Math.max(1.5, safeSize / 70);
}
