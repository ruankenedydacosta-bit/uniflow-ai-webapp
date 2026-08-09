import { createElement, useCallback, useEffect, useMemo, useState } from 'react';
import { UniVoiceInputContext } from './UniVoiceInputContext.js';
import { useUniVoiceInput } from './useUniVoiceInput.js';
import { createVoiceHandlerRegistry } from './voiceHandlerRegistry.js';

export function UniVoiceInputProviderRuntime({
  children,
  profileId,
  workspaceId,
  useVoiceInput = useUniVoiceInput,
  voiceInputOptions = {},
}) {
  const [handlerRegistry] = useState(() => createVoiceHandlerRegistry());

  const voiceInput = useVoiceInput({
    ...voiceInputOptions,
    profileId,
    workspaceId,
    onBeforeStart: () => {
      handlerRegistry.beginCapture();
    },
    onFinalTranscript: (transcript) => {
      handlerRegistry.finishCapture(transcript);
    },
  });

  useEffect(() => {
    handlerRegistry.updateCancelCapture(voiceInput.cancel);
  }, [handlerRegistry, voiceInput.cancel]);

  const registerHandlers = useCallback((handlers = {}) => (
    handlerRegistry.register(handlers)
  ), [handlerRegistry]);

  const value = useMemo(
    () => ({ ...voiceInput, registerHandlers }),
    [registerHandlers, voiceInput],
  );

  return createElement(UniVoiceInputContext.Provider, { value }, children);
}
