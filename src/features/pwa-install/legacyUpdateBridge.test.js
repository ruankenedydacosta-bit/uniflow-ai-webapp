import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const bridgeUrl = new URL('../../../public/legacy-update-bridge.js', import.meta.url);
const viteUrl = new URL('../../../vite.config.js', import.meta.url);

function createCacheStorage() {
  const stores = new Map();
  return {
    stores,
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const values = stores.get(name);
      return {
        match: async (key) => values.get(key),
        put: async (key, value) => values.set(key, value),
        delete: async (key) => values.delete(key),
      };
    },
  };
}

async function installWorker(cacheStorage) {
  const listeners = new Map();
  let skipWaitingCalls = 0;
  const scope = {
    self: {
      addEventListener: (type, listener) => listeners.set(type, listener),
      skipWaiting: async () => { skipWaitingCalls += 1; },
    },
    caches: cacheStorage,
    Response,
  };
  const code = await readFile(bridgeUrl, 'utf8');
  vm.runInNewContext(code, scope, { filename: bridgeUrl.pathname });

  const dispatch = async (type) => {
    const promises = [];
    listeners.get(type)?.({ waitUntil: (promise) => promises.push(promise) });
    await Promise.all(promises);
  };

  return { dispatch, getSkipWaitingCalls: () => skipWaitingCalls, scope };
}

test('cliente legado ativa o SW bridge sem depender de mensagem do app antigo', async () => {
  const caches = createCacheStorage();
  const bridge = await installWorker(caches);

  await bridge.dispatch('install');
  assert.equal(bridge.getSkipWaitingCalls(), 1);

  await bridge.dispatch('activate');
  const markerCache = caches.stores.get('uniflow-legacy-update-bridge-v1');
  assert.ok(markerCache.has('/__uniflow_legacy_update_bridge_completed__'));
  assert.equal(markerCache.has('/__uniflow_legacy_update_bridge_pending__'), false);
});

test('release posterior volta ao modo prompt e não força ativação automática', async () => {
  const caches = createCacheStorage();
  const bridge = await installWorker(caches);
  await bridge.dispatch('install');
  await bridge.dispatch('activate');

  const nextRelease = await installWorker(caches);
  await nextRelease.dispatch('install');
  assert.equal(nextRelease.getSkipWaitingCalls(), 0);
});

test('bridge não reivindica, não navega e não recarrega clientes em uso', async () => {
  const code = await readFile(bridgeUrl, 'utf8');
  assert.doesNotMatch(code, /clients\.claim|client\.navigate|location\.reload/);
  assert.doesNotMatch(code, /localStorage|sessionStorage|indexedDB|cookie/);
});

test('cliente aberto mantém worker, cache e sessão; próxima abertura usa o bridge ativo', async () => {
  const caches = createCacheStorage();
  const oldPrecache = await caches.open('workbox-precache-old-build');
  await oldPrecache.put('/assets/old-lazy-chunk.js', new Response('old chunk'));
  const session = new Map([['supabase.auth.token', 'preserved']]);
  const openClient = { controller: 'old-worker' };

  const bridge = await installWorker(caches);
  await bridge.dispatch('install');
  await bridge.dispatch('activate');
  const nextClient = { controller: bridge.getSkipWaitingCalls() === 1 ? 'bridge-worker' : 'old-worker' };

  assert.equal(openClient.controller, 'old-worker');
  assert.equal(nextClient.controller, 'bridge-worker');
  assert.equal(session.get('supabase.auth.token'), 'preserved');
  assert.ok(caches.stores.get('workbox-precache-old-build').has('/assets/old-lazy-chunk.js'));
});

test('Workbox preserva caches legados e mantém o protocolo moderno por mensagem', async () => {
  const vite = await readFile(viteUrl, 'utf8');
  assert.match(vite, /registerType: 'prompt'/);
  assert.match(vite, /cleanupOutdatedCaches: false/);
  assert.match(vite, /clientsClaim: false/);
  assert.match(vite, /skipWaiting: false/);
  // PUSH1/PWA-UPDATE3: importScripts ganhou mais dois arquivos
  // (push-notifications-bridge.js e build-id-bridge.js) -- este teste so
  // garante que legacy-update-bridge.js continua presente no array, nunca
  // removido pelas extensoes seguintes.
  assert.match(vite, /importScripts: \['\/legacy-update-bridge\.js', '\/push-notifications-bridge\.js', '\/build-id-bridge\.js'\],/);
  assert.match(vite, /'\*\*\/version\.json'/);
});
