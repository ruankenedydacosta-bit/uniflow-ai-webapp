import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { supabase, supabaseAnonKey, supabaseUrl } from '../../services/supabaseClient.js';
import { createVoiceOutputProviders } from './voiceOutputProvider.js';
import {
  createPremiumSessionGuard,
  prepareVoiceOutputText,
  resolveVoiceOutputMode,
  resolveVoicePreset,
  VOICE_OUTPUT_MODES,
} from './voiceOutputPolicy.js';
import {
  INITIAL_VOICE_OUTPUT_STATE,
  voiceOutputReducer,
  VOICE_OUTPUT_STATES,
} from './voiceOutputReducer.js';
import { getVoiceOutputMessage } from './voiceOutputMessages.js';

function statusFromError(error) {
  if (error?.code === 'UNAUTHORIZED' || error?.code === 'FORBIDDEN') {
    return VOICE_OUTPUT_STATES.UNAUTHORIZED;
  }
  if (error?.code === 'QUOTA_REACHED') return VOICE_OUTPUT_STATES.QUOTA_REACHED;
  if (error?.code === 'UNSUPPORTED') return VOICE_OUTPUT_STATES.UNSUPPORTED;
  return VOICE_OUTPUT_STATES.PROVIDER_ERROR;
}

export function useUniVoiceOutput({ personalityProfileId = 'balanced' } = {}) {
  const [mode, setModeState] = useState(VOICE_OUTPUT_MODES.OFF);
  const [state, dispatch] = useReducer(voiceOutputReducer, INITIAL_VOICE_OUTPUT_STATE);
  const guardRef = useRef(createPremiumSessionGuard());
  const providers = useMemo(() => createVoiceOutputProviders({
    supabase,
    supabaseUrl,
    supabaseAnonKey,
    enabled: import.meta.env.VITE_UNI_PREMIUM_VOICE_DEMO_ENABLED === 'true',
    runtime: globalThis,
  }), []);

  const stop = useCallback(() => {
    providers.browser.stop();
    providers.elevenlabs_demo.stop();
    guardRef.current.finish();
    dispatch({ type: 'STOP' });
  }, [providers]);

  useEffect(() => () => {
    providers.browser.stop();
    providers.elevenlabs_demo.stop();
    guardRef.current.finish();
  }, [providers]);

  const setMode = useCallback((nextMode) => {
    const safeMode = resolveVoiceOutputMode(nextMode);
    if (safeMode === VOICE_OUTPUT_MODES.OFF) stop();
    setModeState(safeMode);
  }, [stop]);

  const speakBrowser = useCallback(async (text, { fallback = false } = {}) => {
    const prepared = prepareVoiceOutputText(text);
    if (prepared.error) {
      dispatch({ type: 'FAIL', status: VOICE_OUTPUT_STATES.PROVIDER_ERROR, error: prepared.error });
      return { data: null, error: prepared.error };
    }
    if (!providers.browser.isSupported()) {
      const error = { code: 'UNSUPPORTED', message: 'A voz padrão não está disponível neste navegador.' };
      dispatch({ type: 'FAIL', status: VOICE_OUTPUT_STATES.UNSUPPORTED, error });
      return { data: null, error };
    }

    dispatch({
      type: fallback ? 'FAIL' : 'PREPARE',
      status: VOICE_OUTPUT_STATES.FALLBACK_ACTIVE,
      providerName: providers.browser.providerName,
    });
    if (fallback) {
      dispatch({ type: 'FAIL', status: VOICE_OUTPUT_STATES.FALLBACK_ACTIVE, error: null });
    }

    try {
      const data = await providers.browser.speak(prepared.data, {
        preset: resolveVoicePreset(personalityProfileId),
        onPlaying: () => dispatch({ type: 'PLAY', providerName: providers.browser.providerName }),
      });
      dispatch({ type: 'RESET' });
      return { data, error: null };
    } catch (providerError) {
      if (providerError?.code === 'CANCELED') {
        dispatch({ type: 'STOP' });
        return { data: { stopped: true }, error: null };
      }
      const error = { code: 'BROWSER_VOICE_FAILED', message: 'Não consegui reproduzir a voz padrão agora.' };
      dispatch({ type: 'FAIL', status: VOICE_OUTPUT_STATES.PROVIDER_ERROR, error });
      return { data: null, error };
    }
  }, [personalityProfileId, providers]);

  const speakPremium = useCallback(async (text, { fallbackText = text } = {}) => {
    const prepared = prepareVoiceOutputText(text, { premium: true });
    if (prepared.error) {
      dispatch({ type: 'FAIL', status: VOICE_OUTPUT_STATES.PROVIDER_ERROR, error: prepared.error });
      return { data: null, error: prepared.error };
    }
    if (!providers.elevenlabs_demo.isSupported()) {
      const error = { code: 'UNSUPPORTED', message: 'A voz premium não está configurada neste ambiente.' };
      dispatch({ type: 'FAIL', status: VOICE_OUTPUT_STATES.UNSUPPORTED, error });
      return { data: null, error };
    }

    const guard = guardRef.current.begin();
    if (!guard.allowed) {
      const status = guard.reason === 'QUOTA_REACHED'
        ? VOICE_OUTPUT_STATES.QUOTA_REACHED
        : VOICE_OUTPUT_STATES.GENERATING;
      const error = {
        code: guard.reason,
        message: guard.reason === 'QUOTA_REACHED'
          ? getVoiceOutputMessage(VOICE_OUTPUT_STATES.QUOTA_REACHED)
          : 'Uma geração de voz premium já está em andamento.',
      };
      dispatch({ type: 'FAIL', status, error });
      return { data: null, error };
    }

    dispatch({
      type: 'GENERATE',
      providerName: providers.elevenlabs_demo.providerName,
      sessionGenerations: guard.count,
    });

    try {
      const data = await providers.elevenlabs_demo.speak(prepared.data, {
        personalityProfile: personalityProfileId,
        preset: resolveVoicePreset(personalityProfileId),
        onPlaying: () => dispatch({ type: 'PLAY', providerName: providers.elevenlabs_demo.providerName }),
      });
      dispatch({ type: 'RESET' });
      return { data, error: null };
    } catch (providerError) {
      if (providerError?.code === 'CANCELED') {
        dispatch({ type: 'STOP' });
        return { data: { stopped: true }, error: null };
      }
      const status = statusFromError(providerError);
      const error = { code: providerError?.code ?? 'PROVIDER_ERROR', message: getVoiceOutputMessage(status) };
      dispatch({ type: 'FAIL', status, error });

      if (status === VOICE_OUTPUT_STATES.PROVIDER_ERROR) {
        const fallback = await speakBrowser(fallbackText, { fallback: true });
        return { ...fallback, fallbackActive: !fallback.error };
      }
      return { data: null, error };
    } finally {
      guardRef.current.finish();
    }
  }, [personalityProfileId, providers, speakBrowser]);

  return {
    mode,
    state,
    message: getVoiceOutputMessage(state.status, state.error?.message),
    isPlaying: state.status === VOICE_OUTPUT_STATES.PLAYING,
    isBusy: [VOICE_OUTPUT_STATES.PREPARING, VOICE_OUTPUT_STATES.GENERATING].includes(state.status),
    premiumSupported: providers.elevenlabs_demo.isSupported(),
    setMode,
    speakBrowser,
    speakPremium,
    stop,
  };
}
