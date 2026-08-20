export const UNI_NEURAL_ORB_STATES = Object.freeze({
  IDLE: 'idle',
  LISTENING: 'listening',
  SPEAKING: 'speaking',
});

export function clampUniNeuralVoiceLevel(level, sensitivity = 1) {
  const safeLevel = Number.isFinite(Number(level)) ? Number(level) : 0;
  const safeSensitivity = Number.isFinite(Number(sensitivity))
    ? Math.max(0, Number(sensitivity))
    : 1;
  return Math.min(1, Math.max(0, safeLevel * safeSensitivity));
}

export function resolveUniNeuralOrbState({ isListening = false, isSpeaking = false } = {}) {
  if (isListening) return UNI_NEURAL_ORB_STATES.LISTENING;
  if (isSpeaking) return UNI_NEURAL_ORB_STATES.SPEAKING;
  return UNI_NEURAL_ORB_STATES.IDLE;
}

export function smoothUniNeuralValue(current, target, deltaMs, responseMs = 180) {
  const safeCurrent = Number.isFinite(Number(current)) ? Number(current) : 0;
  const safeTarget = Number.isFinite(Number(target)) ? Number(target) : 0;
  const safeDelta = Math.max(0, Number(deltaMs) || 0);
  const safeResponse = Math.max(1, Number(responseMs) || 1);
  const progress = 1 - Math.exp(-safeDelta / safeResponse);
  return safeCurrent + (safeTarget - safeCurrent) * progress;
}
