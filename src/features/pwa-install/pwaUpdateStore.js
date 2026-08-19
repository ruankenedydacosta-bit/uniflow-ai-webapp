import { isDifferentBuild, LOADED_BUILD_ID, parseVersionManifest } from './appVersion.js';
import { getPwaDiagnosticSnapshot, BUILD_COHERENCE } from './pwaBuildDiagnostics.js';

// ============================================================================
// PWA UPDATE CONTRACT -- permanente, nunca remover.
//
// O usuário nunca deve precisar saber sobre cache, Service Worker, Safari,
// "limpar histórico", fechar/reabrir manualmente, esperar 20-30s, ou levar
// o app a background para atualizar. Isso é responsabilidade da UniFlow,
// garantida por este módulo, e vale para TODA release futura.
//
// Garantias que este arquivo mantém (cobertas por teste em appUpdate.test.js
// -- se um teste destes quebrar, a garantia quebrou, não só o código):
//
// 1. CHECK IMEDIATO NO STARTUP: start() chama checkForUpdate() de forma
//    síncrona (nunca espera o intervalo periódico). Ver checkForUpdate()
//    dentro de start(), abaixo.
// 2. NÃO BLOQUEIA A ABERTURA: checkForUpdate() é fire-and-forget (void);
//    rede lenta/offline nunca atrasa nem quebra a renderização do app.
// 3. CARD APARECE IMEDIATAMENTE: PwaUpdateCard.jsx usa
//    useSyncExternalStore ligado a este manager -- assim que a 1a
//    checkForUpdate() do startup resolver com updateAvailable=true, o
//    card aparece, sem exigir trocar de aba/minimizar/esperar.
// 4. ATUALIZAR AGORA = 1 AÇÃO: applyUpdate() executa sozinho todo o fluxo
//    registration.update() -> waiting/installing -> skipWaiting ->
//    controllerchange -> reload controlado -> reverifica os 3 build IDs
//    no próximo checkForUpdate() (agora síncrono, ver garantia 1).
// 5. RECOVERY GUARDADO, NUNCA EM LOOP: no máximo 1 recovery automático por
//    build/sessão (AUTO_RECOVERY_GUARD_KEY), disparado só ao sair de
//    foreground -- nunca interrompe o usuário, nunca repete.
// 6. NUNCA DESTRÓI DADOS DO USUÁRIO: recovery só toca em cache de Service
//    Worker comprovadamente obsoleto -- nunca sessão Supabase, IndexedDB,
//    localStorage funcional, credenciais ou preferências.
// 7. AS 3 IDENTIDADES DE BUILD SEMPRE EXISTEM: toda build de Production
//    gera runtimeBuildId (globalThis.__UNIFLOW_BUILD_ID__, via `define`
//    em vite.config.js), serverBuildId (version.json, no-store) e
//    swBuildId (build-id-bridge.js, embutido no Service Worker). Ver
//    pwaBuildDiagnostics.js e os testes de vite.config.js em
//    appUpdate.test.js que executam os plugins de verdade (não só regex).
//
// Agentes futuros: se você está pensando em remover/simplificar algo
// disto porque "parece redundante" ou "código legado", NÃO É -- é a
// causa raiz resolvida de um incidente real (build parcial/misturado no
// iPhone). Audite antes de tocar.
//
// BOOTSTRAP RESILIENTE -- já auditado, não precisa de novo bootstrap
// separado. O SW gerado pelo Workbox registra uma NavigationRoute que
// serve index.html DO PRECACHE em toda navegação enquanto o SW estiver
// ativo (comportamento padrão do modo generateSW para SPA) -- ou seja,
// um reload comum NÃO revalida o HTML contra a rede via cabeçalhos do
// Vercel enquanto o SW controla a página; só o `fetch('/version.json',
// {cache:'no-store'})` acima escapa disso de verdade (reforçado por
// vercel.json, que serve /version.json sempre sem cache). Como esse
// fetch roda dentro do MESMO bundle antigo (main.jsx -> este módulo), um
// bundle velho consegue e sempre conseguiu descobrir um build novo --
// não existe cenário em que o app fique "cego" para updates só por estar
// desatualizado. Por isso nenhum bootstrap mínimo/separado foi criado:
// a garantia 1 acima (check síncrono no startup) já resolve o requisito
// sem arquitetura nova.
// ============================================================================

export const UPDATE_RELOAD_GUARD_KEY = 'uniflow.app-update.reload-guard';
// PWA-UPDATE3: guarda SEPARADA da UPDATE_RELOAD_GUARD_KEY -- aquela evita
// dois reloads dentro de UMA chamada de applyUpdate(); esta decide se vale
// a pena DISPARAR applyUpdate() automaticamente (sem clique) para este
// build. Em localStorage (nao sessionStorage): precisa sobreviver a um
// relaunch completo do PWA no iOS, ja que "por multiplas verificacoes"
// pode abranger o app sendo fechado/reaberto entre uma checagem e outra.
export const AUTO_RECOVERY_GUARD_KEY = 'uniflow.app-update.auto-recovery-guard';
// PWA-UPDATE3: so dispara recovery automatico depois do update aparecer
// disponivel em pelo menos 2 checagens CONSECUTIVAS para o MESMO build --
// nunca na primeira deteccao (podia ser uma corrida com um clique manual
// ja em andamento) e nunca por acaso num unico blip de rede.
const AUTO_RECOVERY_THRESHOLD = 2;
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

// PWA-UPDATE3: mesmo formato/uso da guarda de reload acima, mas em
// localStorage e com sua PRÓPRIA chave -- nunca lida/escrita pelas
// funções de reload guard, e vice-versa (são decisões independentes:
// "já tentei recuperar sozinho este build" vs "já dei o reload desta
// tentativa de applyUpdate").
function readAutoRecoveryGuard(storage) {
  try {
    const raw = storage?.getItem(AUTO_RECOVERY_GUARD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed?.targetBuild === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

function writeAutoRecoveryGuard(storage, targetBuild) {
  try {
    storage?.setItem(AUTO_RECOVERY_GUARD_KEY, JSON.stringify({ targetBuild, attemptedAt: Date.now() }));
  } catch {
    // Sem storage disponivel: o recovery automatico simplesmente nao
    // dispara nesta sessao -- nunca uma excecao propagada.
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
  // PWA-UPDATE3: quantas checagens CONSECUTIVAS seguidas ja viram este
  // MESMO build pendente -- zera assim que o build muda ou fica current.
  // Vive só em memória de propósito: um relaunch completo do iOS conta
  // como nova sessão de verificação, nunca soma com contagens antigas
  // (evita disparar recovery cedo demais só porque o app foi reaberto).
  let pendingBuildStreak = { buildId: null, count: 0 };
  // PWA-UPDATE3: "armado" != "disparado". Depois de ARMAdo_THRESHOLD
  // checagens confirmando o mesmo build pendente, so guardamos a
  // INTENCAO aqui -- o reload de verdade (dentro de applyUpdate) so
  // acontece na PROXIMA vez que a pagina for para background
  // (visibilitychange -> hidden), nunca enquanto o usuario esta olhando
  // para a tela. Uma recuperacao automatica nunca deve interromper uma
  // interacao em andamento.
  let autoRecoveryArmedForBuild = null;

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
          pendingBuildStreak = { buildId: null, count: 0 };
          publish({
            latestBuildId: manifest.buildId,
            latestRelease: manifest,
            updateAvailable: false,
            status: UPDATE_STATUS.CURRENT,
            error: null,
          }, guard ? 'updateCompleted' : 'version_current');
          // PWA-UPDATE3/INVARIANTE: runtime e server ja concordam aqui, mas
          // isso prova so 2 das 3 identidades do incidente. So DEV-log
          // (nunca telemetry, nunca visivel a usuario comum) -- confirma a
          // 3a perna (o Service Worker que REALMENTE controla esta pagina)
          // sem nunca disparar reload/recovery a partir disto sozinho.
          if (isDev) {
            void getPwaDiagnosticSnapshot({ runtimeBuildId: loadedBuildId, serverBuildId: manifest.buildId, runtime })
              .then((snapshot) => {
                devDiagnostic(isDev, 'build_coherence_snapshot', state, snapshot);
                // SW_UNKNOWN e esperado logo apos o load/em navegadores sem
                // SW -- so RUNTIME_STALE/SW_MISMATCHED sao incoerencia real
                // (ver BUILD_COHERENCE em pwaBuildDiagnostics.js).
                const isRealIncoherence = snapshot.coherence === BUILD_COHERENCE.RUNTIME_STALE
                  || snapshot.coherence === BUILD_COHERENCE.SW_MISMATCHED;
                if (isRealIncoherence && typeof console?.warn === 'function') {
                  console.warn('[UniFlow Update] build incoerente (SW diverge do runtime/server):', snapshot);
                }
              });
          }
        } else if (guard?.targetBuild === manifest.buildId) {
          publish({
            latestBuildId: manifest.buildId,
            latestRelease: manifest,
            updateAvailable: true,
            status: UPDATE_STATUS.FAILED,
            error: 'Não foi possível atualizar agora. Tente novamente.',
          }, 'updateFailed', { reason: 'reload_guard' });
          registerPendingBuildCheck(manifest.buildId);
        } else {
          publish({
            latestBuildId: manifest.buildId,
            latestRelease: manifest,
            updateAvailable: true,
            status: UPDATE_STATUS.AVAILABLE,
            error: null,
          }, 'update_available');
          registerPendingBuildCheck(manifest.buildId);
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

  // PWA-UPDATE3: chamado toda vez que uma checagem confirma "ainda no
  // build antigo". So ARMA a recuperação automática (nunca dispara aqui)
  // -- ver autoRecoveryArmedForBuild acima para o porquê.
  function registerPendingBuildCheck(buildId) {
    if (pendingBuildStreak.buildId === buildId) {
      pendingBuildStreak = { buildId, count: pendingBuildStreak.count + 1 };
    } else {
      pendingBuildStreak = { buildId, count: 1 };
    }

    if (pendingBuildStreak.count < AUTO_RECOVERY_THRESHOLD) return;

    const guard = readAutoRecoveryGuard(runtime.localStorage);
    if (guard?.targetBuild === buildId) return; // já tentamos recuperar sozinho este build

    autoRecoveryArmedForBuild = buildId;
  }

  // PWA-UPDATE3: só executa quando a página REALMENTE saiu de foreground
  // -- nunca interrompe o usuário. Reaproveita applyUpdate() (mesma
  // sequência update()->SKIP_WAITING->activation->reload, mesma guarda de
  // reload único) -- nenhuma segunda implementação de ativação.
  async function maybeFireArmedAutoRecovery() {
    if (!autoRecoveryArmedForBuild) return;
    if (updatePromise) return; // um applyUpdate (manual ou automático) já em andamento
    const targetBuild = autoRecoveryArmedForBuild;
    if (state.latestBuildId !== targetBuild || !state.updateAvailable) {
      autoRecoveryArmedForBuild = null;
      return;
    }

    autoRecoveryArmedForBuild = null;
    writeAutoRecoveryGuard(runtime.localStorage, targetBuild);
    devDiagnostic(isDev, 'auto_recovery_triggered', state, { targetBuild });
    await applyUpdate({ auto: true });
  }

  async function applyUpdate({ retry = false, auto = false } = {}) {
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

      publish({ status: UPDATE_STATUS.UPDATING, error: null }, 'updateStarted', { auto });
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
    if (runtime.document?.visibilityState === 'visible') {
      void checkForUpdate();
    } else {
      // PWA-UPDATE3: o único momento em que uma recuperação automática
      // (armada por registerPendingBuildCheck) pode de fato executar o
      // reload -- a página acabou de sair de foreground, então o reload
      // acontece fora da vista do usuário.
      void maybeFireArmedAutoRecovery();
    }
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
    // PWA-UPDATE3: expostos so para diagnostico/teste -- nunca consumidos
    // por UI voltada ao usuario comum.
    getPendingBuildStreak: () => pendingBuildStreak,
    getArmedAutoRecoveryBuild: () => autoRecoveryArmedForBuild,
    // INVARIANTE DE ATUALIZAÇÃO: prova (nunca infere) as 3 identidades de
    // build ao mesmo tempo -- usado pelo teste fisico controlado (console
    // do Safari remoto no iPhone), nunca por uma tela normal.
    getDiagnosticSnapshot: () => getPwaDiagnosticSnapshot({
      runtimeBuildId: state.loadedBuildId,
      serverBuildId: state.latestBuildId,
      runtime,
    }),
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
export { readAutoRecoveryGuard, writeAutoRecoveryGuard };
