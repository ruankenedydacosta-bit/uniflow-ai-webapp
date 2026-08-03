import { TTS_FUNCTION_NAME, DEFAULT_TTS_TIMEOUT_MS } from './voiceTtsConfig.js';
import { VOICE_TTS_ERROR_CODES } from './voiceTtsStatus.js';

// ELEVEN1: unico ponto do frontend que sabe da existencia da Edge Function
// uni-voice-tts. Nenhum componente React chama fetch diretamente nem
// conhece a chave/voice ID do provedor -- tudo isso vive so no servidor.
//
// Retry: no maximo uma tentativa extra, e SOMENTE em falha pura de rede
// (o fetch nem chegou a obter uma resposta HTTP) -- mesmo criterio ja
// usado por uniLlmProvider.js (OPENAI1). Nunca em TIMEOUT, nunca em erro
// HTTP (401/403/422/429/5xx), nunca em cancelamento.
const MAX_NETWORK_RETRIES = 1;

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
    }
    audio = null;
    if (objectUrl) runtime.URL?.revokeObjectURL?.(objectUrl);
    objectUrl = null;
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
      return { ok: true, response };
    } catch {
      const reason = requestController.signal.reason;
      const code = reason === 'timeout'
        ? VOICE_TTS_ERROR_CODES.PROVIDER_TIMEOUT
        : reason === 'cancelled'
          ? VOICE_TTS_ERROR_CODES.CANCELLED
          : VOICE_TTS_ERROR_CODES.NETWORK_ERROR;
      return { ok: false, code };
    } finally {
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
    audio = new runtime.Audio(objectUrl);

    return new Promise((resolve, reject) => {
      activeSettle = { resolve, reject };
      audio.onplay = () => onPlaying?.();
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
      audio.play().catch((playError) => {
        activeSettle = null;
        releaseAudio();
        const code = playError?.name === 'NotAllowedError'
          ? VOICE_TTS_ERROR_CODES.AUTOPLAY_BLOCKED
          : VOICE_TTS_ERROR_CODES.AUDIO_PLAYBACK_ERROR;
        const err = providerError(code, playError?.message ?? 'tts_playback_failed');
        onError?.(err);
        reject(err);
      });
    });
  }

  return {
    providerName: 'elevenlabs_tts', isSupported, healthCheck, speak, play, pause, resume, stop, cancel,
  };
}
