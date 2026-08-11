const UPDATE_RELOAD_KEY = 'uniflow.pwa.update-reload';

export function initializePwaUpdateLifecycle(runtime = globalThis) {
  const serviceWorker = runtime?.navigator?.serviceWorker;
  if (!serviceWorker?.addEventListener) return () => {};

  const hadController = Boolean(serviceWorker.controller);
  let disposed = false;
  let reloadRequested = false;

  const requestUpdate = () => {
    Promise.resolve(serviceWorker.ready)
      .then((registration) => {
        if (!disposed) return registration?.update?.();
        return undefined;
      })
      .catch(() => {});
  };

  const handleControllerChange = () => {
    if (!hadController || disposed || reloadRequested) return;
    reloadRequested = true;
    try {
      runtime.sessionStorage?.setItem(UPDATE_RELOAD_KEY, 'true');
    } catch {
      // Storage indisponível não pode bloquear a atualização do app.
    }
    runtime.location?.reload?.();
  };

  const handleVisibilityChange = () => {
    if (runtime.document?.visibilityState !== 'hidden') requestUpdate();
  };

  serviceWorker.addEventListener('controllerchange', handleControllerChange);
  runtime.addEventListener?.('pageshow', requestUpdate);
  runtime.addEventListener?.('online', requestUpdate);
  runtime.document?.addEventListener?.('visibilitychange', handleVisibilityChange);
  requestUpdate();

  return () => {
    disposed = true;
    serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    runtime.removeEventListener?.('pageshow', requestUpdate);
    runtime.removeEventListener?.('online', requestUpdate);
    runtime.document?.removeEventListener?.('visibilitychange', handleVisibilityChange);
  };
}

export { UPDATE_RELOAD_KEY };
