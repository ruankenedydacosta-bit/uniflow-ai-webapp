import assert from 'node:assert/strict';
import test from 'node:test';
import { CONNECTION_FIELDS, createGoogleCalendarService, GOOGLE_AGENDA_RETURN_PATH } from './googleCalendarService.js';

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function fakeSupabase({ token = 'jwt-token', queryResult = { data: null, error: null }, onQuery } = {}) {
  const chamadas = [];
  const builder = {
    select(campos) { chamadas.push(['select', campos]); return builder; },
    eq(coluna, valor) { chamadas.push(['eq', coluna, valor]); return builder; },
    async maybeSingle() { onQuery?.(chamadas); return queryResult; },
  };
  return {
    auth: { getSession: async () => ({ data: { session: token ? { access_token: token } : null } }) },
    from(tabela) { chamadas.push(['from', tabela]); return builder; },
  };
}

function makeService({ fetchImpl, supabase = fakeSupabase() } = {}) {
  return createGoogleCalendarService({
    supabase,
    supabaseUrl: 'https://demo.supabase.co',
    supabaseAnonKey: 'anon-key',
    fetchImpl,
  });
}

test('iniciarConexao chama google-calendar-connect com workspace_id e o return_path padrão', async () => {
  let pedido;
  const service = makeService({
    fetchImpl: async (url, init) => {
      pedido = { url, init };
      return jsonResponse(200, { authorization_url: 'https://accounts.google.com/o/oauth2/v2/auth?x=1' });
    },
  });
  const { data, error } = await service.iniciarConexao({ workspaceId: 'ws-1' });
  assert.equal(error, null);
  assert.equal(data.authorization_url, 'https://accounts.google.com/o/oauth2/v2/auth?x=1');
  assert.equal(pedido.url, 'https://demo.supabase.co/functions/v1/google-calendar-connect');
  assert.equal(pedido.init.method, 'POST');
  assert.equal(pedido.init.headers.Authorization, 'Bearer jwt-token');
  assert.deepEqual(JSON.parse(pedido.init.body), { workspace_id: 'ws-1', return_path: GOOGLE_AGENDA_RETURN_PATH });
  assert.equal(GOOGLE_AGENDA_RETURN_PATH, '/app/conta/google-agenda');
});

test('desconectar chama google-calendar-disconnect só com workspace_id', async () => {
  let pedido;
  const service = makeService({
    fetchImpl: async (url, init) => {
      pedido = { url, init };
      return jsonResponse(200, { disconnected: true, revoked: true });
    },
  });
  const { data, error } = await service.desconectar({ workspaceId: 'ws-1' });
  assert.equal(error, null);
  assert.deepEqual(data, { disconnected: true, revoked: true });
  assert.equal(pedido.url, 'https://demo.supabase.co/functions/v1/google-calendar-disconnect');
  assert.deepEqual(JSON.parse(pedido.init.body), { workspace_id: 'ws-1' });
});

test('erro da função volta em { error: { code, message } }, sem lançar', async () => {
  const service = makeService({
    fetchImpl: async () => jsonResponse(403, { error: { code: 'NOT_ALLOWED', message: 'x' } }),
  });
  assert.deepEqual(await service.iniciarConexao({ workspaceId: 'ws-1' }), {
    data: null, error: { code: 'NOT_ALLOWED', message: 'x' },
  });
});

test('falha de rede, sessão ausente e workspace ausente resolvem com error', async () => {
  const semRede = makeService({ fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal((await semRede.desconectar({ workspaceId: 'ws-1' })).error.code, 'NETWORK');

  const semSessao = makeService({ fetchImpl: async () => jsonResponse(200, {}), supabase: fakeSupabase({ token: null }) });
  assert.equal((await semSessao.iniciarConexao({ workspaceId: 'ws-1' })).error.code, 'UNAUTHORIZED');

  let chamou = false;
  const semEspaco = makeService({ fetchImpl: async () => { chamou = true; return jsonResponse(200, {}); } });
  assert.equal((await semEspaco.iniciarConexao({})).error.code, 'INVALID_WORKSPACE');
  assert.equal((await semEspaco.desconectar({})).error.code, 'INVALID_WORKSPACE');
  assert.equal(chamou, false);
});

test('obterConexao lê calendar_connections do espaço, provedor google, sem a coluna do segredo', async () => {
  let chamadas;
  const conexao = { id: 'c1', account_email: 'eu@exemplo.test', status: 'active' };
  const service = makeService({
    fetchImpl: async () => jsonResponse(200, {}),
    supabase: fakeSupabase({ queryResult: { data: conexao, error: null }, onQuery: (c) => { chamadas = c; } }),
  });
  const { data, error } = await service.obterConexao({ workspaceId: 'ws-1' });
  assert.equal(error, null);
  assert.deepEqual(data, conexao);
  assert.deepEqual(chamadas[0], ['from', 'calendar_connections']);
  assert.deepEqual(chamadas.filter((c) => c[0] === 'eq'), [['eq', 'workspace_id', 'ws-1'], ['eq', 'provider', 'google']]);
  assert.doesNotMatch(CONNECTION_FIELDS, /refresh_token|secret|\*/);
});

test('obterConexao: sem conexão devolve data null; erro do banco vira error', async () => {
  const vazio = makeService({ supabase: fakeSupabase({ queryResult: { data: null, error: null } }) });
  assert.deepEqual(await vazio.obterConexao({ workspaceId: 'ws-1' }), { data: null, error: null });

  const quebrado = makeService({ supabase: fakeSupabase({ queryResult: { data: null, error: { message: 'x' } } }) });
  assert.equal((await quebrado.obterConexao({ workspaceId: 'ws-1' })).error.code, 'CONNECTION_QUERY_FAILED');

  const semSupabase = createGoogleCalendarService({});
  assert.equal((await semSupabase.obterConexao({ workspaceId: 'ws-1' })).error.code, 'SUPABASE_NOT_CONFIGURED');
});
