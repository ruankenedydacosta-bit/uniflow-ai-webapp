// HOTFIX FINAL P4: diagnóstico sanitizado (DEV only) para 422 e outras
// falhas de transcrição -- mesmo padrão já usado por
// uni-voice-tts/voiceTtsTelemetry.js (função pura, gated por env.DEV,
// logger injetável para teste, campos SEMPRE sanitizados). Nunca registra
// conteúdo de áudio nem texto transcrito -- só metadados técnicos que
// ajudam a distinguir "áudio realmente vazio/curto" (422 legítimo) de
// "algo no envio/formato está quebrando um áudio válido" (bug real).
const NORMALIZED_ERROR_KINDS = new Set([
  'EMPTY_TRANSCRIPT',
  'UNAUTHORIZED',
  'WORKSPACE_FORBIDDEN',
  'AUDIO_TOO_LARGE',
  'UNSUPPORTED_AUDIO_TYPE',
  'AUDIO_DURATION_INVALID',
  'WORKSPACE_REQUIRED',
  'RATE_LIMIT',
  'TIMEOUT',
  'NETWORK',
  'TRANSCRIPTION_UNAVAILABLE',
  'TRANSCRIPTION_FAILED',
]);

export function recordVoiceTranscriptionTelemetry(event, {
  env = import.meta.env ?? {},
  logger = console.info,
} = {}) {
  if (!env.DEV || typeof logger !== 'function') return null;

  const safeEvent = Object.freeze({
    responseStatus: Number.isFinite(event?.responseStatus) ? event.responseStatus : null,
    errorKind: NORMALIZED_ERROR_KINDS.has(event?.errorKind) ? event.errorKind : 'UNKNOWN',
    durationMs: Number.isFinite(event?.durationMs) ? Math.round(event.durationMs) : null,
    blobSizeBytes: Number.isFinite(event?.blobSizeBytes) ? Math.round(event.blobSizeBytes) : null,
    mimeType: typeof event?.mimeType === 'string' ? event.mimeType.slice(0, 60) : null,
  });

  logger('[Uni Voice Transcription DEV]', safeEvent);
  return safeEvent;
}
