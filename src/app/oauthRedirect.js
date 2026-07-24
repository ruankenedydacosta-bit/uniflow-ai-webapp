// AUTH4: URL de callback do login Google via Supabase Auth. Funções puras e
// testáveis -- não leem window.location sem proteção; isso só é usado como
// fallback em runtime real de navegador, nunca em teste puro.

const LOCAL_APP_URL = 'http://localhost:5173';
export const OAUTH_CALLBACK_PATH = '/auth/callback';

/**
 * Resolve a URL base do app para o redirect pós-OAuth, nesta ordem:
 * 1) VITE_APP_URL (variável pública, definida explicitamente para produção);
 * 2) window.location.origin (fallback seguro em runtime real de navegador,
 *    idêntico ao já usado por requestPasswordReset);
 * 3) localhost:5173 (fallback determinístico -- testes puros, SSR ausente).
 */
export function resolveAppUrl(env = (typeof import.meta !== 'undefined' ? import.meta.env : {}) ?? {}) {
  const configured = typeof env.VITE_APP_URL === 'string' ? env.VITE_APP_URL.trim() : '';
  if (configured) return configured;

  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }

  return LOCAL_APP_URL;
}

/** Remove barra(s) final(is) e concatena o path fixo do callback -- nunca duplica barra. */
export function buildOAuthCallbackUrl(appUrl = LOCAL_APP_URL) {
  const normalized = String(appUrl || LOCAL_APP_URL).replace(/\/+$/, '');
  return `${normalized}${OAUTH_CALLBACK_PATH}`;
}
