// Épico #98 (#102): agendas da conexão, preferências gravadas por UPDATE
// direto e "Sincronizar agora". Arquivo à parte de googleCalendarService.test.js
// para não colidir com o #101.
import assert from 'node:assert/strict';
import test from 'node:test';
import { CALENDAR_FIELDS, createGoogleCalendarService } from './googleCalendarService.js';

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

// Cada from() abre uma consulta própria; `respostas` responde na ordem.
function fakeSupabase({ respostas = [], lancar = false } = {}) {
  const consultas = [];
  let indice = 0;
  function proximaResposta() {
    if (lancar) throw new Error('falhou');
    const resposta = respostas[indice] ?? { data: null, error: null };
    indice += 1;
    return resposta;
  }
  return {
    consultas,
    auth: { getSession: async () => ({ data: { session: { access_token: 'jwt-token' } } }) },
    from(tabela) {
      const chamadas = [['from', tabela]];
      consultas.push(chamadas);
      const builder = {
        select(campos) { chamadas.push(['select', campos]); return builder; },
        update(valores) { chamadas.push(['update', valores]); return builder; },
        eq(coluna, valor) { chamadas.push(['eq', coluna, valor]); return builder; },
        async maybeSingle() { return proximaResposta(); },
        then(resolve, reject) {
          try { resolve(proximaResposta()); } catch (erro) { reject(erro); }
        },
      };
      return builder;
    },
  };
}

function makeService({ supabase = fakeSupabase(), fetchImpl = async () => jsonResponse(200, {}) } = {}) {
  return createGoogleCalendarService({
    supabase,
    supabaseUrl: 'https://demo.supabase.co',
    supabaseAnonKey: 'anon-key',
    fetchImpl,
  });
}

test('listarCalendarios lê as agendas da conexão sem as colunas sem grant', async () => {
  const supabase = fakeSupabase({ respostas: [{ data: [{ id: 'c1' }], error: null }] });
  const { data, error } = await makeService({ supabase }).listarCalendarios({ connectionId: 'conn-1' });
  assert.equal(error, null);
  assert.deepEqual(data, [{ id: 'c1' }]);
  assert.deepEqual(supabase.consultas[0], [
    ['from', 'calendar_connection_calendars'],
    ['select', CALENDAR_FIELDS],
    ['eq', 'connection_id', 'conn-1'],
  ]);
  for (const coluna of ['sync_token', 'channel_id', 'channel_resource_id', 'channel_token', 'sync_lock_until']) {
    assert.ok(!CALENDAR_FIELDS.split(', ').includes(coluna), coluna);
  }
});

test('listarCalendarios: sem conexão devolve lista vazia; erro do banco vira error', async () => {
  const semConexao = fakeSupabase();
  assert.deepEqual(await makeService({ supabase: semConexao }).listarCalendarios({}), { data: [], error: null });
  assert.equal(semConexao.consultas.length, 0);

  const comErro = fakeSupabase({ respostas: [{ data: null, error: { message: 'x' } }] });
  assert.equal((await makeService({ supabase: comErro }).listarCalendarios({ connectionId: 'c' })).error.code, 'CALENDARS_QUERY_FAILED');
});

test('salvarPreferencias grava o destino com UPDATE só em destination_calendar_id', async () => {
  const supabase = fakeSupabase({ respostas: [{ data: { id: 'conn-1', destination_calendar_id: 'g-2' }, error: null }] });
  const { data, error } = await makeService({ supabase }).salvarPreferencias({ connectionId: 'conn-1', destinationCalendarId: 'g-2' });
  assert.equal(error, null);
  assert.deepEqual(data, { destination_calendar_id: 'g-2' });
  assert.deepEqual(supabase.consultas[0], [
    ['from', 'calendar_connections'],
    ['update', { destination_calendar_id: 'g-2' }],
    ['eq', 'id', 'conn-1'],
    ['select', 'id, destination_calendar_id'],
  ]);
});

test('salvarPreferencias grava a leitura com UPDATE só em is_read, preso à conexão', async () => {
  const supabase = fakeSupabase({ respostas: [{ data: { id: 'cal-1', is_read: false }, error: null }] });
  const { data, error } = await makeService({ supabase }).salvarPreferencias({ connectionId: 'conn-1', calendarioId: 'cal-1', lido: false });
  assert.equal(error, null);
  assert.deepEqual(data, { calendario: { id: 'cal-1', is_read: false } });
  assert.deepEqual(supabase.consultas[0], [
    ['from', 'calendar_connection_calendars'],
    ['update', { is_read: false }],
    ['eq', 'id', 'cal-1'],
    ['eq', 'connection_id', 'conn-1'],
    ['select', 'id, is_read'],
  ]);
});

test('salvarPreferencias: recusa do trigger, linha fora da RLS, banco fora e pedido vazio', async () => {
  const recusado = fakeSupabase({ respostas: [{ data: null, error: { code: '23514', message: 'x' } }] });
  assert.equal(
    (await makeService({ supabase: recusado }).salvarPreferencias({ connectionId: 'c', destinationCalendarId: 'g' })).error.code,
    'DESTINATION_NOT_ALLOWED',
  );

  const leituraRecusada = fakeSupabase({ respostas: [{ data: null, error: { code: '23514', message: 'x' } }] });
  assert.equal(
    (await makeService({ supabase: leituraRecusada }).salvarPreferencias({ connectionId: 'c', calendarioId: 'k', lido: true })).error.code,
    'READ_NOT_ALLOWED',
  );

  const semLinha = fakeSupabase({ respostas: [{ data: null, error: null }] });
  assert.equal(
    (await makeService({ supabase: semLinha }).salvarPreferencias({ connectionId: 'c', calendarioId: 'k', lido: true })).error.code,
    'PREFERENCES_SAVE_FAILED',
  );

  const fora = fakeSupabase({ lancar: true });
  assert.equal(
    (await makeService({ supabase: fora }).salvarPreferencias({ connectionId: 'c', destinationCalendarId: 'g' })).error.code,
    'PREFERENCES_SAVE_FAILED',
  );

  const vazio = fakeSupabase();
  for (const pedido of [{}, { connectionId: 'c' }, { connectionId: 'c', calendarioId: 'k' }, { calendarioId: 'k', lido: true }]) {
    assert.equal((await makeService({ supabase: vazio }).salvarPreferencias(pedido)).error.code, 'INVALID_PREFERENCES');
  }
  assert.equal(vazio.consultas.length, 0);
});

test('sincronizarAgora chama google-calendar-sync-now com workspace_id', async () => {
  let pedido;
  const service = makeService({
    fetchImpl: async (url, init) => {
      pedido = { url, init };
      return jsonResponse(200, { sincronizado_em: '2026-10-13T12:00:00Z', calendarios: [] });
    },
  });
  const { data, error } = await service.sincronizarAgora({ workspaceId: 'ws-1' });
  assert.equal(error, null);
  assert.equal(data.sincronizado_em, '2026-10-13T12:00:00Z');
  assert.equal(pedido.url, 'https://demo.supabase.co/functions/v1/google-calendar-sync-now');
  assert.deepEqual(JSON.parse(pedido.init.body), { workspace_id: 'ws-1' });
});

test('sincronizarAgora: função ausente e erro do contrato voltam em error, sem lançar', async () => {
  // Gateway do Supabase sem a função: 404 com corpo fora do contrato.
  const ausente = makeService({ fetchImpl: async () => jsonResponse(404, { code: 'NOT_FOUND', message: 'Requested function was not found' }) });
  assert.equal((await ausente.sincronizarAgora({ workspaceId: 'ws-1' })).error.code, 'REQUEST_FAILED');

  const reconectar = makeService({ fetchImpl: async () => jsonResponse(409, { error: { code: 'RECONNECT_REQUIRED', message: 'x' } }) });
  assert.equal((await reconectar.sincronizarAgora({ workspaceId: 'ws-1' })).error.code, 'RECONNECT_REQUIRED');

  assert.equal((await makeService().sincronizarAgora({})).error.code, 'INVALID_WORKSPACE');
});
