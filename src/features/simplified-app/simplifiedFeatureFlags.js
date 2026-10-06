export const SIMPLIFIED_FEATURE_FLAG_KEYS = Object.freeze({
  AGENDA: 'VITE_SIMPLIFIED_AGENDA_ENABLED',
  SUPPORT_NAV: 'VITE_SIMPLIFIED_SUPPORT_NAV_ENABLED',
  // Conversa por voz em tempo real (épico #116). Desligada, o assistente usa
  // a captura antiga (gravar, enviar e ouvir).
  REALTIME_VOICE: 'VITE_UNI_REALTIME_VOICE_ENABLED',
});

export function resolveSimplifiedFeatureFlags(env = {}) {
  const safeEnv = env && typeof env === 'object' ? env : {};
  return Object.freeze({
    agendaEnabled: safeEnv[SIMPLIFIED_FEATURE_FLAG_KEYS.AGENDA] === 'true',
    supportNavEnabled: safeEnv[SIMPLIFIED_FEATURE_FLAG_KEYS.SUPPORT_NAV] === 'true',
    realtimeVoiceEnabled: safeEnv[SIMPLIFIED_FEATURE_FLAG_KEYS.REALTIME_VOICE] === 'true',
  });
}

export const SIMPLIFIED_FEATURE_FLAGS = resolveSimplifiedFeatureFlags(import.meta.env);
