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

function waitForWorkerActivation({
  serviceWorker,
  registration,
  worker,
  previousController,
  previousActive,
  timeoutMs,
  runtime,
}) {
  const isReady = () => (
    (serviceWorker?.controller && serviceWorker.controller !== previousController)
    || (registration?.active && registration.active !== previousActive)
    || worker?.state === 'activated'
  );
  if (isReady()) return Promise.resolve(true);
  if (!serviceWorker?.addEventListener && !worker?.addEventListener) return Promise.resolve(false);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (changed) => {
      if (settled) return;
      settled = true;
      runtime.clearTimeout?.(timeoutId);
      serviceWorker.removeEventListener?.('controllerchange', onChange);
      worker?.removeEventListener?.('statechange', onChange);
      resolve(changed);
    };
    const onChange = () => {
      if (isReady()) finish(true);
      else if (worker?.state === 'redundant') finish(false);
    };
    const timeoutId = runtime.setTimeout?.(() => finish(false), timeoutMs);
    serviceWorker?.addEventListener?.('controllerchange', onChange, { once: true });
    worker?.addEventListener?.('statechange', onChange);
    onChange();
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

function waitForInstallingWorker(registration, timeoutMs, runtime) {
  if (registration?.waiting) return Promise.resolve({ kind: 'waiting', worker: registration.waiting });
  const installing = registration?.installing;
  if (!installing?.addEventListener) {
    return Promise.resolve(registration?.active
      ? { kind: 'active', worker: registration.active }
      : { kind: 'missing', worker: null });
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      runtime.clearTimeout?.(timeoutId);
      installing.removeEventListener?.('statechange', onStateChange);
      resolve(result);
    };
    const onStateChange = () => {
      if (registration.waiting) finish({ kind: 'waiting', worker: registration.waiting });
      else if (installing.state === 'activated' || registration.active === installing) {
        finish({ kind: 'active', worker: registration.active ?? installing });
      } else if (installing.state === 'redundant') {
        finish(registration.active
          ? { kind: 'active', worker: registration.active }
          : { kind: 'missing', worker: null });
      }
    };
    const timeoutId = runtime.setTimeout?.(() => finish({ kind: 'timeout', worker: null }), timeoutMs);
    installing.addEventListener('statechange', onStateChange);
    onStateChange();
  });
}

// PWA-UPDATE2: nenhum dos eventos discretos (pageshow/focus/online/
// visibilitychange) dispara enquanto o app permanece continuamente aberto e
// em foreground -- uma sessão longa (comum num app financeiro usado o dia
// todo) nunca revalida /version.json sozinha, mesmo com uma Production nova
// publicada no meio do dia. Este intervalo fecha essa lacuna sem polling
// agressivo -- só quando visível, reaproveitando checkForUpdate (mesma
// trava de requisição em andamento via checkPromise, nunca duas em paralelo).
const DEFAULT_PERIODIC_CHECK_INTERVAL_MS = 30 * 60_000;

export function createPwaUpdateManager({
  runtime = globalThis,
  loadedBuildId = LOADED_BUILD_ID,
  fetchImpl = runtime.fetch?.bind(runtime),
  isDev = false,
  activationTimeoutMs = 8_000,
  periodicCheckIntervalMs = DEFAULT_PERIODIC_CHECK_INTERVAL_MS,
} = {}) {
  let state = Object.freeze({ ...INITIAL_STATE, loadedBuildId });
  let started = false;
  let checkPromise = null;
  let updatePromise = null;
  let periodicIntervalId = null;
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
          const registration = await withTimeout(
            serviceWorker.ready,
            activationTimeoutMs,
            runtime,
            'SERVICE_WORKER_READY_TIMEOUT',
          );
          const previousController = serviceWorker.controller ?? null;
          const previousActive = registration?.active ?? null;
          publish({ serviceWorkerState: registration?.waiting ? 'waiting' : 'checking' }, 'service_worker_update');
          await withTimeout(
            registration?.update?.(),
            activationTimeoutMs,
            runtime,
            'SERVICE_WORKER_UPDATE_TIMEOUT',
          );
          const workerResult = registration?.waiting
            ? { kind: 'waiting', worker: registration.waiting }
            : await waitForInstallingWorker(registration, activationTimeoutMs, runtime);

          if (workerResult.kind === 'waiting') {
            const activated = waitForWorkerActivation({
              serviceWorker,
              registration,
              worker: workerResult.worker,
              previousController,
              previousActive,
              timeoutMs: activationTimeoutMs,
              runtime,
            });
            workerResult.worker.postMessage?.({ type: 'SKIP_WAITING' });
            if (!await activated) throw new Error('SERVICE_WORKER_ACTIVATION_TIMEOUT');
          } else if (workerResult.kind !== 'active') {
            throw new Error(workerResult.kind === 'timeout'
              ? 'SERVICE_WORKER_INSTALL_TIMEOUT'
              : 'SERVICE_WORKER_UPDATE_NOT_READY');
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
  const handlePeriodicCheck = () => {
    if (runtime.document?.visibilityState === 'visible') void checkForUpdate();
  };

  function start() {
    if (started) return () => stop();
    started = true;
    runtime.addEventListener?.('pageshow', handleForeground);
    runtime.addEventListener?.('focus', handleForeground);
    runtime.addEventListener?.('online', handleForeground);
    runtime.document?.addEventListener?.('visibilitychange', handleVisibilityChange);
    if (periodicCheckIntervalMs > 0 && typeof runtime.setInterval === 'function') {
      periodicIntervalId = runtime.setInterval(handlePeriodicCheck, periodicCheckIntervalMs);
    }
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
    if (periodicIntervalId !== null) {
      runtime.clearInterval?.(periodicIntervalId);
      periodicIntervalId = null;
    }
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
