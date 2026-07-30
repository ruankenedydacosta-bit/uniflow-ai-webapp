import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, supabaseUrl, supabaseAnonKey, isSupabaseConfigured } from '../../services/supabaseClient.js';
import { sanitizeVoiceOutputText, containsSensitiveVoiceData } from '../uni-voice-output/voiceOutputPolicy.js';
import { createElevenLabsTtsProvider } from './elevenLabsTtsProvider.js';
import { MAX_TTS_TEXT_LENGTH } from './voiceTtsConfig.js';
import { VOICE_TTS_STATUS, VOICE_TTS_ERROR_CODES, getVoiceTtsErrorMessage } from './voiceTtsStatus.js';

function buildError(code) {
  return { code, message: getVoiceTtsErrorMessage(code) };
}

/**
 * ELEVEN1: fundacao reutilizavel de Text-to-Speech (ElevenLabs via
 * uni-voice-tts). Componente -> hook -> provider -> Edge Function ->
 * ElevenLabs -- nenhum componente conhece fetch, chave ou voice ID.
 *
 * Reaproveita a sanitizacao ja existente (sanitizeVoiceOutputText /
 * containsSensitiveVoiceData de uni-voice-output), com o proprio limite de
 * caracteres da fundacao (MAX_TTS_TEXT_LENGTH), sem duplicar a logica de
 * remocao de markdown/dados sensiveis.
 */
export function useUniVoiceTts() {
  const [status, setStatus] = useState(VOICE_TTS_STATUS.IDLE);
  const [error, setError] = useState(null);

  const provider = useMemo(() => createElevenLabsTtsProvider({
    supabase,
    supabaseUrl,
    supabaseAnonKey,
    enabled: isSupabaseConfigured,
    runtime: globalThis,
  }), []);

  // Cleanup ao desmontar: nunca deixa audio tocando nem Blob URL pendurada.
  useEffect(() => () => provider.stop(), [provider]);

  const speak = useCallback(async (text) => {
    if (!provider.isSupported()) {
      const err = buildError(VOICE_TTS_ERROR_CODES.UNAVAILABLE);
      setStatus(VOICE_TTS_STATUS.UNAVAILABLE);
      setError(err);
      return { error: err };
    }

    const sanitized = sanitizeVoiceOutputText(text);
    if (!sanitized) {
      const err = buildError(VOICE_TTS_ERROR_CODES.INVALID_TEXT);
      setStatus(VOICE_TTS_STATUS.ERROR);
      setError(err);
      return { error: err };
    }
    if (sanitized.length > MAX_TTS_TEXT_LENGTH) {
      // BLOCO A1: distinto de INVALID_TEXT -- o texto e valido, so longo
      // demais para narrar. MessageBubble exibe getVoiceTtsErrorMessage
      // deste codigo, que convida a ler na tela em vez de parecer uma
      // falha tecnica generica.
      const err = buildError(VOICE_TTS_ERROR_CODES.TEXT_TOO_LONG);
      setStatus(VOICE_TTS_STATUS.ERROR);
      setError(err);
      return { error: err };
    }
    if (containsSensitiveVoiceData(sanitized)) {
      const err = buildError(VOICE_TTS_ERROR_CODES.INVALID_TEXT);
      setStatus(VOICE_TTS_STATUS.ERROR);
      setError(err);
      return { error: err };
    }

    setStatus(VOICE_TTS_STATUS.LOADING);
    setError(null);

    try {
      await provider.speak(sanitized, {
        onPlaying: () => setStatus(VOICE_TTS_STATUS.PLAYING),
        onEnded: () => setStatus(VOICE_TTS_STATUS.STOPPED),
      });
      return { error: null };
    } catch (providerError) {
      if (providerError?.code === VOICE_TTS_ERROR_CODES.CANCELLED) {
        setStatus(VOICE_TTS_STATUS.STOPPED);
        return { error: null };
      }
      const err = buildError(providerError?.code ?? VOICE_TTS_ERROR_CODES.PROVIDER_ERROR);
      setStatus(VOICE_TTS_STATUS.ERROR);
      setError(err);
      return { error: err };
    }
  }, [provider]);

  const play = useCallback(() => {
    const started = provider.play();
    if (started) setStatus(VOICE_TTS_STATUS.PLAYING);
    return started;
  }, [provider]);

  const pause = useCallback(() => {
    if (status !== VOICE_TTS_STATUS.PLAYING) return;
    provider.pause();
    setStatus(VOICE_TTS_STATUS.PAUSED);
  }, [provider, status]);

  const resume = useCallback(() => {
    if (status !== VOICE_TTS_STATUS.PAUSED) return;
    provider.resume();
    setStatus(VOICE_TTS_STATUS.PLAYING);
  }, [provider, status]);

  const stop = useCallback(() => {
    provider.stop();
    setStatus(VOICE_TTS_STATUS.STOPPED);
  }, [provider]);

  // Cancela apenas uma GERACAO em andamento (status LOADING); nunca
  // interrompe uma reproducao ja iniciada -- para isso existe stop().
  const cancel = useCallback(() => {
    provider.cancel();
  }, [provider]);

  return {
    status,
    error,
    speak,
    play,
    pause,
    resume,
    stop,
    cancel,
    healthCheck: provider.healthCheck,
  };
}
