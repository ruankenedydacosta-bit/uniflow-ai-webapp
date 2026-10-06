export const VOICE_OUTPUT_MODES = Object.freeze({
  OFF: 'off',
  PREMIUM: 'elevenlabs_demo',
});

export const PREMIUM_TEXT_LIMIT = 320;
export const PREMIUM_SESSION_LIMIT = 10;

const VALID_MODES = new Set(Object.values(VOICE_OUTPUT_MODES));
const SENSITIVE_PATTERNS = [
  /\b\d{3}\.\d{3}\.\d{3}-?\d{2}\b/,
  /\b(?:\d[ -]*?){13,19}\b/,
  /\b(?:senha|password|token|api[_ -]?key|chave privada|secret)\b/i,
  /\b(?:ag[eê]ncia|conta)\s*[:#-]?\s*\d{4,}\b/i,
];

export const VOICE_PERSONALITY_PRESETS = Object.freeze({
  balanced: Object.freeze({ stability: 0.58, similarity: 0.76, style: 0.24, speed: 1 }),
  direct: Object.freeze({ stability: 0.66, similarity: 0.78, style: 0.16, speed: 1.06 }),
  warm: Object.freeze({ stability: 0.52, similarity: 0.74, style: 0.34, speed: 0.96 }),
  strategic: Object.freeze({ stability: 0.64, similarity: 0.8, style: 0.2, speed: 0.98 }),
});

export function resolveVoiceOutputMode(mode) {
  return VALID_MODES.has(mode) ? mode : VOICE_OUTPUT_MODES.OFF;
}

export function resolveVoicePreset(profileId) {
  return VOICE_PERSONALITY_PRESETS[profileId] ?? VOICE_PERSONALITY_PRESETS.balanced;
}

export function sanitizeVoiceOutputText(value) {
  if (typeof value !== 'string') return '';

  const withoutControlCharacters = [...value]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127 ? ' ' : character;
    })
    .join('');

  return withoutControlCharacters
    .replace(/<[^>]*>/g, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(?:#{1,6}|>|[-*+]\s|\d+\.\s)/gm, ' ')
    .replace(/[*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function containsSensitiveVoiceData(text) {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(text));
}

export function prepareVoiceOutputText(value, { premium = false } = {}) {
  const text = sanitizeVoiceOutputText(value);
  if (!text) {
    return { data: null, error: { code: 'EMPTY_TEXT', message: 'Não há uma resposta para reproduzir.' } };
  }
  if (containsSensitiveVoiceData(text)) {
    return {
      data: null,
      error: {
        code: 'SENSITIVE_TEXT',
        message: 'Esta resposta contém dados que não devem ser enviados para reprodução de voz.',
      },
    };
  }
  if (premium && text.length > PREMIUM_TEXT_LIMIT) {
    return {
      data: null,
      error: {
        code: 'TEXT_TOO_LONG',
        message: 'Use o resumo curto da orientação para a demonstração de voz premium.',
      },
    };
  }
  return { data: text, error: null };
}

export function createPremiumSessionGuard(limit = PREMIUM_SESSION_LIMIT) {
  let count = 0;
  let active = false;

  return {
    begin() {
      if (active) return { allowed: false, reason: 'DUPLICATE_GENERATION', count };
      if (count >= limit) return { allowed: false, reason: 'QUOTA_REACHED', count };
      active = true;
      count += 1;
      return { allowed: true, reason: null, count };
    },
    finish() {
      active = false;
    },
    getState() {
      return { count, active, limit };
    },
  };
}
