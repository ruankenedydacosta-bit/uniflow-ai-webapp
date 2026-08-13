export const RADIAL_VOICE_BAR_COUNT = 64;

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
  { attack = 0.62, release = 0.18 } = {},
) {
  const from = clampLevel(previous);
  const to = clampLevel(target);
  const factor = to > from ? attack : release;
  return from + (to - from) * factor;
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
    return Object.freeze({
      index,
      angle: (360 / safeCount) * index,
      factor: 0.58 + (primary * 0.27) + (secondary * 0.15),
      tone: index % 3,
      duration: 1.05 + ((index % 7) * 0.11),
      delay: -((index % 11) * 0.09),
    });
  }));
}

export function getRadialVoiceAmplitude(level, factor = 1) {
  return 3 + (clampLevel(factor) * 2) + (clampLevel(level) * clampLevel(factor) * 30);
}
