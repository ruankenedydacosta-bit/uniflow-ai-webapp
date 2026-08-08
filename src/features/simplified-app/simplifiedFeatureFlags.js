export const SIMPLIFIED_FEATURE_FLAG_KEYS = Object.freeze({
  AGENDA: 'VITE_SIMPLIFIED_AGENDA_ENABLED',
});

export function resolveSimplifiedFeatureFlags(env = {}) {
  const safeEnv = env && typeof env === 'object' ? env : {};
  return Object.freeze({
    agendaEnabled: safeEnv[SIMPLIFIED_FEATURE_FLAG_KEYS.AGENDA] === 'true',
  });
}

export const SIMPLIFIED_FEATURE_FLAGS = resolveSimplifiedFeatureFlags(import.meta.env);
