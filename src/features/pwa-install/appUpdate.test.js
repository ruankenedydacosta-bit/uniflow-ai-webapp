import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { isDifferentBuild, parseVersionManifest } from './appVersion.js';
import {
  createPwaUpdateManager,
  UPDATE_RELOAD_GUARD_KEY,
  UPDATE_STATUS,
} from './pwaUpdateStore.js';
import { BUILD_COHERENCE } from './pwaBuildDiagnostics.js';
import { exposePwaDiagnosticConsoleHelper } from './pwaUpdateLifecycle.js';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    values,
  };
}

function createRuntime({ serviceWorker, storage = createStorage(), localStorage = createStorage() } = {}) {
  const runtime = new EventTarget();
  runtime.document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  runtime.navigator = serviceWorker ? { serviceWorker } : {};
  runtime.sessionStorage = storage;
  runtime.localStorage = localStorage;
  runtime.setTimeout = setTimeout;
  runtime.clearTimeout = clearTimeout;
  runtime.setInterval = setInterval;
  runtime.clearInterval = clearInterval;
  runtime.reloadCalls = 0;
  runtime.location = { reload: () => { runtime.reloadCalls += 1; } };
  return runtime;
}

function manifestResponse(buildId = 'build-b') {
  return {
    ok: true,
    status: 200,
    json: async () => ({ buildId, releasedAt: '2026-08-13T00:00:00.000Z' }),
  };
}

test('comparação aceita apenas IDs válidos e manifesto prepara changelog futuro', () => {
  assert.equal(isDifferentBuild('build-a', 'build-a'), false);
  assert.equal(isDifferentBuild('build-a', 'build-b'), true);
  assert.equal(isDifferentBuild('', 'build-b'), false);
  assert.deepEqual(parseVersionManifest({ buildId: ' build-b ', novidades: ['Novo card', 1] }), {
    buildId: 'build-b',
    releasedAt: null,
    title: null,
    description: null,
    novidades: ['Novo card'],
  });
  assert.throws(() => parseVersionManifest({}), /VERSION_MANIFEST_INVALID/);
});

test('build carregado igual à Production não mostra atualização', async () => {
  const runtime = createRuntime();
  const manager = createPwaUpdateManager({
    runtime,
    loadedBuildId: 'build-a',
    fetchImpl: async () => manifestResponse('build-a'),
  });
  await manager.checkForUpdate();
  assert.equal(manager.getSnapshot().status, UPDATE_STATUS.CURRENT);
  assert.equal(manager.getSnapshot().updateAvailable, false);
  assert.equal(runtime.reloadCalls, 0);
});

test('cliente A com Production B detecta atualização e usa fetch sem cache', async () => {
  const runtime = createRuntime();
  let request = null;
  const manager = createPwaUpdateManager({
    runtime,
    loadedBuildId: 'build-a',
    fetchImpl: async (...args) => { request = args; return manifestResponse('build-b'); },
  });
  await manager.checkForUpdate();
  assert.equal(manager.getSnapshot().status, UPDATE_STATUS.AVAILABLE);
  assert.equal(manager.getSnapshot().updateAvailable, true);
  assert.match(request[0], /^\/version\.json\?updateCheck=/);
  assert.equal(request[1].cache, 'no-store');
});

test('navegador sem Service Worker recarrega uma vez e duplo clique compartilha a operação', async () => {
  const runtime = createRuntime();
  const manager = createPwaUpdateManager({
    runtime,
    loadedBuildId: 'build-a',
    fetchImpl: async () => manifestResponse('build-b'),
  });
  await manager.checkForUpdate();
  const first = manager.applyUpdate();
  const second = manager.applyUpdate();
  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.equal(firstResult.outcome, 'reloading');
  assert.equal(secondResult.outcome, 'reloading');
  assert.equal(runtime.reloadCalls, 1);
  assert.equal(JSON.parse(runtime.sessionStorage.getItem(UPDATE_RELOAD_GUARD_KEY)).targetBuild, 'build-b');
});

test('Service Worker waiting recebe SKIP_WAITING e só então ocorre o reload', async () => {
  const serviceWorker = new EventTarget();
  const oldController = {};
  serviceWorker.controller = oldController;
  let updateCalls = 0;
  let messages = 0;
  const waiting = Object.assign(new EventTarget(), {
    state: 'installed',
    postMessage: (message) => {
      assert.deepEqual(message, { type: 'SKIP_WAITING' });
      messages += 1;
      queueMicrotask(() => {
        waiting.state = 'activated';
        serviceWorker.controller = {};
        waiting.dispatchEvent(new Event('statechange'));
        serviceWorker.dispatchEvent(new Event('controllerchange'));
      });
    },
  });
  serviceWorker.ready = Promise.resolve({ waiting, active: oldController, update: async () => { updateCalls += 1; } });
  const runtime = createRuntime({ serviceWorker });
  const manager = createPwaUpdateManager({
    runtime,
    loadedBuildId: 'build-a',
    fetchImpl: async () => manifestResponse('build-b'),
    activationTimeoutMs: 100,
  });
  await manager.checkForUpdate();
  const result = await manager.applyUpdate();
  assert.equal(result.outcome, 'reloading');
  assert.equal(updateCalls, 1);
  assert.equal(messages, 1);
  assert.equal(runtime.reloadCalls, 1);
  assert.equal(manager.getSnapshot().serviceWorkerState, 'controlling');
});

test('Service Worker já active/controller sem waiting é válido e recarrega uma vez', async () => {
  const serviceWorker = new EventTarget();
  const active = { state: 'activated' };
  serviceWorker.controller = active;
  serviceWorker.ready = Promise.resolve({ waiting: null, installing: null, active, update: async () => {} });
  const runtime = createRuntime({ serviceWorker });
  const manager = createPwaUpdateManager({
    runtime,
    loadedBuildId: 'build-a',
    fetchImpl: async () => manifestResponse('build-b'),
    activationTimeoutMs: 100,
  });
  await manager.checkForUpdate();
  const result = await manager.applyUpdate();
  assert.equal(result.outcome, 'reloading');
  assert.equal(runtime.reloadCalls, 1);
  assert.equal(manager.getSnapshot().serviceWorkerState, 'controlling');
});

test('worker installing pode virar waiting, ativar e recarregar com segurança', async () => {
  const serviceWorker = new EventTarget();
  const oldController = {};
  serviceWorker.controller = oldController;
  const installing = Object.assign(new EventTarget(), { state: 'installing' });
  const registration = {
    active: oldController,
    installing,
    waiting: null,
    update: async () => {
      setTimeout(() => {
        installing.state = 'installed';
        registration.waiting = installing;
        installing.postMessage = () => queueMicrotask(() => {
          installing.state = 'activated';
          registration.active = installing;
          serviceWorker.controller = installing;
          installing.dispatchEvent(new Event('statechange'));
          serviceWorker.dispatchEvent(new Event('controllerchange'));
        });
        installing.dispatchEvent(new Event('statechange'));
      }, 0);
    },
  };
  serviceWorker.ready = Promise.resolve(registration);
  const runtime = createRuntime({ serviceWorker });
  const manager = createPwaUpdateManager({
    runtime,
    loadedBuildId: 'build-a',
    fetchImpl: async () => manifestResponse('build-b'),
    activationTimeoutMs: 100,
  });
  await manager.checkForUpdate();
  const result = await manager.applyUpdate();
  assert.equal(result.outcome, 'reloading');
  assert.equal(runtime.reloadCalls, 1);
});

test('worker installing que ativa automaticamente não exige estado waiting', async () => {
  const serviceWorker = new EventTarget();
  const oldController = {};
  serviceWorker.controller = oldController;
  const installing = Object.assign(new EventTarget(), { state: 'installing' });
  const registration = {
    active: oldController,
    installing,
    waiting: null,
    update: async () => {
      setTimeout(() => {
        installing.state = 'activated';
        registration.installing = null;
        registration.active = installing;
        serviceWorker.controller = installing;
        installing.dispatchEvent(new Event('statechange'));
        serviceWorker.dispatchEvent(new Event('controllerchange'));
      }, 0);
    },
  };
  serviceWorker.ready = Promise.resolve(registration);
  const runtime = createRuntime({ serviceWorker });
  const manager = createPwaUpdateManager({
    runtime,
    loadedBuildId: 'build-a',
    fetchImpl: async () => manifestResponse('build-b'),
    activationTimeoutMs: 100,
  });
  await manager.checkForUpdate();
  const result = await manager.applyUpdate();
  assert.equal(result.outcome, 'reloading');
  assert.equal(runtime.reloadCalls, 1);
});

test('controller que mudou durante registration.update não perde a corrida do listener', async () => {
  const serviceWorker = new EventTarget();
  const oldController = {};
  const newController = {};
  serviceWorker.controller = oldController;
  let messages = 0;
  const waiting = Object.assign(new EventTarget(), {
    state: 'installed',
    postMessage: () => { messages += 1; },
  });
  const registration = {
    active: oldController,
    waiting,
    update: async () => {
      serviceWorker.controller = newController;
      registration.active = newController;
    },
  };
  serviceWorker.ready = Promise.resolve(registration);
  const runtime = createRuntime({ serviceWorker });
  const manager = createPwaUpdateManager({
    runtime,
    loadedBuildId: 'build-a',
    fetchImpl: async () => manifestResponse('build-b'),
    activationTimeoutMs: 20,
  });
  await manager.checkForUpdate();
  const result = await manager.applyUpdate();
  assert.equal(result.outcome, 'reloading');
  assert.equal(messages, 1);
  assert.equal(runtime.reloadCalls, 1);
});

test('falha real de rede em registration.update mostra erro e permite retry', async () => {
  const serviceWorker = new EventTarget();
  const active = { state: 'activated' };
  serviceWorker.controller = active;
  let shouldFail = true;
  const registration = {
    active,
    waiting: null,
    installing: null,
    update: async () => {
      if (shouldFail) throw new Error('network failed');
    },
  };
  serviceWorker.ready = Promise.resolve(registration);
  const runtime = createRuntime({ serviceWorker });
  const manager = createPwaUpdateManager({
    runtime,
    loadedBuildId: 'build-a',
    fetchImpl: async () => manifestResponse('build-b'),
  });
  await manager.checkForUpdate();
  const result = await manager.applyUpdate();
  assert.equal(result.outcome, 'error');
  assert.equal(runtime.reloadCalls, 0);
  assert.equal(manager.getSnapshot().status, UPDATE_STATUS.FAILED);
  assert.equal(runtime.sessionStorage.getItem(UPDATE_RELOAD_GUARD_KEY), null);

  shouldFail = false;
  const retryResult = await manager.applyUpdate({ retry: true });
  assert.equal(retryResult.outcome, 'reloading');
  assert.equal(runtime.reloadCalls, 1);
});

test('aplicação não limpa sessão funcional ao recarregar o worker ativo', async () => {
  const serviceWorker = new EventTarget();
  const active = { state: 'activated' };
  serviceWorker.controller = active;
  serviceWorker.ready = Promise.resolve({ active, waiting: null, installing: null, update: async () => {} });
  const runtime = createRuntime({ serviceWorker });
  runtime.localStorage = createStorage();
  runtime.localStorage.setItem('supabase.auth.token', 'preserved');
  const manager = createPwaUpdateManager({
    runtime,
    loadedBuildId: 'build-a',
    fetchImpl: async () => manifestResponse('build-b'),
  });
  await manager.checkForUpdate();
  await manager.applyUpdate();
  assert.equal(runtime.localStorage.getItem('supabase.auth.token'), 'preserved');
  assert.equal(runtime.reloadCalls, 1);
});

test('falha de rede mantém o app utilizável e não recarrega', async () => {
  const runtime = createRuntime();
  const manager = createPwaUpdateManager({
    runtime,
    loadedBuildId: 'build-a',
    fetchImpl: async () => { throw new Error('offline'); },
  });
  await assert.doesNotReject(manager.checkForUpdate());
  assert.equal(manager.getSnapshot().status, UPDATE_STATUS.IDLE);
  assert.equal(runtime.reloadCalls, 0);
});

test('foreground, pageshow e reabertura disparam novas verificações leves', async () => {
  const runtime = createRuntime();
  let checks = 0;
  const manager = createPwaUpdateManager({
    runtime,
    loadedBuildId: 'build-a',
    fetchImpl: async () => { checks += 1; return manifestResponse('build-a'); },
  });
  const cleanup = manager.start();
  await Promise.resolve();
  await Promise.resolve();
  runtime.dispatchEvent(new Event('focus'));
  await Promise.resolve();
  await Promise.resolve();
  runtime.document.visibilityState = 'hidden';
  runtime.document.dispatchEvent(new Event('visibilitychange'));
  runtime.document.visibilityState = 'visible';
  runtime.document.dispatchEvent(new Event('visibilitychange'));
  await Promise.resolve();
  await Promise.resolve();
  assert.ok(checks >= 3);
  cleanup();
});

// PWA-UPDATE2: fecha a lacuna real encontrada na auditoria -- nenhum evento
// discreto dispara enquanto o app fica continuamente aberto/visível. Sem
// isso, uma sessão longa nunca revalida /version.json sozinha.
test('checagem periodica e criada uma unica vez ao iniciar, e reaproveita checkForUpdate', async () => {
  const runtime = createRuntime();
  let checks = 0;
  const manager = createPwaUpdateManager({
    runtime,
    loadedBuildId: 'build-a',
    periodicCheckIntervalMs: 15,
    fetchImpl: async () => { checks += 1; return manifestResponse('build-a'); },
  });
  const cleanup = manager.start();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 40));
  cleanup();
  assert.ok(checks >= 2, `esperava ao menos 2 checagens (inicial + periodica), recebeu ${checks}`);
});

test('checagem periodica so consulta quando o documento esta visivel -- oculto nao dispara', async () => {
  const runtime = createRuntime();
  runtime.document.visibilityState = 'hidden';
  let checks = 0;
  const manager = createPwaUpdateManager({
    runtime,
    loadedBuildId: 'build-a',
    periodicCheckIntervalMs: 15,
    fetchImpl: async () => { checks += 1; return manifestResponse('build-a'); },
  });
  const cleanup = manager.start();
  await Promise.resolve();
  const checksAfterInitial = checks;
  await new Promise((resolve) => setTimeout(resolve, 40));
  cleanup();
  // A checagem inicial do start() roda independente de visibilidade (mesmo
  // comportamento anterior), mas nenhuma checagem PERIODICA extra deve ter
  // ocorrido enquanto oculto.
  assert.equal(checks, checksAfterInitial, 'nao deveria checar novamente com o documento oculto');
});

test('intervalo periodico e cancelado no cleanup -- sem timer residual', async () => {
  const runtime = createRuntime();
  let checks = 0;
  const manager = createPwaUpdateManager({
    runtime,
    loadedBuildId: 'build-a',
    periodicCheckIntervalMs: 15,
    fetchImpl: async () => { checks += 1; return manifestResponse('build-a'); },
  });
  const cleanup = manager.start();
  await Promise.resolve();
  cleanup();
  const checksAfterCleanup = checks;
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(checks, checksAfterCleanup, 'timer deveria ter sido limpo, sem checagens apos cleanup');
});

test('intervalo periodico e focus simultaneos compartilham a mesma requisicao em andamento -- sem corrida', async () => {
  const runtime = createRuntime();
  let concurrentFetches = 0;
  let maxConcurrent = 0;
  const manager = createPwaUpdateManager({
    runtime,
    loadedBuildId: 'build-a',
    periodicCheckIntervalMs: 10,
    fetchImpl: async () => {
      concurrentFetches += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrentFetches);
      await new Promise((resolve) => setTimeout(resolve, 20));
      concurrentFetches -= 1;
      return manifestResponse('build-a');
    },
  });
  const cleanup = manager.start();
  await Promise.resolve();
  runtime.dispatchEvent(new Event('focus'));
  await new Promise((resolve) => setTimeout(resolve, 30));
  cleanup();
  assert.equal(maxConcurrent, 1, 'nunca deve haver mais de uma checagem de versao em andamento ao mesmo tempo');
});

test('guarda detecta reload anterior sem sucesso e impede loop automático', async () => {
  const storage = createStorage();
  storage.setItem(UPDATE_RELOAD_GUARD_KEY, JSON.stringify({
    targetBuild: 'build-b',
    reloadAttempted: true,
    attemptedAt: Date.now(),
  }));
  const runtime = createRuntime({ storage });
  const manager = createPwaUpdateManager({
    runtime,
    loadedBuildId: 'build-a',
    fetchImpl: async () => manifestResponse('build-b'),
  });
  await manager.checkForUpdate();
  assert.equal(manager.getSnapshot().status, UPDATE_STATUS.FAILED);
  assert.equal(runtime.reloadCalls, 0);
  assert.match(manager.getSnapshot().error, /Tente novamente/);
});

test('storage indisponível falha seguro antes de qualquer reload', async () => {
  const storage = {
    getItem: () => null,
    setItem: () => { throw new Error('blocked'); },
    removeItem: () => {},
  };
  const runtime = createRuntime({ storage });
  const manager = createPwaUpdateManager({
    runtime,
    loadedBuildId: 'build-a',
    fetchImpl: async () => manifestResponse('build-b'),
  });
  await manager.checkForUpdate();
  const result = await manager.applyUpdate();
  assert.equal(result.outcome, 'storage-error');
  assert.equal(runtime.reloadCalls, 0);
});

test('card usa Home, bloqueia ações críticas e não interfere em voz ou scroll', async () => {
  const [card, home, css, vite, vercel] = await Promise.all([
    source('./PwaUpdateCard.jsx'),
    source('../simplified-app/SimplifiedHomeView.jsx'),
    source('./PwaUpdateCard.module.css'),
    source('../../../vite.config.js'),
    source('../../../vercel.json'),
  ]);
  assert.match(card, /Nova atualização disponível/);
  assert.match(card, /Atualizar agora/);
  assert.match(card, /Atualizando\.\.\./);
  assert.match(home, /<PwaUpdateCard/);
  assert.match(home, /voiceInput\.isActive \|\| isInteractionBusy \|\| pendingConfirmation/);
  assert.doesNotMatch(card, /position:\s*fixed|role="dialog"|aria-modal/);
  assert.doesNotMatch(css, /position:\s*fixed/);
  assert.match(vite, /registerType: 'prompt'/);
  assert.match(
    vite,
    /globIgnores: \['\*\*\/version\.json', '\*\*\/legacy-update-bridge\.js', '\*\*\/push-notifications-bridge\.js', '\*\*\/build-id-bridge\.js'\],/,
  );
  assert.match(vercel, /no-store, no-cache, must-revalidate/);
});

// PUSH1: a fundacao de Web Push estende o SW existente via importScripts --
// esta e a regressao que garante que a extensao nunca tocou em nenhuma das
// flags que fazem o sistema de update (que acabamos de estabilizar) e o
// legacy-update-bridge funcionarem.
test('extensao de push + build-id-bridge (importScripts) preserva intactas as flags de update do Workbox', async () => {
  const vite = await source('../../../vite.config.js');
  assert.match(vite, /cleanupOutdatedCaches: false,/);
  assert.match(vite, /clientsClaim: false,/);
  assert.match(vite, /skipWaiting: false,/);
  assert.match(
    vite,
    /importScripts: \['\/legacy-update-bridge\.js', '\/push-notifications-bridge\.js', '\/build-id-bridge\.js'\],/,
  );
  assert.match(
    vite,
    /globIgnores: \['\*\*\/version\.json', '\*\*\/legacy-update-bridge\.js', '\*\*\/push-notifications-bridge\.js', '\*\*\/build-id-bridge\.js'\],/,
  );
});

// ============================================================================
// PWA-UPDATE3 -- terceira ponta do diagnostico (SW build id).
// ============================================================================

test('buildIdBridgePlugin emite build-id-bridge.js com o buildId embutido, sem expor segredo nenhum', async () => {
  const vite = await source('../../../vite.config.js');
  assert.match(vite, /function buildIdBridgePlugin\(\{ buildId \}\)/);
  assert.match(vite, /fileName: 'build-id-bridge\.js',/);
  assert.match(vite, /UNIFLOW_SW_BUILD_ID = \$\{JSON\.stringify\(buildId\)\}/);
  assert.match(vite, /buildIdBridgePlugin\(\{ buildId \}\),/);
});

test('build-id-bridge.js responde a UNIFLOW_GET_BUILD_ID via MessageChannel -- nunca broadcast automatico', async () => {
  const vite = await source('../../../vite.config.js');
  const pluginBody = vite.slice(vite.indexOf('function buildIdBridgePlugin'), vite.indexOf('const buildId = resolveBuildId()'));
  assert.match(pluginBody, /event\.data\?\.type !== 'UNIFLOW_GET_BUILD_ID'/);
  assert.match(pluginBody, /port\?\.postMessage\(\{ type: 'UNIFLOW_SW_BUILD_ID', buildId: UNIFLOW_SW_BUILD_ID \}\)/);
});

// ============================================================================
// PWA UPDATE CONTRACT -- executa vite.config.js de VERDADE (nao so regex no
// texto): importa o modulo real, acha os plugins pelo nome e roda o
// generateBundle() deles com um contexto Rollup falso, conferindo o
// ARTEFATO emitido. Isto e o que garante que uma futura release nao possa
// remover uma das 3 identidades de build sem quebrar a suite -- uma
// mudanca que so alterasse o texto de um jeito que ainda "parece" bater
// com a regex, mas quebrasse o comportamento real, seria pega aqui.
// ============================================================================

async function loadViteConfigPlugins() {
  const mod = await import(new URL('../../../vite.config.js', import.meta.url).href);
  return mod.default.plugins.flat(Infinity).filter(Boolean);
}

function createFakeRollupBundleContext() {
  const emitted = new Map();
  return {
    emitFile({ fileName, source: fileSource }) {
      emitted.set(fileName, fileSource);
    },
    emitted,
  };
}

test('CONTRATO: versionManifestPlugin realmente emite version.json com buildId/releasedAt validos', async () => {
  const plugins = await loadViteConfigPlugins();
  const versionPlugin = plugins.find((plugin) => plugin.name === 'uniflow-version-manifest');
  assert.ok(versionPlugin, 'plugin uniflow-version-manifest precisa existir -- e uma das 3 identidades de build');

  const ctx = createFakeRollupBundleContext();
  versionPlugin.generateBundle.call(ctx);

  const raw = ctx.emitted.get('version.json');
  assert.ok(raw, 'version.json precisa ser emitido de verdade no bundle');
  const manifest = JSON.parse(raw);
  assert.equal(typeof manifest.buildId, 'string');
  assert.ok(manifest.buildId.length > 0, 'buildId nunca pode ser vazio -- e a identidade server das 3');
  assert.equal(typeof manifest.releasedAt, 'string');
  assert.doesNotThrow(() => new Date(manifest.releasedAt).toISOString());
});

test('CONTRATO: buildIdBridgePlugin realmente emite build-id-bridge.js com o MESMO buildId do version.json', async () => {
  const plugins = await loadViteConfigPlugins();
  const versionPlugin = plugins.find((plugin) => plugin.name === 'uniflow-version-manifest');
  const bridgePlugin = plugins.find((plugin) => plugin.name === 'uniflow-build-id-bridge');
  assert.ok(bridgePlugin, 'plugin uniflow-build-id-bridge precisa existir -- e a identidade SW das 3');

  const ctx = createFakeRollupBundleContext();
  versionPlugin.generateBundle.call(ctx);
  bridgePlugin.generateBundle.call(ctx);

  const manifest = JSON.parse(ctx.emitted.get('version.json'));
  const bridgeSource = ctx.emitted.get('build-id-bridge.js');
  assert.ok(bridgeSource, 'build-id-bridge.js precisa ser emitido de verdade no bundle');
  assert.match(bridgeSource, /self\.addEventListener\('message'/);
  assert.match(bridgeSource, /UNIFLOW_GET_BUILD_ID/);

  const embeddedBuildIdMatch = bridgeSource.match(/UNIFLOW_SW_BUILD_ID = "([^"]*)"/);
  assert.ok(embeddedBuildIdMatch, 'buildId precisa estar embutido como string literal no SW');
  assert.equal(
    embeddedBuildIdMatch[1],
    manifest.buildId,
    'as 3 identidades tem que nascer do MESMO buildId -- nunca um build parcial',
  );
});

test('CONTRATO: a identidade runtime (globalThis.__UNIFLOW_BUILD_ID__) usa o MESMO buildId do version.json/SW', async () => {
  const vite = await source('../../../vite.config.js');
  assert.match(
    vite,
    /'globalThis\.__UNIFLOW_BUILD_ID__': JSON\.stringify\(buildId\),/,
    'runtime precisa vir da MESMA variavel buildId usada pelo version.json e pelo build-id-bridge -- nunca uma 4a fonte divergente',
  );
  assert.match(vite, /'globalThis\.__UNIFLOW_RELEASED_AT__': JSON\.stringify\(releasedAt\),/);
});

test('CONTRATO: start() dispara checkForUpdate() de forma SINCRONA (fire-and-forget), nunca espera o intervalo periodico', async () => {
  const runtime = createRuntime();
  let checks = 0;
  const manager = createPwaUpdateManager({
    runtime,
    loadedBuildId: 'build-a',
    // Intervalo periodico bem maior que o tempo do teste -- se o check
    // inicial dependesse dele, `checks` continuaria 0 aqui.
    periodicCheckIntervalMs: 60_000,
    fetchImpl: async () => { checks += 1; return manifestResponse('build-a'); },
  });

  const cleanup = manager.start();
  // Nenhum timer avançado -- so uma volta de microtask, equivalente ao
  // tempo real entre o app abrir e o fetch de version.json comecar.
  await Promise.resolve();
  await Promise.resolve();
  cleanup();

  assert.equal(checks, 1, 'checkForUpdate() precisa disparar no startup, antes de qualquer timer periodico rodar');
});

// ============================================================================
// PWA-UPDATE3 -- recovery automático: ARMA na deteccao, so DISPARA em
// background, guardado por build, nunca em cima de um applyUpdate manual.
// ============================================================================

test('ARMA o update automatico na primeira deteccao -- mas uma checagem em foreground nunca recarrega', async () => {
  const runtime = createRuntime();
  const manager = createPwaUpdateManager({
    runtime,
    loadedBuildId: 'build-a',
    periodicCheckIntervalMs: 0,
    fetchImpl: async () => manifestResponse('build-b'),
  });

  await manager.checkForUpdate();
  assert.deepEqual(manager.getPendingBuildStreak(), { buildId: 'build-b', count: 1 });
  assert.equal(manager.getArmedAutoRecoveryBuild(), 'build-b');

  await manager.checkForUpdate();
  assert.deepEqual(manager.getPendingBuildStreak(), { buildId: 'build-b', count: 2 });
  assert.equal(runtime.reloadCalls, 0, 'app em foreground -- recovery armado nunca pode recarregar sozinho');
});

test('so dispara o reload de recovery quando a pagina REALMENTE sai de foreground (visibilitychange -> hidden)', async () => {
  const runtime = createRuntime();
  const manager = createPwaUpdateManager({
    runtime,
    loadedBuildId: 'build-a',
    periodicCheckIntervalMs: 0,
    fetchImpl: async () => manifestResponse('build-b'),
  });

  await manager.checkForUpdate();
  await manager.checkForUpdate();
  assert.equal(manager.getArmedAutoRecoveryBuild(), 'build-b');

  const cleanup = manager.start();
  runtime.document.visibilityState = 'hidden';
  runtime.document.dispatchEvent(new Event('visibilitychange'));
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(runtime.reloadCalls, 1);
  assert.equal(manager.getArmedAutoRecoveryBuild(), null, 'desarma depois de disparar');
  cleanup();
});

test('recovery automático escreve sua PRÓPRIA guarda em localStorage -- nunca re-arma o mesmo build ja tentado', async () => {
  const localStorage = createStorage();
  const runtime = createRuntime({ localStorage });
  const manager = createPwaUpdateManager({
    runtime,
    loadedBuildId: 'build-a',
    periodicCheckIntervalMs: 0,
    fetchImpl: async () => manifestResponse('build-b'),
  });

  await manager.checkForUpdate();
  await manager.checkForUpdate();
  const cleanup = manager.start();
  runtime.document.visibilityState = 'hidden';
  runtime.document.dispatchEvent(new Event('visibilitychange'));
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(runtime.reloadCalls, 1);
  cleanup();

  const guardRaw = localStorage.getItem('uniflow.app-update.auto-recovery-guard');
  assert.ok(guardRaw);
  assert.equal(JSON.parse(guardRaw).targetBuild, 'build-b');

  // Simula uma NOVA sessao (contador em memoria reinicia), mas a guarda em
  // localStorage sobrevive -- nunca re-arma para o MESMO build ja tentado.
  const manager2 = createPwaUpdateManager({
    runtime,
    loadedBuildId: 'build-a',
    periodicCheckIntervalMs: 0,
    fetchImpl: async () => manifestResponse('build-b'),
  });
  await manager2.checkForUpdate();
  await manager2.checkForUpdate();
  assert.equal(manager2.getArmedAutoRecoveryBuild(), null, 'guarda ja usada -- nunca re-arma o mesmo build');
});

test('streak reseta quando o build pendente muda -- nunca soma checagens de builds diferentes', async () => {
  const runtime = createRuntime();
  let currentBuild = 'build-b';
  const manager = createPwaUpdateManager({
    runtime,
    loadedBuildId: 'build-a',
    periodicCheckIntervalMs: 0,
    fetchImpl: async () => manifestResponse(currentBuild),
  });

  await manager.checkForUpdate();
  currentBuild = 'build-c';
  await manager.checkForUpdate();
  assert.deepEqual(manager.getPendingBuildStreak(), { buildId: 'build-c', count: 1 });
  assert.equal(manager.getArmedAutoRecoveryBuild(), 'build-c', 'arma para o build mais recente, nunca para o anterior');
});

test('streak reseta quando o build fica current -- nunca herda contagem de uma pendencia ja resolvida', async () => {
  const runtime = createRuntime();
  let currentIsAvailable = true;
  const manager = createPwaUpdateManager({
    runtime,
    loadedBuildId: 'build-a',
    periodicCheckIntervalMs: 0,
    fetchImpl: async () => manifestResponse(currentIsAvailable ? 'build-b' : 'build-a'),
  });

  await manager.checkForUpdate();
  await manager.checkForUpdate();
  assert.equal(manager.getArmedAutoRecoveryBuild(), 'build-b');

  currentIsAvailable = false;
  await manager.checkForUpdate();
  assert.deepEqual(manager.getPendingBuildStreak(), { buildId: null, count: 0 });
});

test('recovery automático nunca dispara se um applyUpdate (manual ou ja em andamento) existir', async () => {
  const runtime = createRuntime();
  const manager = createPwaUpdateManager({
    runtime,
    loadedBuildId: 'build-a',
    periodicCheckIntervalMs: 0,
    fetchImpl: async () => manifestResponse('build-b'),
  });

  await manager.checkForUpdate();
  await manager.checkForUpdate();
  assert.equal(manager.getArmedAutoRecoveryBuild(), 'build-b');

  // Usuário clica manualmente ANTES da página sair de foreground.
  void manager.applyUpdate();
  const cleanup = manager.start();
  runtime.document.visibilityState = 'hidden';
  runtime.document.dispatchEvent(new Event('visibilitychange'));
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(runtime.reloadCalls, 1, 'so UM reload -- o manual, nunca um segundo do recovery automático em cima dele');
  cleanup();
});

// Abertura do app: build novo detectado antes do primeiro toque atualiza
// sozinho, sem o usuario precisar tocar em "Atualizar agora".
async function flushStartup() {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
}

test('abertura com build novo e sem toque na tela atualiza sozinha', async () => {
  const runtime = createRuntime();
  const manager = createPwaUpdateManager({
    runtime,
    loadedBuildId: 'build-a',
    periodicCheckIntervalMs: 0,
    fetchImpl: async () => manifestResponse('build-b'),
  });

  const cleanup = manager.start();
  await flushStartup();
  cleanup();

  assert.equal(runtime.reloadCalls, 1);
  assert.equal(JSON.parse(runtime.localStorage.getItem('uniflow.app-update.auto-recovery-guard')).targetBuild, 'build-b');
});

test('abertura nao recarrega se o usuario ja tocou na tela -- espera o background', async () => {
  const runtime = createRuntime();
  let releaseFetch;
  const manager = createPwaUpdateManager({
    runtime,
    loadedBuildId: 'build-a',
    periodicCheckIntervalMs: 0,
    fetchImpl: () => new Promise((resolve) => { releaseFetch = () => resolve(manifestResponse('build-b')); }),
  });

  const cleanup = manager.start();
  runtime.dispatchEvent(new Event('pointerdown'));
  releaseFetch();
  await flushStartup();
  assert.equal(runtime.reloadCalls, 0, 'usuario ja interagiu -- nunca recarrega na cara dele');
  assert.equal(manager.getArmedAutoRecoveryBuild(), 'build-b');

  runtime.document.visibilityState = 'hidden';
  runtime.document.dispatchEvent(new Event('visibilitychange'));
  await flushStartup();
  assert.equal(runtime.reloadCalls, 1);
  cleanup();
});

test('acao em andamento bloqueia o update automatico, que segue armado para depois', async () => {
  const runtime = createRuntime();
  const manager = createPwaUpdateManager({
    runtime,
    loadedBuildId: 'build-a',
    periodicCheckIntervalMs: 0,
    fetchImpl: async () => manifestResponse('build-b'),
  });

  manager.setAutoUpdateBlocked(true);
  const cleanup = manager.start();
  await flushStartup();
  runtime.document.visibilityState = 'hidden';
  runtime.document.dispatchEvent(new Event('visibilitychange'));
  await flushStartup();
  assert.equal(runtime.reloadCalls, 0, 'voz/acao em andamento -- nunca recarrega');
  assert.equal(manager.getArmedAutoRecoveryBuild(), 'build-b');

  manager.setAutoUpdateBlocked(false);
  runtime.document.visibilityState = 'visible';
  runtime.document.dispatchEvent(new Event('visibilitychange'));
  await flushStartup();
  runtime.document.visibilityState = 'hidden';
  runtime.document.dispatchEvent(new Event('visibilitychange'));
  await flushStartup();
  assert.equal(runtime.reloadCalls, 1);
  cleanup();
});

// ============================================================================
// PWA-UPDATE3/INVARIANTE -- getDiagnosticSnapshot prova (nunca infere) as
// 3 identidades de build ao mesmo tempo; o console helper e o unico jeito
// de acessar isso num aparelho fisico real, nunca por uma tela do app.
// ============================================================================

test('getDiagnosticSnapshot compara loadedBuildId (runtime) com o buildId mais recente confirmado pelo server', async () => {
  const runtime = createRuntime();
  const manager = createPwaUpdateManager({
    runtime,
    loadedBuildId: 'build-a',
    periodicCheckIntervalMs: 0,
    fetchImpl: async () => manifestResponse('build-b'),
  });

  await manager.checkForUpdate();
  const snapshot = await manager.getDiagnosticSnapshot();
  assert.equal(snapshot.runtimeBuildId, 'build-a');
  assert.equal(snapshot.serverBuildId, 'build-b');
  assert.equal(snapshot.coherence, BUILD_COHERENCE.RUNTIME_STALE);
});

test('getDiagnosticSnapshot: runtime alcança o server, mas sem SW no ambiente de teste -- SW_UNKNOWN, nunca finge COHERENT sem provar a 3a identidade', async () => {
  const runtime = createRuntime();
  const manager = createPwaUpdateManager({
    runtime,
    loadedBuildId: 'build-b',
    periodicCheckIntervalMs: 0,
    fetchImpl: async () => manifestResponse('build-b'),
  });

  await manager.checkForUpdate();
  const snapshot = await manager.getDiagnosticSnapshot();
  assert.equal(snapshot.runtimeBuildId, 'build-b');
  assert.equal(snapshot.serverBuildId, 'build-b');
  assert.equal(snapshot.coherence, BUILD_COHERENCE.SW_UNKNOWN);
});

test('exposePwaDiagnosticConsoleHelper liga __uniflowPwaDiagnostic ao getDiagnosticSnapshot do manager, e o cleanup remove -- nunca sobra pendurado', async () => {
  const runtime = createRuntime();
  const manager = createPwaUpdateManager({
    runtime,
    loadedBuildId: 'build-a',
    periodicCheckIntervalMs: 0,
    fetchImpl: async () => manifestResponse('build-a'),
  });
  await manager.checkForUpdate();

  const remove = exposePwaDiagnosticConsoleHelper(manager, runtime);
  assert.equal(typeof runtime.__uniflowPwaDiagnostic, 'function');
  const snapshot = await runtime.__uniflowPwaDiagnostic();
  assert.equal(snapshot.runtimeBuildId, 'build-a');
  assert.equal(snapshot.serverBuildId, 'build-a');

  remove();
  assert.equal('__uniflowPwaDiagnostic' in runtime, false);
});
