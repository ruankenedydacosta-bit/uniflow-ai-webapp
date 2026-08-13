import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { isDifferentBuild, parseVersionManifest } from './appVersion.js';
import {
  createPwaUpdateManager,
  UPDATE_RELOAD_GUARD_KEY,
  UPDATE_STATUS,
} from './pwaUpdateStore.js';

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

function createRuntime({ serviceWorker, storage = createStorage() } = {}) {
  const runtime = new EventTarget();
  runtime.document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  runtime.navigator = serviceWorker ? { serviceWorker } : {};
  runtime.sessionStorage = storage;
  runtime.setTimeout = setTimeout;
  runtime.clearTimeout = clearTimeout;
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
  serviceWorker.controller = {};
  let updateCalls = 0;
  let messages = 0;
  const waiting = {
    postMessage: (message) => {
      assert.deepEqual(message, { type: 'SKIP_WAITING' });
      messages += 1;
      queueMicrotask(() => serviceWorker.dispatchEvent(new Event('controllerchange')));
    },
  };
  serviceWorker.ready = Promise.resolve({ waiting, update: async () => { updateCalls += 1; } });
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

test('Service Worker sem versão waiting falha seguro e não recarrega assets antigos', async () => {
  const serviceWorker = new EventTarget();
  serviceWorker.controller = {};
  serviceWorker.ready = Promise.resolve({ waiting: null, installing: null, update: async () => {} });
  const runtime = createRuntime({ serviceWorker });
  const manager = createPwaUpdateManager({
    runtime,
    loadedBuildId: 'build-a',
    fetchImpl: async () => manifestResponse('build-b'),
    activationTimeoutMs: 100,
  });
  await manager.checkForUpdate();
  const result = await manager.applyUpdate();
  assert.equal(result.outcome, 'error');
  assert.equal(runtime.reloadCalls, 0);
  assert.equal(manager.getSnapshot().status, UPDATE_STATUS.FAILED);
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
  assert.match(vite, /globIgnores: \['\*\*\/version\.json', '\*\*\/legacy-update-bridge\.js'\]/);
  assert.match(vercel, /no-store, no-cache, must-revalidate/);
});
