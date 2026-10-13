// Épico #98 (#101): google-calendar-webhook, google-calendar-sync-now e
// google-calendar-sync-dispatch rodados no Node com Deno.serve e fetch
// simulados (banco em memória com as RPCs da 073 e Google falso).
import assert from 'node:assert/strict';
import test from 'node:test';

const RAIZ = new URL('../../supabase/functions/', import.meta.url);
const ESPACO = '11111111-1111-4111-8111-111111111111';
const DONO = '22222222-2222-4222-8222-222222222222';
const CANAL = '44444444-4444-4444-8444-444444444444';
const PRIMARIO = 'pessoa@gmail.com';
const APP = 'app-1@group';

function criarAmbiente() {
  const env = {
    SUPABASE_URL: 'https://projeto.supabase.test',
    SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: 'service',
    GOOGLE_CALENDAR_CLIENT_ID: 'cliente',
    GOOGLE_CALENDAR_CLIENT_SECRET: 'segredo-do-cliente',
    APP_ALLOWED_ORIGINS: 'https://app.test',
  };
  const db = {
    connections: [{
      id: 'conn-1', user_id: DONO, workspace_id: ESPACO, provider: 'google', status: 'active',
      app_calendar_id: APP, last_synced_at: null, last_error_code: null,
    }],
    members: [{ workspace_id: ESPACO, user_id: DONO, status: 'active', role: 'member' }],
    calendars: [
      {
        id: 'cal-1', connection_id: 'conn-1', external_calendar_id: PRIMARIO, is_read: true, is_primary: true,
        access_role: 'owner', sync_token: 'token-1', last_full_sync_at: new Date().toISOString(),
        channel_id: CANAL, channel_resource_id: 'res-1', channel_token: 'tok-canal',
        channel_expires_at: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(), sync_lock_until: null,
      },
      {
        id: 'cal-2', connection_id: 'conn-1', external_calendar_id: APP, is_read: false, is_primary: false,
        access_role: 'owner', sync_token: 'token-velho', last_full_sync_at: null,
        channel_id: '55555555-5555-4555-8555-555555555555', channel_resource_id: 'res-2', channel_token: 'tok-2',
        channel_expires_at: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(), sync_lock_until: null,
      },
    ],
    items: [],
    links: [],
    rpc: [],
  };
  const google = {
    chamadas: [],
    calendarList: [
      { id: PRIMARIO, accessRole: 'owner', primary: true, summary: 'Pessoa' },
      { id: APP, accessRole: 'owner', summary: 'UniFlow · Casa' },
    ],
    // calendário -> função (query) -> {status, corpo}
    eventos: {},
  };
  return { env, db, google };
}

function resposta(status, corpo) {
  return new Response(corpo === undefined ? null : JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function casa(linha, campo, filtro) {
  const atual = linha[campo] ?? null;
  if (filtro === 'is.null') return atual === null;
  if (filtro === 'not.is.null') return atual !== null;
  const lista = filtro.match(/^in\.\((.*)\)$/s);
  if (lista) return lista[1].split(',').includes(String(atual));
  const [, op, valor] = filtro.match(/^(eq|neq)\.(.*)$/s) ?? [];
  if (!op) throw new Error(`filtro não simulado: ${campo}=${filtro}`);
  return op === 'eq' ? String(atual) === valor : String(atual) !== valor;
}

function filtrar(linhas, query) {
  return linhas.filter((linha) => query.every(([campo, filtro]) => (
    ['select', 'limit', 'order', 'on_conflict'].includes(campo) || casa(linha, campo, filtro)
  )));
}

function instalarFetch({ db, google }) {
  globalThis.fetch = async (entrada, init = {}) => {
    const url = new URL(String(entrada));
    const metodo = init.method ?? 'GET';
    const corpo = typeof init.body === 'string' && /^[[{]/.test(init.body) ? JSON.parse(init.body) : init.body;
    const query = [...url.searchParams.entries()];

    if (url.pathname === '/auth/v1/user') {
      return init.headers?.Authorization === 'Bearer jwt-do-dono' ? resposta(200, { id: DONO }) : resposta(401, {});
    }

    const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/(.+)$/)?.[1];
    if (rpc) {
      db.rpc.push({ nome: rpc, corpo });
      if (rpc === 'verify_google_calendar_dispatch_secret') return resposta(200, corpo.candidate === 'segredo-do-cron');
      if (rpc === 'calendar_connection_get_refresh_token') return resposta(200, 'RT');
      if (rpc === 'google_calendar_sync_candidatas') {
        return resposta(200, db.connections.filter((c) => c.status === 'active').map(({ id, user_id, workspace_id, app_calendar_id }) => ({ id, user_id, workspace_id, app_calendar_id })));
      }
      if (rpc === 'google_calendar_sync_travar') {
        const calendario = db.calendars.find((c) => c.id === corpo.p_calendario_id);
        if (!calendario?.is_read || (calendario.sync_lock_until && Date.parse(calendario.sync_lock_until) > Date.now())) return resposta(200, false);
        calendario.sync_lock_until = new Date(Date.now() + corpo.p_segundos * 1000).toISOString();
        return resposta(200, true);
      }
      if (rpc === 'google_calendar_import_estado') {
        return resposta(200, db.links
          .filter((l) => l.calendar_id === corpo.p_calendar_id && corpo.p_external_ids.includes(l.external_id))
          .map((l) => ({ external_id: l.external_id, vinculo: { ...l }, item: { ...db.items.find((i) => i.id === l.agenda_item_id) } })));
      }
      if (rpc === 'google_calendar_import_aplicar') {
        const contagem = { inseridos: 0, atualizados: 0, cancelados: 0 };
        for (const op of corpo.p_operacoes) {
          const link = db.links.find((l) => l.calendar_id === corpo.p_calendar_id && l.external_id === op.external_id);
          if (op.tipo === 'inserir' && !link) {
            const id = `item-${db.items.length + 1}`;
            db.items.push({ id, workspace_id: ESPACO, created_by: DONO, status: 'scheduled', updated_at: new Date().toISOString(), ...op.campos });
            db.links.push({ id: `link-${db.links.length + 1}`, agenda_item_id: id, calendar_id: corpo.p_calendar_id, external_id: op.external_id, etag: op.etag, origin: 'provider' });
            contagem.inseridos += 1;
          } else if (op.tipo === 'atualizar' && link) {
            Object.assign(db.items.find((i) => i.id === op.agenda_item_id), op.campos);
            link.etag = op.etag;
            contagem.atualizados += 1;
          } else if (op.tipo === 'cancelar' && link) {
            db.items.find((i) => i.id === op.agenda_item_id).status = 'cancelled';
            link.etag = op.etag;
            contagem.cancelados += 1;
          }
        }
        return resposta(200, contagem);
      }
      if (rpc === 'google_calendar_import_varrer') return db.varreduraFalha ? resposta(503, {}) : resposta(200, 0);
      throw new Error(`rpc não simulada: ${rpc}`);
    }

    const tabelas = { calendar_connections: db.connections, workspace_members: db.members, calendar_connection_calendars: db.calendars };
    const nome = url.pathname.replace('/rest/v1/', '');
    const linhas = tabelas[nome];
    if (linhas) {
      if (metodo === 'GET') {
        const achadas = filtrar(linhas, query).map((linha) => ({ ...linha }));
        if (nome === 'calendar_connection_calendars' && /conexao:calendar_connections/.test(url.searchParams.get('select') ?? '')) {
          for (const linha of achadas) linha.conexao = { ...db.connections.find((c) => c.id === linha.connection_id) };
        }
        return resposta(200, achadas);
      }
      if (metodo === 'PATCH') {
        const achadas = filtrar(linhas, query);
        for (const linha of achadas) Object.assign(linha, corpo);
        return /return=representation/.test(init.headers?.Prefer ?? '') ? resposta(200, achadas.map((l) => ({ id: l.id }))) : resposta(204);
      }
      if (metodo === 'DELETE') {
        for (const linha of filtrar(linhas, query)) linhas.splice(linhas.indexOf(linha), 1);
        return resposta(204);
      }
      if (metodo === 'POST' && nome === 'calendar_connection_calendars') {
        for (const nova of corpo) {
          const atual = linhas.find((l) => l.connection_id === nova.connection_id && l.external_calendar_id === nova.external_calendar_id);
          if (atual) Object.assign(atual, nova);
          else linhas.push({ id: `cal-${linhas.length + 1}`, sync_token: null, channel_id: null, ...nova });
        }
        return resposta(201);
      }
    }

    if (url.host === 'oauth2.googleapis.com' && url.pathname === '/token') return resposta(200, { access_token: 'AT' });

    if (url.host === 'www.googleapis.com') {
      const caminho = decodeURIComponent(url.pathname.replace('/calendar/v3', ''));
      google.chamadas.push({ metodo, caminho, query: Object.fromEntries(url.searchParams), corpo });
      if (caminho === '/users/me/calendarList') return resposta(200, { items: google.calendarList });
      if (caminho === '/channels/stop') return resposta(204);
      const watch = caminho.match(/^\/calendars\/([^/]+)\/events\/watch$/);
      if (watch) return resposta(200, { id: corpo.id, resourceId: `res-${watch[1]}`, expiration: String(Date.now() + 7 * 24 * 3600 * 1000) });
      const lista = caminho.match(/^\/calendars\/([^/]+)\/events$/);
      if (lista && metodo === 'GET') {
        const gerador = google.eventos[lista[1]];
        const { status = 200, corpo: corpoDaLista } = gerador ? gerador(Object.fromEntries(url.searchParams)) : { corpo: { items: [], nextSyncToken: 'token-novo' } };
        return resposta(status, corpoDaLista);
      }
    }
    throw new Error(`fetch não simulado: ${metodo} ${url}`);
  };
}

async function carregar(ambiente, funcao) {
  let handler = null;
  globalThis.Deno = { serve: (fn) => { handler = fn; }, env: { get: (chave) => ambiente.env[chave] } };
  await import(new URL(`${funcao}/index.ts?${Math.random()}`, RAIZ).href);
  return handler;
}

async function avisar(ambiente, cabecalhos) {
  const handler = await carregar(ambiente, 'google-calendar-webhook');
  const response = await handler(new Request('https://funcao.test/', {
    method: 'POST',
    headers: {
      'X-Goog-Channel-ID': CANAL,
      'X-Goog-Channel-Token': 'tok-canal',
      'X-Goog-Resource-ID': 'res-1',
      'X-Goog-Resource-State': 'exists',
      ...cabecalhos,
    },
  }));
  return response.status;
}

async function sincronizarAgora(ambiente, { jwt = 'jwt-do-dono', workspaceId = ESPACO } = {}) {
  const handler = await carregar(ambiente, 'google-calendar-sync-now');
  const response = await handler(new Request('https://funcao.test/', {
    method: 'POST',
    headers: { Origin: 'https://app.test', Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspace_id: workspaceId }),
  }));
  return { status: response.status, corpo: await response.json() };
}

const eventoNovo = {
  id: 'evt-1', etag: '"e1"', status: 'confirmed', updated: new Date().toISOString(), summary: 'Consulta',
  start: { dateTime: new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString() },
  end: { dateTime: new Date(Date.now() + 2 * 24 * 3600 * 1000 + 3600 * 1000).toISOString() },
};

function chamadasAoGoogle(ambiente) {
  return ambiente.google.chamadas.map((c) => `${c.metodo} ${c.caminho}`);
}

test('webhook: canal desconhecido, token errado ou recurso errado não sincroniza nada', async () => {
  for (const cabecalhos of [
    { 'X-Goog-Channel-ID': '99999999-9999-4999-8999-999999999999' },
    { 'X-Goog-Channel-Token': 'tok-errado' },
    { 'X-Goog-Resource-ID': 'res-outro' },
    { 'X-Goog-Channel-ID': 'nao-e-uuid' },
  ]) {
    const ambiente = criarAmbiente();
    instalarFetch(ambiente);
    assert.equal(await avisar(ambiente, cabecalhos), 200);
    assert.deepEqual(ambiente.google.chamadas, []);
    assert.deepEqual(ambiente.db.rpc, []);
  }
});

test('webhook: aviso de canal criado (sync) não busca nada', async () => {
  const ambiente = criarAmbiente();
  instalarFetch(ambiente);
  assert.equal(await avisar(ambiente, { 'X-Goog-Resource-State': 'sync' }), 200);
  assert.deepEqual(ambiente.google.chamadas, []);
});

test('webhook: aviso válido roda o sync incremental, insere o evento e guarda o token novo', async () => {
  const ambiente = criarAmbiente();
  ambiente.google.eventos[PRIMARIO] = (query) => {
    assert.equal(query.syncToken, 'token-1');
    assert.equal(query.singleEvents, 'true');
    assert.equal(query.timeMin, undefined);
    return { corpo: { items: [eventoNovo], nextSyncToken: 'token-2' } };
  };
  instalarFetch(ambiente);
  assert.equal(await avisar(ambiente, {}), 200);

  assert.equal(ambiente.db.items.length, 1);
  assert.equal(ambiente.db.items[0].title, 'Consulta');
  assert.equal(ambiente.db.items[0].item_type, 'meeting');
  assert.equal(ambiente.db.links[0].origin, 'provider');
  const calendario = ambiente.db.calendars[0];
  assert.equal(calendario.sync_token, 'token-2');
  assert.equal(calendario.sync_lock_until, null);
  assert.equal(calendario.last_sync_error, null);
  // O webhook não mexe na lista de calendários nem nos canais.
  assert.deepEqual(chamadasAoGoogle(ambiente), [`GET /calendars/${PRIMARIO}/events`]);
});

test('webhook: o mesmo aviso de novo não duplica o item', async () => {
  const ambiente = criarAmbiente();
  ambiente.google.eventos[PRIMARIO] = () => ({ corpo: { items: [eventoNovo], nextSyncToken: 'token-2' } });
  instalarFetch(ambiente);
  await avisar(ambiente, {});
  ambiente.db.calendars[0].sync_token = 'token-1';
  await avisar(ambiente, {});
  assert.equal(ambiente.db.items.length, 1);
  assert.equal(ambiente.db.links.length, 1);
});

test('webhook: conexão com erro ou dono fora do espaço não sincroniza', async () => {
  const comErro = criarAmbiente();
  comErro.db.connections[0].status = 'error';
  instalarFetch(comErro);
  await avisar(comErro, {});
  assert.deepEqual(comErro.google.chamadas, []);

  const saiu = criarAmbiente();
  saiu.db.members[0].status = 'removed';
  instalarFetch(saiu);
  await avisar(saiu, {});
  assert.deepEqual(saiu.google.chamadas, []);
  assert.equal(saiu.db.rpc.some((r) => r.nome === 'google_calendar_import_aplicar'), false);
});

test('syncToken vencido (410): refaz o sync completo da janela e varre', async () => {
  const ambiente = criarAmbiente();
  const pedidos = [];
  ambiente.google.eventos[PRIMARIO] = (query) => {
    pedidos.push(query);
    if (query.syncToken) return { status: 410, corpo: { error: { code: 410 } } };
    return { corpo: { items: [eventoNovo], nextSyncToken: 'token-completo' } };
  };
  instalarFetch(ambiente);
  await avisar(ambiente, {});

  assert.equal(pedidos.length, 2);
  assert.ok(pedidos[1].timeMin && pedidos[1].timeMax);
  const dias = (Date.parse(pedidos[1].timeMax) - Date.parse(pedidos[1].timeMin)) / (24 * 3600 * 1000);
  assert.equal(Math.round(dias), 395);
  assert.equal(ambiente.db.calendars[0].sync_token, 'token-completo');
  assert.ok(ambiente.db.calendars[0].last_full_sync_at);
  assert.ok(ambiente.db.rpc.some((r) => r.nome === 'google_calendar_import_varrer'));
  assert.equal(ambiente.db.items.length, 1);
});

test('sync-now: sem conexão 404, conexão com erro 409', async () => {
  const semConexao = criarAmbiente();
  semConexao.db.connections = [];
  instalarFetch(semConexao);
  const nada = await sincronizarAgora(semConexao);
  assert.equal(nada.status, 404);
  assert.equal(nada.corpo.error.code, 'NOT_CONNECTED');

  const comErro = criarAmbiente();
  comErro.db.connections[0].status = 'error';
  instalarFetch(comErro);
  const reconectar = await sincronizarAgora(comErro);
  assert.equal(reconectar.status, 409);
  assert.equal(reconectar.corpo.error.code, 'RECONNECT_REQUIRED');
});

test('sync-now: lista uma vez, encerra o canal do calendário não lido e sincroniza o lido', async () => {
  const ambiente = criarAmbiente();
  ambiente.google.eventos[PRIMARIO] = () => ({ corpo: { items: [eventoNovo], nextSyncToken: 'token-2' } });
  instalarFetch(ambiente);
  const { status, corpo } = await sincronizarAgora(ambiente);

  assert.equal(status, 200);
  assert.ok(corpo.sincronizado_em);
  assert.deepEqual(corpo.calendarios, [
    { external_calendar_id: PRIMARIO, inseridos: 1, atualizados: 0, cancelados: 0, status: 'ok' },
  ]);
  assert.equal(chamadasAoGoogle(ambiente).filter((c) => c === 'GET /users/me/calendarList').length, 1);
  assert.ok(chamadasAoGoogle(ambiente).includes('POST /channels/stop'));
  const naoLido = ambiente.db.calendars.find((c) => c.external_calendar_id === APP);
  assert.equal(naoLido.channel_id, null);
  assert.equal(naoLido.sync_token, null);
  // A lista preserva o calendário do espaço.
  assert.equal(naoLido.is_app_created, true);
  assert.ok(ambiente.db.connections[0].last_synced_at);
});

test('sync-now: menos de 30 s depois devolve skipped sem chamar o Google', async () => {
  const ambiente = criarAmbiente();
  ambiente.db.connections[0].last_synced_at = new Date(Date.now() - 5000).toISOString();
  instalarFetch(ambiente);
  const { status, corpo } = await sincronizarAgora(ambiente);
  assert.equal(status, 200);
  assert.deepEqual(corpo.calendarios, [
    { external_calendar_id: PRIMARIO, inseridos: 0, atualizados: 0, cancelados: 0, status: 'skipped' },
  ]);
  assert.deepEqual(ambiente.google.chamadas, []);
});

test('sync-now: Google fora do ar ao listar calendários vira GOOGLE_UNAVAILABLE', async () => {
  const ambiente = criarAmbiente();
  instalarFetch(ambiente);
  const original = globalThis.fetch;
  globalThis.fetch = async (entrada, init) => (String(entrada).includes('/calendarList') ? resposta(503, {}) : original(entrada, init));
  const { status, corpo } = await sincronizarAgora(ambiente);
  assert.equal(status, 502);
  assert.equal(corpo.error.code, 'GOOGLE_UNAVAILABLE');
});

test('sync-now: calendário em sync por outra execução volta skipped', async () => {
  const ambiente = criarAmbiente();
  ambiente.db.calendars[0].sync_lock_until = new Date(Date.now() + 60000).toISOString();
  instalarFetch(ambiente);
  const { corpo } = await sincronizarAgora(ambiente);
  assert.equal(corpo.calendarios[0].status, 'skipped');
});

test('sync-dispatch: segredo errado 401; certo cria o canal que falta e renova', async () => {
  const ambiente = criarAmbiente();
  ambiente.db.calendars[0].channel_id = null;
  ambiente.db.calendars[0].channel_resource_id = null;
  instalarFetch(ambiente);
  const handler = await carregar(ambiente, 'google-calendar-sync-dispatch');

  const negado = await handler(new Request('https://funcao.test/', { method: 'POST', headers: { 'X-Dispatch-Secret': 'errado' } }));
  assert.equal(negado.status, 401);
  assert.deepEqual(ambiente.google.chamadas, []);

  const aceito = await handler(new Request('https://funcao.test/', { method: 'POST', headers: { 'X-Dispatch-Secret': 'segredo-do-cron' } }));
  assert.equal(aceito.status, 200);
  const watch = ambiente.google.chamadas.find((c) => c.caminho === `/calendars/${PRIMARIO}/events/watch`);
  assert.ok(watch);
  assert.equal(watch.corpo.address, 'https://projeto.supabase.test/functions/v1/google-calendar-webhook');
  assert.equal(watch.corpo.type, 'web_hook');
  const calendario = ambiente.db.calendars[0];
  assert.equal(calendario.channel_id, watch.corpo.id);
  assert.equal(calendario.channel_token, watch.corpo.token);
  assert.equal(calendario.channel_resource_id, `res-${PRIMARIO}`);
});

test('varredura que falha não marca o sync completo como feito', async () => {
  const ambiente = criarAmbiente();
  const ultimoCompleto = '2026-10-01T00:00:00.000Z';
  ambiente.db.calendars[0].sync_token = null;
  ambiente.db.calendars[0].last_full_sync_at = ultimoCompleto;
  ambiente.db.varreduraFalha = true;
  instalarFetch(ambiente);
  await avisar(ambiente, {});
  const calendario = ambiente.db.calendars[0];
  assert.equal(calendario.last_full_sync_at, ultimoCompleto);
  assert.equal(calendario.last_sync_error, 'varredura_falhou');
  assert.equal(calendario.sync_token, 'token-novo');
});
