export function createVoiceHandlerRegistry(initialCancelCapture = () => {}) {
  let currentRegistration = null;
  let captureOwnerToken = null;
  let cancelCapture = initialCancelCapture;

  return Object.freeze({
    updateCancelCapture(nextCancelCapture) {
      cancelCapture = typeof nextCancelCapture === 'function' ? nextCancelCapture : () => {};
    },
    register(handlers = {}) {
      const token = Symbol('uni-voice-input-handlers');
      currentRegistration = { token, handlers };

      return () => {
        if (currentRegistration?.token !== token) return;
        currentRegistration = null;
        if (captureOwnerToken === token) {
          captureOwnerToken = null;
          cancelCapture();
        }
      };
    },
    updateHandlers(handlers = {}) {
      if (currentRegistration) currentRegistration.handlers = handlers;
    },
    beginCapture() {
      captureOwnerToken = currentRegistration?.token ?? null;
      currentRegistration?.handlers.onBeforeStart?.();
    },
    finishCapture(transcript) {
      const ownerToken = captureOwnerToken;
      captureOwnerToken = null;
      if (ownerToken && currentRegistration?.token === ownerToken) {
        currentRegistration.handlers.onFinalTranscript?.(transcript);
      }
    },
    hasCaptureOwner() {
      return captureOwnerToken !== null;
    },
  });
}
