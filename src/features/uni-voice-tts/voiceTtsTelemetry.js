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
  if (!env.DEV || typeof logger !== 'function') return null;

  const safeEvent = Object.freeze({
    messageId: event?.messageId == null ? null : String(event.messageId),
    requestId: typeof event?.requestId === 'string' ? event.requestId : null,
    source: VALID_SOURCES.has(event?.source) ? event.source : 'chat_response',
    provider: VALID_PROVIDERS.has(event?.provider) ? event.provider : 'elevenlabs',
    status: typeof event?.status === 'string' ? event.status : 'unknown',
    deduplicated: Boolean(event?.deduplicated),
    fallbackUsed: Boolean(event?.fallbackUsed),
  });

  logger('[Uni Voice DEV]', safeEvent);
  return safeEvent;
}

export function resetVoiceTtsRequestSequenceForTests() {
  requestSequence = 0;
}
