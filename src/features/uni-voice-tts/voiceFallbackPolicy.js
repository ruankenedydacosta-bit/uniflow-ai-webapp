import { VOICE_TTS_ERROR_CODES } from './voiceTtsStatus.js';
import { VOICE_PROVIDER_IDS, isValidVoiceProvider } from './voiceProviderRegistry.js';

const TRUE_VALUE = 'true';

// Falhas do LADO DO PROVEDOR (ElevenLabs/Edge Function): qualquer uma delas
// significa que o audio oficial nao foi gerado -- o fallback do navegador e
// a substitucao legitima. Erros de sessao/texto/cancelamento (UNAUTHORIZED,
// INVALID_TEXT, CANCELLED, etc.) nunca acionam o fallback: nao sao falha do
// provedor e nao adiantaria trocar de mecanismo de voz.
const BROWSER_FALLBACK_ELIGIBLE_CODES = Object.freeze([
  VOICE_TTS_ERROR_CODES.PROVIDER_QUOTA_ERROR,
  VOICE_TTS_ERROR_CODES.PROVIDER_AUTH_ERROR,
  VOICE_TTS_ERROR_CODES.PROVIDER_VOICE_NOT_FOUND,
  VOICE_TTS_ERROR_CODES.PROVIDER_ERROR,
  VOICE_TTS_ERROR_CODES.PROVIDER_TIMEOUT,
  VOICE_TTS_ERROR_CODES.PROVIDER_RATE_LIMIT,
  VOICE_TTS_ERROR_CODES.NETWORK_ERROR,
]);

function isEnabled(value) {
  return String(value ?? '').trim().toLowerCase() === TRUE_VALUE;
}

export function parseVoiceTestUserIds(value) {
  return Object.freeze(
    [...new Set(
      String(value ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    )],
  );
}

export function resolveVoiceFallbackPolicy({ env = {}, userId = null, selectedProvider = null } = {}) {
  const isDevelopment = env.DEV === true;
  const nativeTtsEnabled = isEnabled(env.VITE_UNI_VOICE_NATIVE_TTS_ENABLED);
  const fallbackFlagEnabled = isEnabled(env.VITE_UNI_VOICE_DEV_FALLBACK_ENABLED);
  const authorizedUserIds = parseVoiceTestUserIds(env.VITE_UNI_VOICE_TEST_USER_IDS);
  const isAuthorizedTestUser = Boolean(userId && authorizedUserIds.includes(userId));
  const legacyBrowserFallbackAllowed = fallbackFlagEnabled && (isDevelopment || isAuthorizedTestUser);
  const hasSelectedProvider = isValidVoiceProvider(selectedProvider);
  const browserFallbackAllowed = hasSelectedProvider
    ? true
    : nativeTtsEnabled || legacyBrowserFallbackAllowed;
  const forceBrowserTts = hasSelectedProvider
    ? selectedProvider === VOICE_PROVIDER_IDS.NATIVE
    : nativeTtsEnabled || (
      legacyBrowserFallbackAllowed && isEnabled(env.VITE_UNI_VOICE_FORCE_BROWSER_TTS)
    );

  return Object.freeze({
    browserFallbackAllowed,
    forceBrowserTts,
    shouldTryPrimaryProvider: !forceBrowserTts,
    nativeTtsEnabled,
    isDevelopment,
    isAuthorizedTestUser,
    selectedProvider: hasSelectedProvider ? selectedProvider : null,
  });
}

export function shouldUseBrowserFallback(error, policy) {
  return Boolean(
    policy?.browserFallbackAllowed
    && error?.code
    && BROWSER_FALLBACK_ELIGIBLE_CODES.includes(error.code),
  );
}
