import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

// ============================================================================
// AGPUSH1 -- cobertura das actions de notificacao de Agenda adicionadas a
// push-notifications-bridge.js (30min/1h/Nao precisa). Mesmo harness VM de
// pushNotificationsBridge.test.js (roda o codigo real do Service Worker),
// estendido com um `fetch` mock e `event.action` -- os testes originais
// desse arquivo continuam cobrindo push/notificationclick basicos e nao
// sao duplicados aqui.
// ============================================================================

const bridgeUrl = new URL('../../../public/push-notifications-bridge.js', import.meta.url);

class FakeClient {
  constructor(url) {
    this.url = url;
    this.focused = false;
  }

  async focus() {
    this.focused = true;
    return this;
  }
}

async function loadBridge({ existingClients = [], fetchImpl } = {}) {
  const listeners = new Map();
  let shownNotification = null;
  let openedUrl = null;
  const fetchCalls = [];

  const fetchMock = async (url, options) => {
    fetchCalls.push({ url, options });
    if (fetchImpl) return fetchImpl(url, options);
    return { ok: true, json: async () => ({ applied: true }) };
  };

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
    fetch: fetchMock,
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

  const dispatchNotificationClick = async (notification, action) => {
    const promises = [];
    listeners.get('notificationclick')?.({
      notification,
      action,
      waitUntil: (promise) => promises.push(promise),
    });
    await Promise.all(promises);
  };

  return {
    dispatchPush,
    dispatchNotificationClick,
    getShownNotification: () => shownNotification,
    getOpenedUrl: () => openedUrl,
    getFetchCalls: () => fetchCalls,
  };
}

const PROMPT_PAYLOAD = {
  title: 'Uni ✦',
  body: 'Você tem um compromisso amanhã às 09:00.\nQuer que eu te lembre antes?',
  url: '/app/agenda?item=item-1&reminderPrompt=1',
  data: {
    type: 'agenda_reminder_prompt',
    agenda_item_id: 'item-1',
    decision_token: 'token-abc',
    url: '/app/agenda?item=item-1&reminderPrompt=1',
  },
  actions: [
    { action: 'agenda_remind_30', title: '30 min antes' },
    { action: 'agenda_remind_60', title: '1h antes' },
    { action: 'agenda_remind_none', title: 'Não precisa' },
  ],
};

test('push com actions no payload repassa `actions` para showNotification -- a decisao de incluir e sempre do backend, nunca do bridge', async () => {
  const bridge = await loadBridge();
  await bridge.dispatchPush(PROMPT_PAYLOAD);
  const shown = bridge.getShownNotification();
  assert.deepEqual(shown.options.actions, PROMPT_PAYLOAD.actions);
  assert.equal(shown.options.data.agenda_item_id, 'item-1');
  assert.equal(shown.options.data.decision_token, 'token-abc');
});

test('push sem actions no payload (ex.: iOS) nunca inventa actions -- showNotification nao recebe a chave', async () => {
  const bridge = await loadBridge();
  await bridge.dispatchPush({ title: 'Uni ✦', body: 'x', url: '/app/agenda', data: { agenda_item_id: 'item-2' } });
  const shown = bridge.getShownNotification();
  assert.equal('actions' in shown.options, false);
});

test('action agenda_remind_30 chama agenda-push-decision com offset 30 e o decision_token do payload -- nunca abre/foca janela', async () => {
  const bridge = await loadBridge();
  await bridge.dispatchNotificationClick(
    { data: PROMPT_PAYLOAD.data, close: () => {} },
    'agenda_remind_30',
  );
  const calls = bridge.getFetchCalls();
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/agenda-push-decision$/);
  const body = JSON.parse(calls[0].options.body);
  assert.deepEqual(body, { agenda_item_id: 'item-1', token: 'token-abc', offset: '30' });
  assert.equal(bridge.getOpenedUrl(), null);
});

test('action agenda_remind_60 envia offset 60', async () => {
  const bridge = await loadBridge();
  await bridge.dispatchNotificationClick({ data: PROMPT_PAYLOAD.data, close: () => {} }, 'agenda_remind_60');
  const body = JSON.parse(bridge.getFetchCalls()[0].options.body);
  assert.equal(body.offset, '60');
});

test('action agenda_remind_none envia offset none', async () => {
  const bridge = await loadBridge();
  await bridge.dispatchNotificationClick({ data: PROMPT_PAYLOAD.data, close: () => {} }, 'agenda_remind_none');
  const body = JSON.parse(bridge.getFetchCalls()[0].options.body);
  assert.equal(body.offset, 'none');
});

test('toque simples (sem action) continua abrindo/focando a janela mesmo em uma notificacao de agenda -- so acoes de botao processam em background', async () => {
  const existing = new FakeClient('https://app.uniflow.ai/app');
  const bridge = await loadBridge({ existingClients: [existing] });
  await bridge.dispatchNotificationClick({ data: PROMPT_PAYLOAD.data, close: () => {} }, undefined);
  assert.equal(existing.focused, true);
  assert.equal(bridge.getFetchCalls().length, 0);
});

test('falha de rede ao registrar a decisao nunca lanca um erro nao tratado no Service Worker', async () => {
  const bridge = await loadBridge({ fetchImpl: async () => { throw new Error('offline'); } });
  await assert.doesNotReject(
    bridge.dispatchNotificationClick({ data: PROMPT_PAYLOAD.data, close: () => {} }, 'agenda_remind_30'),
  );
});

test('action de agenda sempre fecha a notificacao', async () => {
  const bridge = await loadBridge();
  let closed = false;
  await bridge.dispatchNotificationClick({ data: PROMPT_PAYLOAD.data, close: () => { closed = true; } }, 'agenda_remind_30');
  assert.equal(closed, true);
});
