import { useCallback, useMemo, useRef } from 'react';
import { useSession } from '../../app/SessionContext.jsx';
import { UniVoiceInputContext } from './UniVoiceInputContext.js';
import { useUniVoiceInput } from './useUniVoiceInput.js';

export function UniVoiceInputProvider({ children }) {
  const { profile, workspace } = useSession();
  const handlersRef = useRef({ token: null });

  const voiceInput = useUniVoiceInput({
    profileId: profile?.uni_personality_profile ?? 'balanced',
    workspaceId: workspace?.id,
    onBeforeStart: () => handlersRef.current.onBeforeStart?.(),
    onFinalTranscript: (transcript) => handlersRef.current.onFinalTranscript?.(transcript),
  });

  const registerHandlers = useCallback((handlers = {}) => {
    const token = Symbol('uni-voice-input-handlers');
    handlersRef.current = { ...handlers, token };

    return () => {
      if (handlersRef.current.token === token) {
        handlersRef.current = { token: null };
      }
    };
  }, []);

  const value = useMemo(
    () => ({ ...voiceInput, registerHandlers }),
    [registerHandlers, voiceInput],
  );

  return (
    <UniVoiceInputContext.Provider value={value}>
      {children}
    </UniVoiceInputContext.Provider>
  );
}
