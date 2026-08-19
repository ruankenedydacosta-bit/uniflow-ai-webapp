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

async function loadBridge({ existingClients = [], fetchImpl, maxActions } = {}) {
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
    // AGPUSH1: so injetada quando o teste explicitamente passa maxActions --
    // omitida por padrao para provar que, sem a API disponivel, o bridge
    // nunca inventa um limite (repassa as actions como vieram).
    ...(typeof maxActions === 'number' ? { Notification: { maxActions } } : {}),
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
  tag: 'agenda-reminder-prompt-item-1',
  data: {
    type: 'agenda_reminder_prompt',
    agenda_item_id: 'item-1',
    decision_token: 'token-abc',
    url: '/app/agenda?item=item-1&reminderPrompt=1',
  },
  // AGPUSH1: exatamente as DUAS actions que o backend realmente envia hoje
  // (30min/1h) -- "Nao precisa" deixou de ser um terceiro botao nativo;
  // ignorar/dispensar a notificacao ja produz o mesmo efeito. O mapeamento
  // agenda_remind_none continua no bridge por robustez (ver teste
  // dedicado abaixo), mas nao faz mais parte do payload real.
  actions: [
    { action: 'agenda_remind_30', title: '30 min antes' },
    { action: 'agenda_remind_60', title: '1h antes' },
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

test('push com tag repassa tag + renotify:true -- reenvio para o mesmo compromisso substitui a notificacao anterior, alertando de novo', async () => {
  const bridge = await loadBridge();
  await bridge.dispatchPush(PROMPT_PAYLOAD);
  const shown = bridge.getShownNotification();
  assert.equal(shown.options.tag, 'agenda-reminder-prompt-item-1');
  assert.equal(shown.options.renotify, true);
});

test('push sem tag (ex.: notificacao de teste) nunca inventa uma -- showNotification nao recebe tag/renotify', async () => {
  const bridge = await loadBridge();
  await bridge.dispatchPush({ title: 'Uni ✦', body: 'x', url: '/app/agenda' });
  const shown = bridge.getShownNotification();
  assert.equal('tag' in shown.options, false);
  assert.equal('renotify' in shown.options, false);
});

test('push sem actions no payload (ex.: iOS) nunca inventa actions -- showNotification nao recebe a chave', async () => {
  const bridge = await loadBridge();
  await bridge.dispatchPush({ title: 'Uni ✦', body: 'x', url: '/app/agenda', data: { agenda_item_id: 'item-2' } });
  const shown = bridge.getShownNotification();
  assert.equal('actions' in shown.options, false);
});

// ============================================================================
// AGPUSH1 (defesa de compatibilidade, NAO a causa raiz investigada) --
// nunca manda ao browser mais actions do que Notification.maxActions
// relata suportar, quando essa API estiver disponivel.
// ============================================================================

test('Notification.maxActions disponivel e MENOR que o payload -- corta para o limite relatado', async () => {
  const bridge = await loadBridge({ maxActions: 1 });
  await bridge.dispatchPush(PROMPT_PAYLOAD);
  const shown = bridge.getShownNotification();
  assert.deepEqual(shown.options.actions, [PROMPT_PAYLOAD.actions[0]]);
});

test('Notification.maxActions === 0 -- nenhuma action e enviada, notificacao aparece sem botoes', async () => {
  const bridge = await loadBridge({ maxActions: 0 });
  await bridge.dispatchPush(PROMPT_PAYLOAD);
  const shown = bridge.getShownNotification();
  assert.equal('actions' in shown.options, false);
});

test('Notification.maxActions maior ou igual ao payload -- nao corta nada', async () => {
  const bridge = await loadBridge({ maxActions: 5 });
  await bridge.dispatchPush(PROMPT_PAYLOAD);
  const shown = bridge.getShownNotification();
  assert.deepEqual(shown.options.actions, PROMPT_PAYLOAD.actions);
});

test('Notification.maxActions indisponivel (API nao suportada) -- nunca inventa um limite, repassa as actions como vieram', async () => {
  const bridge = await loadBridge();
  await bridge.dispatchPush(PROMPT_PAYLOAD);
  const shown = bridge.getShownNotification();
  assert.deepEqual(shown.options.actions, PROMPT_PAYLOAD.actions);
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

test('action agenda_remind_none envia offset none -- mapeamento mantido no bridge por robustez, mesmo o backend nao enviando mais esse botao nativo', async () => {
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
