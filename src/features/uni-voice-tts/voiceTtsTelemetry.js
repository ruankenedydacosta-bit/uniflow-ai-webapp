import { normalizeTelemetryErrorCode, telemetry } from '../observability/index.js';

const VALID_SOURCES = new Set([
  'greeting',
  'home_response',
  'chat_response',
  'manual_replay',
]);

const VALID_PROVIDERS = new Set(['elevenlabs', 'browser', 'cache']);

let requestSequence = 0;

export function createVoiceTtsRequestContext({ messageId = null, source = 'chat_response' } = {}) {
  requestSequence += 1;
  return Object.freeze({
    messageId: messageId == null ? null : String(messageId),
    requestId: `voice-${requestSequence}`,
    source: VALID_SOURCES.has(source) ? source : 'chat_response',
  });
}

export function recordVoiceTtsTelemetry(event, {
  env = import.meta.env ?? {},
  logger = console.info,
} = {}) {
  const source = VALID_SOURCES.has(event?.source) ? event.source : 'chat_response';
  const provider = VALID_PROVIDERS.has(event?.provider) ? event.provider : 'elevenlabs';
  const status = typeof event?.status === 'string' ? event.status : 'unknown';
  const identity = {
    messageId: event?.messageId == null ? null : String(event.messageId),
    requestId: typeof event?.requestId === 'string' ? event.requestId : null,
  };
  void telemetry.event('tts.lifecycle', {
    source,
    provider,
    status,
    deduplicated: Boolean(event?.deduplicated),
    fallbackUsed: Boolean(event?.fallbackUsed),
  }, identity);
  if (status === 'error') {
    void telemetry.error('tts.failure', {
      errorCode: normalizeTelemetryErrorCode(event?.errorCode, 'TTS_PROVIDER_ERROR'),
      stage: 'provider',
      source,
      provider,
      recoverable: true,
      fallbackUsed: Boolean(event?.fallbackUsed),
    }, identity);
  }

  if (!env.DEV || typeof logger !== 'function') return null;

  const safeEvent = Object.freeze({
    messageId: event?.messageId == null ? null : String(event.messageId),
    requestId: typeof event?.requestId === 'string' ? event.requestId : null,
    source,
    provider,
    status,
    deduplicated: Boolean(event?.deduplicated),
    fallbackUsed: Boolean(event?.fallbackUsed),
  });

  logger('[Uni Voice DEV]', safeEvent);
  return safeEvent;
}

export function recordBrowserSpeechDiagnostic(diagnostic, {
  env = import.meta.env ?? {},
  logger = console.info,
} = {}) {
  const nativePreviewEnabled = String(env.VITE_UNI_VOICE_NATIVE_TTS_ENABLED ?? '').toLowerCase() === 'true';
  if ((!env.DEV && !nativePreviewEnabled) || typeof logger !== 'function') return null;

  const safeDiagnostic = Object.freeze({
    stage: typeof diagnostic?.stage === 'string' ? diagnostic.stage : 'unknown',
    supported: Boolean(diagnostic?.supported),
    voicesCount: Number.isInteger(diagnostic?.voicesCount) ? diagnostic.voicesCount : 0,
    selectedVoiceName: typeof diagnostic?.selectedVoiceName === 'string'
      ? diagnostic.selectedVoiceName.slice(0, 80)
      : null,
    selectedVoiceLanguage: typeof diagnostic?.selectedVoiceLanguage === 'string'
      ? diagnostic.selectedVoiceLanguage.slice(0, 16)
      : null,
    selectedVoiceLocalService: typeof diagnostic?.selectedVoiceLocalService === 'boolean'
      ? diagnostic.selectedVoiceLocalService
      : null,
    speaking: Boolean(diagnostic?.speaking),
    pending: Boolean(diagnostic?.pending),
    paused: Boolean(diagnostic?.paused),
    nativeError: typeof diagnostic?.nativeError === 'string'
      ? diagnostic.nativeError.slice(0, 80)
      : null,
  });
  logger('[Uni Voice Native]', safeDiagnostic);
  return safeDiagnostic;
}

export function resetVoiceTtsRequestSequenceForTests() {
  requestSequence = 0;
}
