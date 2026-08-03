import { VOICE_TTS_ERROR_CODES } from './voiceTtsStatus.js';

const TRUE_VALUE = 'true';

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

export function resolveVoiceFallbackPolicy({ env = {}, userId = null } = {}) {
  const isDevelopment = env.DEV === true;
  const fallbackFlagEnabled = isEnabled(env.VITE_UNI_VOICE_DEV_FALLBACK_ENABLED);
  const authorizedUserIds = parseVoiceTestUserIds(env.VITE_UNI_VOICE_TEST_USER_IDS);
  const isAuthorizedTestUser = Boolean(userId && authorizedUserIds.includes(userId));
  const browserFallbackAllowed = fallbackFlagEnabled && (isDevelopment || isAuthorizedTestUser);
  const forceBrowserTts = browserFallbackAllowed
    && isEnabled(env.VITE_UNI_VOICE_FORCE_BROWSER_TTS);

  return Object.freeze({
    browserFallbackAllowed,
    forceBrowserTts,
    shouldTryPrimaryProvider: !forceBrowserTts,
    isDevelopment,
    isAuthorizedTestUser,
  });
}

export function shouldUseBrowserFallback(error, policy) {
  return Boolean(
    policy?.browserFallbackAllowed
    && error?.code === VOICE_TTS_ERROR_CODES.PROVIDER_QUOTA_ERROR,
  );
}
