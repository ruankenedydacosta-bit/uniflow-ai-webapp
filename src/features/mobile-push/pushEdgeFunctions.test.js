import assert from 'node:assert/strict';
import test from 'node:test';
import { createPushService } from './pushEdgeFunctions.js';

// ============================================================================
// PUSH1 -- pushEdgeFunctions.js. Mesmo padrao de fabrica testavel de
// billingService.test.js -- fetch mockado, nunca chamada de rede real.
// ============================================================================

function fakeSupabase(token = 'jwt-token') {
  return { auth: { getSession: async () => ({ data: { session: token ? { access_token: token } : null } }) } };
}

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function makeService({ fetchImpl, token = 'jwt-token', supabase = fakeSupabase(token) } = {}) {
  return createPushService({
    supabase,
    supabaseUrl: 'https://demo.supabase.co',
    supabaseAnonKey: 'anon-key',
    fetchImpl,
  });
}

test('pushService expoe exatamente sendTestNotification e sendAgendaReminderDecision', () => {
  const service = makeService({ fetchImpl: async () => jsonResponse(200, {}) });
  assert.deepEqual(Object.keys(service), ['sendTestNotification', 'sendAgendaReminderDecision']);
});

test('sendTestNotification chama SOMENTE push-send-test-notification', async () => {
  let calledUrl = null;
  const service = makeService({
    fetchImpl: async (url) => { calledUrl = url; return jsonResponse(200, { sent: 1, revoked: 0, failed: 0 }); },
  });
  await service.sendTestNotification({ workspaceId: 'ws-1' });
  assert.equal(calledUrl, 'https://demo.supabase.co/functions/v1/push-send-test-notification');
});

test('sendTestNotification resolve com { data, error: null } em caso de sucesso -- nunca lanca', async () => {
  const service = makeService({ fetchImpl: async () => jsonResponse(200, { sent: 1, revoked: 0, failed: 0 }) });
  const result = await service.sendTestNotification({ workspaceId: 'ws-1' });
  assert.deepEqual(result, { data: { sent: 1, revoked: 0, failed: 0 }, error: null });
});

test('sendTestNotification normaliza erro da Edge Function sem lancar', async () => {
  const service = makeService({
    fetchImpl: async () => jsonResponse(404, { error: { code: 'NO_ACTIVE_SUBSCRIPTION', message: 'motivo' } }),
  });
  const result = await service.sendTestNotification({ workspaceId: 'ws-1' });
  assert.equal(result.data, null);
  assert.deepEqual(result.error, { code: 'NO_ACTIVE_SUBSCRIPTION', message: 'motivo' });
});

test('sem sessao, nunca vaza para chamada de rede -- UNAUTHORIZED sem fetch', async () => {
  let called = false;
  const service = makeService({
    token: null,
    fetchImpl: async () => { called = true; return jsonResponse(200, {}); },
  });
  const result = await service.sendTestNotification({ workspaceId: 'ws-1' });
  assert.equal(called, false);
  assert.deepEqual(result.error, { code: 'UNAUTHORIZED', message: 'push_auth_required' });
});

test('sem supabase configurado, resolve BACKEND_NOT_CONFIGURED sem tentar rede', async () => {
  let called = false;
  const service = createPushService({
    supabase: null,
    supabaseUrl: '',
    supabaseAnonKey: '',
    fetchImpl: async () => { called = true; return jsonResponse(200, {}); },
  });
  const result = await service.sendTestNotification({ workspaceId: 'ws-1' });
  assert.equal(called, false);
  assert.deepEqual(result.error, { code: 'BACKEND_NOT_CONFIGURED', message: 'push_unavailable' });
});

test('nunca envia titulo/corpo/alvo do cliente no corpo da requisicao -- payload e sempre fixo no backend', async () => {
  let sentBody = null;
  const service = makeService({
    fetchImpl: async (_url, init) => { sentBody = JSON.parse(init.body); return jsonResponse(200, {}); },
  });
  await service.sendTestNotification({ workspaceId: 'ws-1' });
  assert.deepEqual(Object.keys(sentBody), ['workspace_id']);
});

// ============================================================================
// AGPUSH1 -- sendAgendaReminderDecision (caminho autenticado de
// agenda-push-decision, usado pelo modal de escolha dentro do app).
// ============================================================================

test('sendAgendaReminderDecision chama SOMENTE agenda-push-decision, com sessao do proprio usuario', async () => {
  let calledUrl = null;
  let sentAuth = null;
  const service = makeService({
    fetchImpl: async (url, init) => {
      calledUrl = url;
      sentAuth = init.headers.Authorization;
      return jsonResponse(200, { applied: true });
    },
  });
  await service.sendAgendaReminderDecision({ agendaItemId: 'item-1', offset: '30' });
  assert.equal(calledUrl, 'https://demo.supabase.co/functions/v1/agenda-push-decision');
  assert.equal(sentAuth, 'Bearer jwt-token');
});

test('sendAgendaReminderDecision envia exatamente agenda_item_id e offset -- nunca token/user_id/workspace_id', async () => {
  let sentBody = null;
  const service = makeService({
    fetchImpl: async (_url, init) => { sentBody = JSON.parse(init.body); return jsonResponse(200, { applied: true }); },
  });
  await service.sendAgendaReminderDecision({ agendaItemId: 'item-1', offset: 'none' });
  assert.deepEqual(sentBody, { agenda_item_id: 'item-1', offset: 'none' });
});

test('sendAgendaReminderDecision resolve com { data, error: null } em caso de sucesso -- nunca lanca', async () => {
  const service = makeService({ fetchImpl: async () => jsonResponse(200, { applied: true }) });
  const result = await service.sendAgendaReminderDecision({ agendaItemId: 'item-1', offset: '30' });
  assert.deepEqual(result, { data: { applied: true }, error: null });
});

test('sendAgendaReminderDecision sem sessao nunca vaza para chamada de rede', async () => {
  let called = false;
  const service = makeService({
    token: null,
    fetchImpl: async () => { called = true; return jsonResponse(200, {}); },
  });
  const result = await service.sendAgendaReminderDecision({ agendaItemId: 'item-1', offset: '30' });
  assert.equal(called, false);
  assert.deepEqual(result.error, { code: 'UNAUTHORIZED', message: 'push_auth_required' });
});
