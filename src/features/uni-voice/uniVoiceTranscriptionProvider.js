import {
  supabase,
  supabaseAnonKey,
  supabaseUrl,
} from '../../services/supabaseClient.js';
import {
  VOICE_AUDIO_MAX_BYTES,
  VOICE_AUDIO_MAX_DURATION_MS,
  VOICE_AUDIO_MIME_TYPES,
} from './mediaRecorderAdapter.js';
import { sanitizeVoiceTranscript } from './speechRecognitionAdapter.js';
import { recordVoiceTranscriptionTelemetry } from './voiceTranscriptionTelemetry.js';
import { telemetry } from '../observability/index.js';
import { recordVoicePipelineDiagnostic } from './voicePipelineDiagnostics.js';

export const UNI_VOICE_TRANSCRIBE_FUNCTION = 'uni-voice-transcribe';
export const UNI_VOICE_TRANSCRIPTION_TIMEOUT_MS = 20_000;

function normalizeMimeType(value) {
  return String(value || '').toLowerCase().split(';')[0];
}

export function isAllowedVoiceMimeType(value) {
  const normalized = normalizeMimeType(value);
  return VOICE_AUDIO_MIME_TYPES.some(
    (allowed) => normalizeMimeType(allowed) === normalized,
  );
}

export function validateVoiceTranscriptionRequest({ audio, durationMs, workspaceId } = {}) {
  if (!(audio instanceof Blob) || !audio.size) return 'EMPTY_AUDIO';
  if (audio.size > VOICE_AUDIO_MAX_BYTES) return 'AUDIO_TOO_LARGE';
  if (!isAllowedVoiceMimeType(audio.type)) return 'UNSUPPORTED_AUDIO_TYPE';
  if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > VOICE_AUDIO_MAX_DURATION_MS) {
    return 'AUDIO_DURATION_INVALID';
  }
  if (typeof workspaceId !== 'string' || !workspaceId) return 'WORKSPACE_REQUIRED';
  return null;
}

export function createUniVoiceTranscriptionProvider({
  client = supabase,
  url = supabaseUrl,
  anonKey = supabaseAnonKey,
  fetchImpl = globalThis.fetch,
  runtime = globalThis,
  timeoutMs = UNI_VOICE_TRANSCRIPTION_TIMEOUT_MS,
} = {}) {
  async function transcribe({ audio, durationMs, workspaceId, sessionId, signal } = {}) {
    const validationError = validateVoiceTranscriptionRequest({
      audio,
      durationMs,
      workspaceId,
    });
    if (validationError) {
      return { text: null, error: { code: validationError } };
    }
    if (!client || !url || !anonKey || typeof fetchImpl !== 'function') {
      return { text: null, error: { code: 'TRANSCRIPTION_UNAVAILABLE' } };
    }

    const sessionResult = await client.auth.getSession();
    const accessToken = sessionResult?.data?.session?.access_token;
    if (!accessToken) return { text: null, error: { code: 'UNAUTHORIZED' } };

    const formData = new FormData();
    const extension = normalizeMimeType(audio.type) === 'audio/mp4' ? 'm4a'
      : normalizeMimeType(audio.type) === 'audio/ogg' ? 'ogg' : 'webm';
    formData.append('audio', audio, `uni-voice.${extension}`);
    formData.append('workspace_id', workspaceId);
    formData.append('duration_ms', String(Math.round(durationMs)));

    const controller = new AbortController();
    const abortFromCaller = () => controller.abort(signal?.reason ?? 'cancelled');
    if (signal?.aborted) abortFromCaller();
    else signal?.addEventListener?.('abort', abortFromCaller, { once: true });
    const timeout = runtime.setTimeout?.(() => controller.abort('timeout'), timeoutMs);
    const requestStartedAt = Date.now();

    try {
      const response = await fetchImpl(`${url}/functions/v1/${UNI_VOICE_TRANSCRIBE_FUNCTION}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: anonKey,
        },
        body: formData,
        signal: controller.signal,
      });
      recordVoicePipelineDiagnostic('STT_HTTP_RESPONSE', {
        httpStatus: response.status,
        sessionId,
        transcriptEmpty: response.status === 422,
      });

      if (!response.ok) {
        // HOTFIX P0.5: a Edge Function responde 422 ("Fala nao identificada")
        // quando o provedor transcreve mas nao ha fala reconhecivel -- um
        // resultado ESPERADO (ex.: gravacao muito curta/silenciosa, usuario
        // solta o botao quase imediatamente), nao uma falha tecnica. Sem
        // este caso, 422 caia no fallback 'TRANSCRIPTION_FAILED' generico e
        // useUniVoiceInput.js despachava VOICE_CAPTURE_STATES.ERROR ("Nao
        // consegui concluir. Tente novamente.") em vez do estado amigavel
        // NO_SPEECH ja existente especificamente para este caso -- mesmo
        // codigo ('EMPTY_TRANSCRIPT') que o proprio 200-com-texto-vazio ja
        // usa logo abaixo.
        const code = response.status === 401 ? 'UNAUTHORIZED'
          : response.status === 403 ? 'WORKSPACE_FORBIDDEN'
            : response.status === 413 ? 'AUDIO_TOO_LARGE'
              : response.status === 415 ? 'UNSUPPORTED_AUDIO_TYPE'
                : response.status === 422 ? 'EMPTY_TRANSCRIPT'
                  : response.status === 429 ? 'RATE_LIMIT'
                    : response.status === 504 ? 'TIMEOUT' : 'TRANSCRIPTION_FAILED';
        // HOTFIX FINAL P4: diagnóstico sanitizado (DEV only, nunca conteúdo
        // de áudio/texto) -- distingue um 422 legítimo (áudio realmente sem
        // fala reconhecível) de um 422 causado por algo quebrado no envio
        // (duração/tamanho/mime type suspeitos para um áudio que deveria
        // ser válido).
        recordVoiceTranscriptionTelemetry({
          responseStatus: response.status,
          errorKind: code,
          durationMs,
          blobSizeBytes: audio.size,
          mimeType: audio.type,
        });
        void telemetry.error('edge_function.failure', {
          errorCode: code,
          stage: 'voice_transcription',
          source: 'edge_function',
          provider: 'transcription',
          recoverable: response.status >= 500 || response.status === 429,
        }, { workspaceId });
        return { text: null, error: { code } };
      }

      const data = await response.json();
      const text = sanitizeVoiceTranscript(data?.text);
      if (text) return { text, error: null };
      recordVoiceTranscriptionTelemetry({
        responseStatus: response.status,
        errorKind: 'EMPTY_TRANSCRIPT',
        durationMs,
        blobSizeBytes: audio.size,
        mimeType: audio.type,
      });
      return { text: null, error: { code: 'EMPTY_TRANSCRIPT' } };
    } catch {
      const code = controller.signal.reason === 'timeout'
        ? 'TIMEOUT'
        : signal?.aborted ? 'ABORTED' : 'NETWORK';
      void telemetry.error('edge_function.failure', {
        errorCode: code,
        stage: 'voice_transcription',
        source: 'edge_function',
        provider: 'transcription',
        recoverable: true,
      }, { workspaceId });
      return {
        text: null,
        error: { code },
      };
    } finally {
      void telemetry.metric('edge_function.latency_ms', {
        value: Math.max(0, Date.now() - requestStartedAt),
        unit: 'ms',
        source: 'transcription',
        status: controller.signal.aborted ? 'aborted' : 'completed',
      }, { workspaceId });
      runtime.clearTimeout?.(timeout);
      signal?.removeEventListener?.('abort', abortFromCaller);
    }
  }

  return { transcribe };
}

export const uniVoiceTranscriptionProvider = createUniVoiceTranscriptionProvider();
