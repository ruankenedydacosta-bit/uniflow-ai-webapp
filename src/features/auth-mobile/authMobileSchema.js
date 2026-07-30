export const AUTH_MODES = Object.freeze({
  SIGN_IN: 'signin',
  SIGN_UP: 'signup',
});

export const SOCIAL_PROVIDERS = Object.freeze({
  GOOGLE: 'google',
  APPLE: 'apple',
});

export function normalizeAuthMode(value) {
  return value === AUTH_MODES.SIGN_UP ? AUTH_MODES.SIGN_UP : AUTH_MODES.SIGN_IN;
}

export function getSocialUnavailableResult(provider) {
  const name = provider === SOCIAL_PROVIDERS.APPLE ? 'Apple' : 'Google';
  return Object.freeze({
    available: false,
    provider: provider === SOCIAL_PROVIDERS.APPLE
      ? SOCIAL_PROVIDERS.APPLE
      : SOCIAL_PROVIDERS.GOOGLE,
    message: `Login com ${name} estará disponível em breve.`,
  });
}

/**
 * AUTH4: mensagem segura para qualquer falha síncrona de signInWithGoogle
 * (provider Google desabilitado no projeto Supabase, rede indisponível
 * antes do redirect, etc.) -- nunca expõe o erro técnico cru do Supabase.
 * A falha mais comum (provider desabilitado) normalmente NÃO chega aqui:
 * o Supabase costuma redirecionar de volta para /auth/callback com
 * `?error=`/`error_description` em vez de retornar erro síncrono -- esse
 * caso é tratado em AuthCallbackPage, não aqui.
 */
export function getGoogleAuthFeedback(error) {
  if (!error) return null;
  return 'O acesso com Google ainda não está disponível neste ambiente.';
}
