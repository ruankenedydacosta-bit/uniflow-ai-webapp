import { TTS_FUNCTION_NAME, DEFAULT_TTS_TIMEOUT_MS } from './voiceTtsConfig.js';
import { VOICE_TTS_ERROR_CODES } from './voiceTtsStatus.js';
import { normalizeTelemetryErrorCode, telemetry } from '../observability/index.js';
import { LOADED_BUILD_ID } from '../pwa-install/appVersion.js';

// PWA-UPDATE3/INCIDENTE IPHONE: diagnostico sanitizado do exato ponto onde
// o audio.play() do elemento PERSISTENTE (ver ensureAudio) e chamado,
// resolve ou rejeita -- nunca texto/tokens/audio, so o essencial para
// separar os casos D (play() chamado mas rejeita)/E/F do relatorio de
// incidente. runtimeBuildId identifica se o aparelho que reportou o
// problema ja estava no build mais recente quando isto aconteceu -- a
// origin/plataforma (ios_safari/pwa/etc.) ja vem de graca no contexto
// global do telemetry (telemetryRuntime.js), nunca duplicada aqui.
// Truncado (padrao "short SHA", como `git rev-parse --short HEAD`): o
// sanitizador de telemetry (telemetryRedaction.js) rejeita qualquer string
// com 7+ digitos consecutivos (heuristica anti-PII, ex.: telefone/conta) --
// um SHA completo de 40 caracteres quase sempre contem uma sequencia dessas
// por acaso, o que faria o proprio runtimeBuildId sumir do evento na
// maioria dos builds. 7 caracteres ja identifica o deploy de forma unica
// na pratica e reduz drasticamente essa colisao.
const SHORT_BUILD_ID = typeof LOADED_BUILD_ID === 'string' ? LOADED_BUILD_ID.slice(0, 7) : null;

function recordPlaybackTelemetry(event, extra = {}) {
  void telemetry.event('tts.playback_lifecycle', {
    event,
    runtimeBuildId: SHORT_BUILD_ID,
    ...extra,
  });
}

// ELEVEN1: unico ponto do frontend que sabe da existencia da Edge Function
// uni-voice-tts. Nenhum componente React chama fetch diretamente nem
// conhece a chave/voice ID do provedor -- tudo isso vive so no servidor.
//
// Retry: no maximo uma tentativa extra, e SOMENTE em falha pura de rede
// (o fetch nem chegou a obter uma resposta HTTP) -- mesmo criterio ja
// usado por uniLlmProvider.js (OPENAI1). Nunca em TIMEOUT, nunca em erro
// HTTP (401/403/422/429/5xx), nunca em cancelamento.
const MAX_NETWORK_RETRIES = 1;
const SILENT_WAV_DATA_URI = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=';
const DEFAULT_PLAYBACK_PREPARATION_TIMEOUT_MS = 700;

function providerError(code, message, details = {}) {
  return Object.assign(new Error(message ?? code), {
    code,
    retryable: Boolean(details.retryable),
    providerStatus: Number.isInteger(details.providerStatus) ? details.providerStatus : null,
  });
}

export function createElevenLabsTtsProvider({
  supabase,
  supabaseUrl,
  supabaseAnonKey,
  enabled = false,
  fetchImpl = globalThis.fetch,
  runtime = globalThis,
  timeoutMs = DEFAULT_TTS_TIMEOUT_MS,
  playbackPreparationTimeoutMs = DEFAULT_PLAYBACK_PREPARATION_TIMEOUT_MS,
} = {}) {
  let audio = null;
  let objectUrl = null;
  let controller = null;
  // Resolve/reject da Promise de speak() ATUALMENTE pendente (aguardando
  // onended/onerror do audio) -- nulo assim que ela se resolve sozinha.
  // Sem isso, stop() no meio da reproducao liberaria o audio mas deixaria
  // a Promise de speak() pendurada para sempre (nenhum onended chamado).
  let activeSettle = null;

  function isSupported() {
    return Boolean(enabled && supabase && supabaseUrl && supabaseAnonKey && fetchImpl && runtime?.Audio && runtime?.URL?.createObjectURL);
  }

  function ensureAudio() {
    if (!audio) {
      audio = new runtime.Audio();
      audio.preload = 'auto';
      audio.playsInline = true;
    }
    return audio;
  }

  async function healthCheck() {
    if (!enabled) return { available: false, reason: 'DISABLED' };
    if (!supabase || !supabaseUrl || !supabaseAnonKey || !fetchImpl) {
      return { available: false, reason: 'BACKEND_NOT_CONFIGURED' };
    }
    return { available: true, reason: null };
  }

  function releaseAudio() {
    if (audio) {
      audio.onplay = null;
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.src = '';
      audio.load?.();
    }
    if (objectUrl) runtime.URL?.revokeObjectURL?.(objectUrl);
    objectUrl = null;
  }

  async function preparePlayback() {
    if (!isSupported()) return false;
    stop();
    const playback = ensureAudio();
    const previousMuted = Boolean(playback.muted);
    playback.muted = true;
    playback.src = SILENT_WAV_DATA_URI;
    try {
      let timeoutId = null;
      const playbackStarted = await Promise.race([
        Promise.resolve(playback.play()).then(() => true, () => false),
        new Promise((resolve) => {
          timeoutId = runtime.setTimeout?.(() => resolve(false), playbackPreparationTimeoutMs);
        }),
      ]);
      runtime.clearTimeout?.(timeoutId);

      if (!playbackStarted) return false;
      playback.pause();
      playback.currentTime = 0;
      return true;
    } catch {
      return false;
    } finally {
      playback.pause();
      playback.src = '';
      playback.load?.();
      playback.muted = previousMuted;
    }
  }

  // Cancela uma geracao EM ANDAMENTO (fetch ainda nao respondeu). Nunca
  // interrompe reproducao ja iniciada -- para isso existe stop().
  function cancel() {
    controller?.abort('cancelled');
  }

  function stop() {
    controller?.abort('cancelled');
    controller = null;
    if (activeSettle) {
      const settle = activeSettle;
      activeSettle = null;
      settle.reject(providerError(VOICE_TTS_ERROR_CODES.CANCELLED, 'tts_playback_stopped'));
    }
    releaseAudio();
  }

  function play() {
    if (!audio) return false;
    audio.play().catch(() => {});
    return true;
  }

  function pause() {
    audio?.pause();
  }

  function resume() {
    return audio ? audio.play().catch(() => {}) : Promise.resolve();
  }

  async function performRequest({ text, accessToken }) {
    const requestStartedAt = Date.now();
    const requestController = new AbortController();
    controller = requestController;
    const timeout = runtime.setTimeout?.(() => requestController.abort('timeout'), timeoutMs);

    try {
      const response = await fetchImpl(`${supabaseUrl}/functions/v1/${TTS_FUNCTION_NAME}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: supabaseAnonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
        signal: requestController.signal,
      });
      void telemetry.event('edge_function.lifecycle', {
        status: response.ok ? 'success' : 'error',
        stage: 'tts_request',
        source: 'edge_function',
        provider: 'elevenlabs',
      });
      if (!response.ok) {
        void telemetry.error('edge_function.failure', {
          errorCode: `HTTP_${response.status}`,
          stage: 'tts_request',
          source: 'edge_function',
          provider: 'elevenlabs',
          recoverable: response.status >= 500 || response.status === 429,
        });
      }
      return { ok: true, response };
    } catch {
      const reason = requestController.signal.reason;
      const code = reason === 'timeout'
        ? VOICE_TTS_ERROR_CODES.PROVIDER_TIMEOUT
        : reason === 'cancelled'
          ? VOICE_TTS_ERROR_CODES.CANCELLED
          : VOICE_TTS_ERROR_CODES.NETWORK_ERROR;
      void telemetry.error('edge_function.failure', {
        errorCode: code,
        stage: 'tts_request',
        source: 'edge_function',
        provider: 'elevenlabs',
        recoverable: code !== VOICE_TTS_ERROR_CODES.CANCELLED,
      });
      return { ok: false, code };
    } finally {
      void telemetry.metric('edge_function.latency_ms', {
        value: Math.max(0, Date.now() - requestStartedAt),
        unit: 'ms',
        source: 'tts',
        status: requestController.signal.aborted ? 'aborted' : 'completed',
      });
      runtime.clearTimeout?.(timeout);
      if (controller === requestController) controller = null;
    }
  }

  async function mapHttpError(response) {
    const body = await response.json().catch(() => null);
    const structuredError = body?.error && typeof body.error === 'object' ? body.error : null;
    const codeFromBody = typeof structuredError?.code === 'string'
      ? structuredError.code
      : typeof body?.code === 'string'
        ? body.code
        : null;
    if (codeFromBody && VOICE_TTS_ERROR_CODES[codeFromBody]) {
      return {
        code: VOICE_TTS_ERROR_CODES[codeFromBody],
        retryable: Boolean(structuredError?.retryable),
        providerStatus: Number.isInteger(structuredError?.provider_status)
          ? structuredError.provider_status
          : null,
      };
    }
    if (response.status === 401) return { code: VOICE_TTS_ERROR_CODES.UNAUTHORIZED };
    if (response.status === 403) return { code: VOICE_TTS_ERROR_CODES.FORBIDDEN };
    if (response.status === 429) return { code: VOICE_TTS_ERROR_CODES.PROVIDER_RATE_LIMIT, retryable: true };
    if (response.status === 400 || response.status === 413 || response.status === 422) {
      return { code: VOICE_TTS_ERROR_CODES.INVALID_REQUEST };
    }
    if (response.status === 503) return { code: VOICE_TTS_ERROR_CODES.CONFIGURATION_ERROR };
    if (response.status === 504) return { code: VOICE_TTS_ERROR_CODES.PROVIDER_TIMEOUT, retryable: true };
    return { code: VOICE_TTS_ERROR_CODES.PROVIDER_ERROR, retryable: response.status >= 500 };
  }

  /**
   * Gera a voz (Edge Function -> ElevenLabs) e JA inicia a reproducao.
   * BLOCO UNI 2: chamado tanto por um clique explicito do usuario (botao
   * "Ouvir") quanto pelo autoplay controlado da resposta atual da Uni (ver
   * o efeito em UniChatPage.jsx) -- em ambos os casos, sempre encerra
   * qualquer audio anterior antes de comecar (apenas um audio ativo por
   * vez), o que garante que uma nova resposta sempre interrompe a
   * anterior corretamente, mesmo quando autoplay e clique manual se
   * alternam.
   */
  async function speak(text, { onPlaying, onEnded, onError } = {}) {
    stop();
    recordPlaybackTelemetry('tts_request_started');

    if (!isSupported()) throw providerError(VOICE_TTS_ERROR_CODES.UNAVAILABLE, 'tts_unavailable');

    let accessToken;
    try {
      const sessionResult = await supabase.auth.getSession();
      accessToken = sessionResult?.data?.session?.access_token ?? null;
    } catch {
      accessToken = null;
    }
    if (!accessToken) throw providerError(VOICE_TTS_ERROR_CODES.UNAUTHORIZED, 'tts_auth_required');

    let attempt = await performRequest({ text, accessToken });
    let retries = 0;
    while (!attempt.ok && attempt.code === VOICE_TTS_ERROR_CODES.NETWORK_ERROR && retries < MAX_NETWORK_RETRIES) {
      retries += 1;
      attempt = await performRequest({ text, accessToken });
    }

    if (!attempt.ok) throw providerError(attempt.code, 'tts_request_failed');

    const { response } = attempt;
    if (!response.ok) {
      const mappedError = await mapHttpError(response);
      throw providerError(mappedError.code, 'tts_request_rejected', mappedError);
    }

    const cacheStatus = response.headers?.get?.('X-Uni-Voice-Cache') ?? null;
    const cacheHit = String(cacheStatus).toUpperCase() === 'HIT';
    const blob = await response.blob();
    objectUrl = runtime.URL.createObjectURL(blob);
    audio = ensureAudio();
    audio.src = objectUrl;

    recordPlaybackTelemetry('audio_blob_received', { cacheHit });

    return new Promise((resolve, reject) => {
      activeSettle = { resolve, reject };
      audio.onplay = () => {
        recordPlaybackTelemetry('audio_play_resolved');
        onPlaying?.();
      };
      audio.onended = () => {
        activeSettle = null;
        releaseAudio();
        onEnded?.();
        resolve({
          providerName: cacheHit ? 'cache' : 'elevenlabs_tts',
          cacheHit,
        });
      };
      audio.onerror = () => {
        activeSettle = null;
        releaseAudio();
        const err = providerError(VOICE_TTS_ERROR_CODES.AUDIO_PLAYBACK_ERROR, 'tts_playback_failed');
        onError?.(err);
        reject(err);
      };
      recordPlaybackTelemetry('audio_play_called');
      audio.play().catch((playError) => {
        activeSettle = null;
        releaseAudio();
        const code = playError?.name === 'NotAllowedError'
          ? VOICE_TTS_ERROR_CODES.AUTOPLAY_BLOCKED
          : VOICE_TTS_ERROR_CODES.AUDIO_PLAYBACK_ERROR;
        recordPlaybackTelemetry('audio_play_rejected', {
          // Sanitizado: so o nome do erro do navegador (ex.: "NotAllowedError"),
          // nunca a mensagem/texto/dado do usuario. Campo chamado errorCode
          // (nao errorName) de proposito -- telemetryRedaction.js rejeita
          // qualquer chave contendo "name" como heuristica anti-PII, e
          // errorCode ja e um campo permitido no contrato de EVENT.
          errorCode: normalizeTelemetryErrorCode(playError?.name, 'UNKNOWN_ERROR'),
        });
        const err = providerError(code, playError?.message ?? 'tts_playback_failed');
        onError?.(err);
        reject(err);
      });
    });
  }

  return {
    providerName: 'elevenlabs_tts', isSupported, healthCheck, preparePlayback, speak, play, pause, resume, stop, cancel,
  };
}
