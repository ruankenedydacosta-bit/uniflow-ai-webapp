import { useCallback, useMemo, useRef } from 'react';
import { useSession } from '../../app/SessionContext.jsx';
import { UniVoiceInputContext } from './UniVoiceInputContext.js';
import { useUniVoiceInput } from './useUniVoiceInput.js';

export function UniVoiceInputProvider({ children }) {
  const { profile, workspace } = useSession();
  const handlersRef = useRef({ token: null });
  const captureOwnerRef = useRef(null);

  const voiceInput = useUniVoiceInput({
    profileId: profile?.uni_personality_profile ?? 'balanced',
    workspaceId: workspace?.id,
    onBeforeStart: () => {
      const owner = handlersRef.current;
      captureOwnerRef.current = owner;
      owner.onBeforeStart?.();
    },
    onFinalTranscript: (transcript) => {
      const owner = captureOwnerRef.current;
      captureOwnerRef.current = null;
      if (owner?.token && handlersRef.current.token === owner.token) {
        owner.onFinalTranscript?.(transcript);
      }
    },
  });
  const cancelVoiceInput = voiceInput.cancel;

  const registerHandlers = useCallback((handlers = {}) => {
    const token = Symbol('uni-voice-input-handlers');
    handlersRef.current = { ...handlers, token };

    return () => {
      if (handlersRef.current.token === token) {
        handlersRef.current = { token: null };
        if (captureOwnerRef.current?.token === token) {
          captureOwnerRef.current = null;
          cancelVoiceInput();
        }
      }
    };
  }, [cancelVoiceInput]);

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
