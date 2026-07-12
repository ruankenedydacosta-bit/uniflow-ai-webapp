const FUNCTION_NAME = 'generate-uni-premium-voice';
const DEFAULT_TIMEOUT_MS = 15000;

function createProviderError(code, message) {
  return Object.assign(new Error(message), { code });
}

export function createPremiumVoiceProvider({
  supabase,
  supabaseUrl,
  supabaseAnonKey,
  enabled = false,
  fetchImpl = globalThis.fetch,
  runtime = globalThis,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  let activeAudio = null;
  let activeObjectUrl = null;
  let activeController = null;
  let cancelActivePlayback = null;

  function revokeAudioUrl() {
    if (activeObjectUrl) runtime.URL?.revokeObjectURL?.(activeObjectUrl);
    activeObjectUrl = null;
  }

  function stop() {
    activeController?.abort?.('user_stop');
    activeController = null;
    if (activeAudio) {
      activeAudio.pause?.();
      activeAudio.src = '';
    }
    activeAudio = null;
    revokeAudioUrl();
    cancelActivePlayback?.();
    cancelActivePlayback = null;
  }

  function isSupported() {
    return Boolean(
      enabled
      && supabase
      && supabaseUrl
      && supabaseAnonKey
      && fetchImpl
      && runtime?.Audio
      && runtime?.URL?.createObjectURL,
    );
  }

  async function speak(text, options = {}) {
    if (!isSupported()) throw createProviderError('UNSUPPORTED', 'premium_voice_unavailable');

    stop();
    const sessionResult = await supabase.auth.getSession();
    const accessToken = sessionResult.data?.session?.access_token;
    if (!accessToken) throw createProviderError('UNAUTHORIZED', 'premium_voice_auth_required');

    const controller = new AbortController();
    activeController = controller;
    const timeout = runtime.setTimeout?.(() => controller.abort('timeout'), timeoutMs);
    let response;
    try {
      response = await fetchImpl(`${supabaseUrl}/functions/v1/${FUNCTION_NAME}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: supabaseAnonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text, personalityProfile: options.personalityProfile }),
        signal: controller.signal,
      });
    } catch (error) {
      const code = controller.signal.reason === 'user_stop'
        ? 'CANCELED'
        : error?.name === 'AbortError' ? 'TIMEOUT' : 'PROVIDER_ERROR';
      throw createProviderError(code, 'premium_voice_request_failed');
    } finally {
      runtime.clearTimeout?.(timeout);
      if (activeController === controller) activeController = null;
    }

    if (!response.ok) {
      const code = response.status === 401 ? 'UNAUTHORIZED'
        : response.status === 403 ? 'FORBIDDEN'
          : response.status === 429 ? 'QUOTA_REACHED' : 'PROVIDER_ERROR';
      throw createProviderError(code, 'premium_voice_request_rejected');
    }

    const audioBlob = await response.blob();
    activeObjectUrl = runtime.URL.createObjectURL(audioBlob);
    activeAudio = new runtime.Audio(activeObjectUrl);

    return new Promise((resolve, reject) => {
      activeAudio.onplay = () => options.onPlaying?.();
      activeAudio.onended = () => {
        activeAudio = null;
        cancelActivePlayback = null;
        revokeAudioUrl();
        resolve({ providerName: 'elevenlabs_demo' });
      };
      activeAudio.onerror = () => {
        activeAudio = null;
        cancelActivePlayback = null;
        revokeAudioUrl();
        reject(createProviderError('PROVIDER_ERROR', 'premium_voice_playback_failed'));
      };
      activeAudio.play().catch((error) => {
        activeAudio = null;
        cancelActivePlayback = null;
        revokeAudioUrl();
        reject(createProviderError('PROVIDER_ERROR', error?.message ?? 'premium_voice_playback_failed'));
      });
      cancelActivePlayback = () => reject(createProviderError('CANCELED', 'premium_voice_stopped'));
    });
  }

  return { providerName: 'elevenlabs_demo', isSupported, speak, stop };
}
