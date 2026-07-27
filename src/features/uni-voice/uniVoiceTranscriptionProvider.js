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
  async function transcribe({ audio, durationMs, workspaceId } = {}) {
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
    const timeout = runtime.setTimeout?.(() => controller.abort('timeout'), timeoutMs);

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

      if (!response.ok) {
        const code = response.status === 401 ? 'UNAUTHORIZED'
          : response.status === 403 ? 'WORKSPACE_FORBIDDEN'
            : response.status === 413 ? 'AUDIO_TOO_LARGE'
              : response.status === 415 ? 'UNSUPPORTED_AUDIO_TYPE'
                : response.status === 429 ? 'RATE_LIMIT'
                  : response.status === 504 ? 'TIMEOUT' : 'TRANSCRIPTION_FAILED';
        return { text: null, error: { code } };
      }

      const data = await response.json();
      const text = sanitizeVoiceTranscript(data?.text);
      return text
        ? { text, error: null }
        : { text: null, error: { code: 'EMPTY_TRANSCRIPT' } };
    } catch {
      return {
        text: null,
        error: { code: controller.signal.reason === 'timeout' ? 'TIMEOUT' : 'NETWORK' },
      };
    } finally {
      runtime.clearTimeout?.(timeout);
    }
  }

  return { transcribe };
}

export const uniVoiceTranscriptionProvider = createUniVoiceTranscriptionProvider();
