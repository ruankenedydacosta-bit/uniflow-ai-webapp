import { useEffect, useRef } from 'react';

export function useStableVoiceInputHandlers(registerHandlers, handlers) {
  const handlersRef = useRef(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => registerHandlers({
    onBeforeStart: (...args) => handlersRef.current.onBeforeStart?.(...args),
    onFinalTranscript: (...args) => handlersRef.current.onFinalTranscript?.(...args),
  }), [registerHandlers]);
}
