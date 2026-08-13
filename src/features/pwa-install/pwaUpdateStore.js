import { isDifferentBuild, LOADED_BUILD_ID, parseVersionManifest } from './appVersion.js';

export const UPDATE_RELOAD_GUARD_KEY = 'uniflow.app-update.reload-guard';
export const UPDATE_STATUS = Object.freeze({
  IDLE: 'idle',
  CHECKING: 'checking',
  CURRENT: 'current',
  AVAILABLE: 'available',
  UPDATING: 'updating',
  FAILED: 'failed',
});

const INITIAL_STATE = Object.freeze({
  loadedBuildId: LOADED_BUILD_ID,
  latestBuildId: null,
  latestRelease: null,
  updateAvailable: false,
  serviceWorkerState: 'unknown',
  status: UPDATE_STATUS.IDLE,
  error: null,
});

function devDiagnostic(enabled, event, state, extra = {}) {
  if (!enabled || typeof console?.debug !== 'function') return;
  console.debug('[UniFlow Update]', {
    event,
    loadedBuildId: state.loadedBuildId,
    latestBuildId: state.latestBuildId,
    updateAvailable: state.updateAvailable,
    serviceWorkerState: state.serviceWorkerState,
    ...extra,
  });
}

function readReloadGuard(storage) {
  try {
    const raw = storage?.getItem(UPDATE_RELOAD_GUARD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.targetBuild !== 'string' || parsed.reloadAttempted !== true) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeReloadGuard(storage, targetBuild) {
  try {
    const guard = JSON.stringify({ targetBuild, reloadAttempted: true, attemptedAt: Date.now() });
    storage?.setItem(UPDATE_RELOAD_GUARD_KEY, guard);
    return storage?.getItem(UPDATE_RELOAD_GUARD_KEY) === guard;
  } catch {
    return false;
  }
}

function clearReloadGuard(storage) {
  try {
    storage?.removeItem(UPDATE_RELOAD_GUARD_KEY);
  } catch {
    // A guarda expira com a sessão; falha de limpeza não afeta dados do usuário.
  }
}

function waitForControllerChange(serviceWorker, timeoutMs, runtime) {
  if (!serviceWorker?.addEventListener) return Promise.resolve(false);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (changed) => {
      if (settled) return;
      settled = true;
      runtime.clearTimeout?.(timeoutId);
      serviceWorker.removeEventListener?.('controllerchange', onChange);
      resolve(changed);
    };
    const onChange = () => finish(true);
    const timeoutId = runtime.setTimeout?.(() => finish(false), timeoutMs);
    serviceWorker.addEventListener('controllerchange', onChange, { once: true });
  });
}

function withTimeout(promise, timeoutMs, runtime, errorCode) {
  return new Promise((resolve, reject) => {
    const timeoutId = runtime.setTimeout?.(() => reject(new Error(errorCode)), timeoutMs);
    Promise.resolve(promise).then(
      (value) => {
        runtime.clearTimeout?.(timeoutId);
        resolve(value);
      },
      (error) => {
        runtime.clearTimeout?.(timeoutId);
        reject(error);
      },
    );
  });
}

function waitForWaitingWorker(registration, timeoutMs, runtime) {
  if (registration?.waiting) return Promise.resolve(registration.waiting);
  const installing = registration?.installing;
  if (!installing?.addEventListener) return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (worker) => {
      if (settled) return;
      settled = true;
      runtime.clearTimeout?.(timeoutId);
      installing.removeEventListener?.('statechange', onStateChange);
      resolve(worker);
    };
    const onStateChange = () => {
      if (registration.waiting) finish(registration.waiting);
      else if (installing.state === 'installed') finish(installing);
      else if (installing.state === 'redundant') finish(null);
    };
    const timeoutId = runtime.setTimeout?.(() => finish(registration.waiting ?? null), timeoutMs);
    installing.addEventListener('statechange', onStateChange);
  });
}

export function createPwaUpdateManager({
  runtime = globalThis,
  loadedBuildId = LOADED_BUILD_ID,
  fetchImpl = runtime.fetch?.bind(runtime),
  isDev = false,
  activationTimeoutMs = 8_000,
} = {}) {
  let state = Object.freeze({ ...INITIAL_STATE, loadedBuildId });
  let started = false;
  let checkPromise = null;
  let updatePromise = null;
  const subscribers = new Set();

  const publish = (patch, event, extra) => {
    state = Object.freeze({ ...state, ...patch });
    devDiagnostic(isDev, event, state, extra);
    subscribers.forEach((subscriber) => subscriber());
  };

  const subscribe = (subscriber) => {
    subscribers.add(subscriber);
    return () => subscribers.delete(subscriber);
  };

  async function checkForUpdate() {
    if (checkPromise) return checkPromise;
    if (typeof fetchImpl !== 'function' || loadedBuildId === 'development') return state;

    checkPromise = (async () => {
      publish({ status: state.updateAvailable ? UPDATE_STATUS.AVAILABLE : UPDATE_STATUS.CHECKING }, 'version_check_started');
      try {
        const response = await fetchImpl(`/version.json?updateCheck=${Date.now()}`, {
          cache: 'no-store',
          headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
        });
        if (!response?.ok) throw new Error(`VERSION_HTTP_${response?.status ?? 'ERROR'}`);
        const manifest = parseVersionManifest(await response.json());
        const updateAvailable = isDifferentBuild(loadedBuildId, manifest.buildId);
        const guard = readReloadGuard(runtime.sessionStorage);

        if (!updateAvailable) {
          clearReloadGuard(runtime.sessionStorage);
          publish({
            latestBuildId: manifest.buildId,
            latestRelease: manifest,
            updateAvailable: false,
            status: UPDATE_STATUS.CURRENT,
            error: null,
          }, guard ? 'updateCompleted' : 'version_current');
        } else if (guard?.targetBuild === manifest.buildId) {
          publish({
            latestBuildId: manifest.buildId,
            latestRelease: manifest,
            updateAvailable: true,
            status: UPDATE_STATUS.FAILED,
            error: 'Não foi possível atualizar agora. Tente novamente.',
          }, 'updateFailed', { reason: 'reload_guard' });
        } else {
          publish({
            latestBuildId: manifest.buildId,
            latestRelease: manifest,
            updateAvailable: true,
            status: UPDATE_STATUS.AVAILABLE,
            error: null,
          }, 'update_available');
        }
      } catch (error) {
        publish({
          status: state.updateAvailable ? UPDATE_STATUS.AVAILABLE : UPDATE_STATUS.IDLE,
          error: state.updateAvailable ? state.error : null,
        }, 'updateFailed', { reason: error?.message ?? 'version_check_failed' });
      } finally {
        checkPromise = null;
      }
      return state;
    })();
    return checkPromise;
  }

  async function applyUpdate({ retry = false } = {}) {
    if (updatePromise) return updatePromise;
    const targetBuild = state.latestBuildId;
    if (!state.updateAvailable || !targetBuild) return Object.freeze({ outcome: 'unavailable' });

    updatePromise = (async () => {
      if (retry) clearReloadGuard(runtime.sessionStorage);
      const existingGuard = readReloadGuard(runtime.sessionStorage);
      if (existingGuard?.targetBuild === targetBuild) {
        publish({ status: UPDATE_STATUS.FAILED, error: 'Não foi possível atualizar agora. Tente novamente.' }, 'updateFailed', { reason: 'reload_guard' });
        return Object.freeze({ outcome: 'guarded' });
      }
      if (!writeReloadGuard(runtime.sessionStorage, targetBuild)) {
        publish({ status: UPDATE_STATUS.FAILED, error: 'Não foi possível atualizar agora. Tente novamente.' }, 'updateFailed', { reason: 'storage_unavailable' });
        return Object.freeze({ outcome: 'storage-error' });
      }

      publish({ status: UPDATE_STATUS.UPDATING, error: null }, 'updateStarted');
      try {
        const serviceWorker = runtime.navigator?.serviceWorker;
        if (serviceWorker) {
          const hadController = Boolean(serviceWorker.controller);
          const registration = await withTimeout(
            serviceWorker.ready,
            activationTimeoutMs,
            runtime,
            'SERVICE_WORKER_READY_TIMEOUT',
          );
          publish({ serviceWorkerState: registration?.waiting ? 'waiting' : 'checking' }, 'service_worker_update');
          await withTimeout(
            registration?.update?.(),
            activationTimeoutMs,
            runtime,
            'SERVICE_WORKER_UPDATE_TIMEOUT',
          );
          const waiting = registration?.waiting
            ?? await waitForWaitingWorker(registration, activationTimeoutMs, runtime);
          if (!waiting) throw new Error('SERVICE_WORKER_UPDATE_NOT_READY');

          if (hadController) {
            const controllerChanged = waitForControllerChange(
              serviceWorker,
              activationTimeoutMs,
              runtime,
            );
            waiting.postMessage?.({ type: 'SKIP_WAITING' });
            const changed = await controllerChanged;
            if (!changed) throw new Error('SERVICE_WORKER_ACTIVATION_TIMEOUT');
          } else {
            waiting.postMessage?.({ type: 'SKIP_WAITING' });
          }
          publish({ serviceWorkerState: 'controlling' }, 'service_worker_controlling');
        } else {
          publish({ serviceWorkerState: 'unsupported' }, 'service_worker_unavailable');
        }

        runtime.location?.reload?.();
        return Object.freeze({ outcome: 'reloading', targetBuild });
      } catch (error) {
        clearReloadGuard(runtime.sessionStorage);
        publish({
          status: UPDATE_STATUS.FAILED,
          error: 'Não foi possível atualizar agora. Tente novamente.',
        }, 'updateFailed', { reason: error?.message ?? 'update_failed' });
        return Object.freeze({ outcome: 'error' });
      } finally {
        updatePromise = null;
      }
    })();
    return updatePromise;
  }

  const handleVisibilityChange = () => {
    if (runtime.document?.visibilityState === 'visible') void checkForUpdate();
  };
  const handleForeground = () => void checkForUpdate();

  function start() {
    if (started) return () => stop();
    started = true;
    runtime.addEventListener?.('pageshow', handleForeground);
    runtime.addEventListener?.('focus', handleForeground);
    runtime.addEventListener?.('online', handleForeground);
    runtime.document?.addEventListener?.('visibilitychange', handleVisibilityChange);
    void checkForUpdate();
    return () => stop();
  }

  function stop() {
    if (!started) return;
    started = false;
    runtime.removeEventListener?.('pageshow', handleForeground);
    runtime.removeEventListener?.('focus', handleForeground);
    runtime.removeEventListener?.('online', handleForeground);
    runtime.document?.removeEventListener?.('visibilitychange', handleVisibilityChange);
  }

  return Object.freeze({
    getSnapshot: () => state,
    subscribe,
    checkForUpdate,
    applyUpdate,
    start,
    stop,
  });
}

let defaultManager = null;

export function getPwaUpdateManager() {
  if (!defaultManager) {
    defaultManager = createPwaUpdateManager({
      runtime: globalThis,
      isDev: (import.meta.env ?? {}).DEV === true,
    });
  }
  return defaultManager;
}

export function resetPwaUpdateManagerForTests() {
  defaultManager?.stop();
  defaultManager = null;
}

export { clearReloadGuard, readReloadGuard, writeReloadGuard };
