export const RADIAL_VOICE_BAR_COUNT = 108;
export const RADIAL_VOICE_ATTACK_MS = 80;
export const RADIAL_VOICE_RELEASE_MS = 240;
export const RADIAL_VOICE_EXIT_MS = 220;

function clampLevel(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

/**
 * Suavização estritamente visual: ataque rápido e queda mais lenta.
 * Não participa de captura, VAD, MediaRecorder ou transcrição.
 */
export function smoothRadialVoiceLevel(
  previous,
  target,
  deltaMs = 1000 / 60,
  { attackMs = RADIAL_VOICE_ATTACK_MS, releaseMs = RADIAL_VOICE_RELEASE_MS } = {},
) {
  const from = clampLevel(previous);
  const to = clampLevel(target);
  const timeConstant = to > from ? attackMs : releaseMs;
  const safeDelta = Math.min(50, Math.max(0, Number(deltaMs) || 0));
  const factor = 1 - Math.exp(-safeDelta / Math.max(1, timeConstant));
  return from + (to - from) * factor;
}

export function normalizeRadialVoiceLevel(value) {
  return Math.pow(clampLevel(value), 0.9);
}

/**
 * Descritores imutáveis e determinísticos. As duas ondas senoidais criam
 * diferenças orgânicas entre vizinhos sem aleatoriedade ou flicker.
 */
export function buildRadialVoiceBars(count = RADIAL_VOICE_BAR_COUNT) {
  const safeCount = Math.max(8, Math.floor(count));
  return Object.freeze(Array.from({ length: safeCount }, (_, index) => {
    const primary = (Math.sin(index * 1.73) + 1) / 2;
    const secondary = (Math.sin(index * 0.47 + 1.2) + 1) / 2;
    const colorPosition = (index / safeCount) * 3;
    return Object.freeze({
      index,
      angle: (360 / safeCount) * index,
      factor: 0.72 + (primary * 0.18) + (secondary * 0.1),
      tone: Math.min(2, Math.floor(colorPosition)),
      toneMix: colorPosition % 1,
      delay: -(index / safeCount) * 2.4,
      duration: 1.45 + (secondary * 0.65),
      height: 23 + (primary * 5) + (secondary * 3),
      opacity: 0.48 + (primary * 0.16),
    });
  }));
}

export function getRadialVoiceAmplitude(level, factor = 1) {
  return 4 + (normalizeRadialVoiceLevel(level) * clampLevel(factor) * 28);
}
