// HOTFIX CRÍTICO 2 (pipeline de voz sem evidência física de captura real):
// diagnóstico estruturado do pipeline completo HOLD -> stream -> track ->
// analyser -> recorder -> blob -> STT -> transcript -> Uni -- mesmo padrão
// já validado em voiceTranscriptionTelemetry.js (env/logger injetáveis,
// allowlist fechada, nunca loga áudio/texto, só metadados técnicos). Existe
// para permitir, num teste físico real, identificar exatamente em qual
// etapa o pipeline para -- sem depender de `listening === true` como
// "prova" de captura.
//
// Ativação: DEV sempre; em Preview/Production (build normal, DEV=false) é
// OPT-IN via `localStorage.setItem('uniVoiceDebug', '1')` -- necessário
// porque o teste físico real acontece num APK/navegador rodando o build de
// produção (Preview da Vercel), onde `import.meta.env.DEV` é sempre falso.
// Sem esse opt-in explícito, nenhum usuário real jamais vê estes logs.
function isDiagnosticsEnabled(env, runtime) {
  if (env?.DEV) return true;
  try {
    return runtime?.localStorage?.getItem?.('uniVoiceDebug') === '1';
  } catch {
    return false;
  }
}

const PIPELINE_STAGES = new Set([
  'MIC_REQUEST_STARTED',
  'MIC_PERMISSION_GRANTED',
  'MIC_STREAM_RECEIVED',
  'MIC_AUDIO_TRACK_LIVE',
  'CAPTURE_STARTED',
  'CAPTURE_RELEASED',
  'CAPTURE_CANCELLED',
  'AUDIO_CONTEXT_CREATED',
  'AUDIO_CONTEXT_STATE',
  'ANALYSER_CONNECTED',
  'ANALYSER_RECEIVING_SIGNAL',
  'ANALYSER_SILENT_TIMEOUT',
  'RECORDER_STARTED',
  'RECORDER_DATA_AVAILABLE',
  'RECORDER_STOPPED',
  'AUDIO_BLOB_CREATED',
  'STT_REQUEST_STARTED',
  'STT_HTTP_RESPONSE',
  'STT_RESPONSE_RECEIVED',
  'TRANSCRIPT_NON_EMPTY',
  'MESSAGE_SENT_TO_UNI',
  'MIC_PERMISSION_ERROR',
  'TRACK_ENDED',
  'TRACK_MUTED',
  'RECORDER_ERROR',
  'EMPTY_AUDIO',
  'STT_ERROR',
  'EMPTY_TRANSCRIPT',
]);

export function recordVoicePipelineDiagnostic(stage, detail = {}, {
  env = import.meta.env ?? {},
  runtime = typeof globalThis !== 'undefined' ? globalThis : undefined,
  logger = console.debug,
} = {}) {
  if (!isDiagnosticsEnabled(env, runtime) || typeof logger !== 'function') return null;

  const safeStage = PIPELINE_STAGES.has(stage) ? stage : 'UNKNOWN_STAGE';
  const safeDetail = Object.freeze({
    blobSizeBytes: Number.isFinite(detail?.blobSizeBytes) ? Math.round(detail.blobSizeBytes) : null,
    mimeType: typeof detail?.mimeType === 'string' ? detail.mimeType.slice(0, 60) : null,
    durationMs: Number.isFinite(detail?.durationMs) ? Math.round(detail.durationMs) : null,
    trackReadyState: typeof detail?.trackReadyState === 'string' ? detail.trackReadyState.slice(0, 20) : null,
    trackEnabled: typeof detail?.trackEnabled === 'boolean' ? detail.trackEnabled : null,
    trackMuted: typeof detail?.trackMuted === 'boolean' ? detail.trackMuted : null,
    audioTrackCount: Number.isFinite(detail?.audioTrackCount) ? Math.max(0, Math.round(detail.audioTrackCount)) : null,
    streamActive: typeof detail?.streamActive === 'boolean' ? detail.streamActive : null,
    audioContextState: typeof detail?.audioContextState === 'string' ? detail.audioContextState.slice(0, 20) : null,
    recorderState: typeof detail?.recorderState === 'string' ? detail.recorderState.slice(0, 20) : null,
    httpStatus: Number.isFinite(detail?.httpStatus) ? Math.round(detail.httpStatus) : null,
    transcriptLength: Number.isFinite(detail?.transcriptLength) ? Math.round(detail.transcriptLength) : null,
    finishReason: typeof detail?.finishReason === 'string' ? detail.finishReason.slice(0, 40) : null,
    messageDelivered: typeof detail?.messageDelivered === 'boolean' ? detail.messageDelivered : null,
  });

  logger(`[Uni Voice Pipeline DEV] ${safeStage}`, safeDetail);
  return { stage: safeStage, detail: safeDetail };
}
