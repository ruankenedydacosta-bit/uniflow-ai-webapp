import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const bridgeUrl = new URL('../../../public/push-notifications-bridge.js', import.meta.url);

class FakeClient {
  constructor(url) {
    this.url = url;
    this.focused = false;
    this.navigated = null;
  }

  async focus() {
    this.focused = true;
    return this;
  }

  async navigate(url) {
    this.navigated = url;
    return this;
  }
}

async function loadBridge({ existingClients = [] } = {}) {
  const listeners = new Map();
  let shownNotification = null;
  let openedUrl = null;

  const scope = {
    self: {
      addEventListener: (type, listener) => listeners.set(type, listener),
      registration: {
        showNotification: async (title, options) => { shownNotification = { title, options }; },
      },
      location: { origin: 'https://app.uniflow.ai' },
      clients: {
        matchAll: async () => existingClients,
        openWindow: async (url) => { openedUrl = url; },
      },
    },
    URL,
  };
  const code = await readFile(bridgeUrl, 'utf8');
  vm.runInNewContext(code, scope, { filename: bridgeUrl.pathname });

  const dispatchPush = async (data) => {
    const promises = [];
    listeners.get('push')?.({
      data: data === undefined ? null : { json: () => data },
      waitUntil: (promise) => promises.push(promise),
    });
    await Promise.all(promises);
  };

  const dispatchNotificationClick = async (notification) => {
    const promises = [];
    listeners.get('notificationclick')?.({
      notification,
      waitUntil: (promise) => promises.push(promise),
    });
    await Promise.all(promises);
  };

  return {
    dispatchPush,
    dispatchNotificationClick,
    getShownNotification: () => shownNotification,
    getOpenedUrl: () => openedUrl,
  };
}

test('push com payload valido mostra a notificacao com titulo/corpo/url do backend', async () => {
  const bridge = await loadBridge();
  await bridge.dispatchPush({ title: 'Uni ✦', body: 'Notificações ativadas.', url: '/app/agenda' });
  const shown = bridge.getShownNotification();
  assert.equal(shown.title, 'Uni ✦');
  assert.equal(shown.options.body, 'Notificações ativadas.');
  assert.equal(shown.options.data.url, '/app/agenda');
});

test('push sem payload (ou payload invalido) ainda mostra uma notificacao com o titulo padrao -- nunca falha silenciosamente', async () => {
  const bridge = await loadBridge();
  await bridge.dispatchPush(undefined);
  const shown = bridge.getShownNotification();
  assert.equal(shown.title, 'Uni ✦');
});

test('push com url externa (nao comecando com /) cai no padrao -- nunca abre dominio arbitrario', async () => {
  const bridge = await loadBridge();
  await bridge.dispatchPush({ title: 'Uni ✦', body: 'x', url: 'https://malicioso.example/' });
  const shown = bridge.getShownNotification();
  assert.equal(shown.options.data.url, '/');
});

test('notificationclick com janela ja aberta foca a janela existente em vez de abrir uma nova', async () => {
  const existing = new FakeClient('https://app.uniflow.ai/app');
  const bridge = await loadBridge({ existingClients: [existing] });
  await bridge.dispatchNotificationClick({ data: { url: '/app/agenda' }, close: () => {} });
  assert.equal(existing.focused, true);
  assert.equal(bridge.getOpenedUrl(), null);
});

test('notificationclick sem janela aberta abre uma nova para a UniFlow', async () => {
  const bridge = await loadBridge({ existingClients: [] });
  await bridge.dispatchNotificationClick({ data: { url: '/app/agenda' }, close: () => {} });
  assert.equal(bridge.getOpenedUrl(), '/app/agenda');
});

test('notificationclick sempre fecha a notificacao', async () => {
  const bridge = await loadBridge();
  let closed = false;
  await bridge.dispatchNotificationClick({ data: {}, close: () => { closed = true; } });
  assert.equal(closed, true);
});
