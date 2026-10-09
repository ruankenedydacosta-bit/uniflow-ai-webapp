// Épico #98 (#100): google-calendar-export rodada no Node com Deno.serve e
// fetch simulados (banco em memória, fila com as RPCs da 060 e Google falso).
import assert from 'node:assert/strict';
import test from 'node:test';

const RAIZ = new URL('../../supabase/functions/', import.meta.url);
const WORKSPACE = '11111111-1111-4111-8111-111111111111';
const DONO = '22222222-2222-4222-8222-222222222222';
const ITEM_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const EVENTO_ID = 'uf0f8fad5bd9cb469fa16570867728950e';
const DESTINO = 'app-1@group';

function criarAmbiente() {
  const env = {
    SUPABASE_URL: 'https://projeto.supabase.test',
    SUPABASE_SERVICE_ROLE_KEY: 'service',
    GOOGLE_CALENDAR_CLIENT_ID: 'cliente',
    GOOGLE_CALENDAR_CLIENT_SECRET: 'segredo-do-cliente',
  };
  const db = {
    connections: [{
      id: 'conn-1', user_id: DONO, workspace_id: WORKSPACE, provider: 'google', status: 'active',
      destination_calendar_id: DESTINO, exportacao_inicial_em: '2026-10-01T00:00:00Z', last_error_code: null,
    }],
    members: [{ workspace_id: WORKSPACE, user_id: DONO, status: 'active' }],
    items: [{
      id: ITEM_ID, workspace_id: WORKSPACE, created_by: DONO, title: 'Reunião', description: null, location: null,
      starts_at: '2026-10-15T17:00:00.000Z', ends_at: null, is_all_day: false, has_explicit_time: true,
      item_type: 'meeting', status: 'scheduled', updated_at: '2026-10-09T10:00:00.000Z',
    }],
    links: [],
    queue: [],
    iniciais: [],
  };
  const google = { eventos: new Map(), chamadas: [], forcar: {}, versao: 0 };
  return { env, db, google };
}

function enfileirar(db, linha) {
  db.queue.push({
    id: db.queue.length + 1, agenda_item_id: ITEM_ID, workspace_id: WORKSPACE, user_id: DONO,
    operacao: 'upsert', calendar_id: null, external_id: null, versao: 1, tentativas: 0,
    proxima_tentativa_em: new Date(0).toISOString(), concluida_em: null, ultimo_erro: null, ...linha,
  });
}

function filtrar(linhas, query) {
  return linhas.filter((linha) => {
    for (const [campo, filtro] of query) {
      if (['select', 'limit', 'order'].includes(campo)) continue;
      const atual = linha[campo] ?? null;
      if (filtro === 'is.null') {
        if (atual !== null) return false;
        continue;
      }
      const [, op, valor] = filtro.match(/^(eq)\.(.*)$/s) ?? [];
      if (!op) throw new Error(`filtro não simulado: ${campo}=${filtro}`);
      if (String(atual) !== valor) return false;
    }
    return true;
  });
}

function resposta(status, corpo, cabecalhos = {}) {
  return new Response(corpo === undefined ? null : JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json', ...cabecalhos },
  });
}

function instalarFetch({ db, google }) {
  globalThis.fetch = async (entrada, init = {}) => {
    const url = new URL(String(entrada));
    const metodo = init.method ?? 'GET';
    const corpo = typeof init.body === 'string' && /^[[{]/.test(init.body) ? JSON.parse(init.body) : init.body;
    const query = [...url.searchParams.entries()];
    const agora = Date.now();

    if (url.pathname === '/rest/v1/rpc/verify_google_calendar_dispatch_secret') return resposta(200, corpo.candidate === 'segredo-do-cron');
    if (url.pathname === '/rest/v1/rpc/calendar_connection_get_refresh_token') return resposta(200, 'RT');
    if (url.pathname === '/rest/v1/rpc/google_calendar_export_inicial') {
      db.iniciais.push(corpo.p_connection_id);
      const conexao = db.connections.find((c) => c.id === corpo.p_connection_id);
      conexao.exportacao_inicial_em = new Date().toISOString();
      return resposta(200, 0);
    }
    if (url.pathname === '/rest/v1/rpc/google_calendar_export_reservar') {
      const linhas = db.queue.filter((l) => !l.concluida_em && Date.parse(l.proxima_tentativa_em) <= agora);
      for (const linha of linhas) linha.tentativas += 1;
      return resposta(200, linhas.map((l) => ({ ...l })));
    }
    if (url.pathname === '/rest/v1/rpc/google_calendar_export_concluir') {
      const linha = db.queue.find((l) => l.id === corpo.p_id);
      linha.ultimo_erro = corpo.p_erro;
      if (corpo.p_tentar_de_novo_em) {
        if (linha.versao === corpo.p_versao) linha.proxima_tentativa_em = corpo.p_tentar_de_novo_em;
      } else if (linha.versao === corpo.p_versao) linha.concluida_em = new Date().toISOString();
      return resposta(200, !corpo.p_tentar_de_novo_em);
    }

    const tabelas = { calendar_connections: db.connections, workspace_members: db.members, agenda_items: db.items, agenda_item_links: db.links };
    const nome = url.pathname.replace('/rest/v1/', '');
    if (db.falhar?.[nome]) return resposta(db.falhar[nome], { message: 'indisponível' });
    const linhas = tabelas[nome];
    if (linhas) {
      if (metodo === 'GET') return resposta(200, filtrar(linhas, query).map((l) => ({ ...l })));
      if (metodo === 'PATCH') {
        for (const linha of filtrar(linhas, query)) Object.assign(linha, corpo);
        return resposta(204);
      }
      if (metodo === 'DELETE') {
        for (const linha of filtrar(linhas, query)) linhas.splice(linhas.indexOf(linha), 1);
        return resposta(204);
      }
      if (metodo === 'POST' && nome === 'agenda_item_links') {
        if (!db.items.some((i) => i.id === corpo.agenda_item_id)) return resposta(409, { code: '23503' });
        linhas.push({ id: `link-${linhas.length + 1}`, ...corpo });
        return resposta(201);
      }
    }

    if (url.host === 'oauth2.googleapis.com' && url.pathname === '/token') return resposta(200, { access_token: 'AT' });

    if (url.host === 'www.googleapis.com') {
      const caminho = decodeURIComponent(url.pathname.replace('/calendar/v3', ''));
      google.chamadas.push({ metodo, caminho, ifMatch: init.headers?.['If-Match'] ?? null, corpo });
      const forcado = google.forcar[`${metodo} ${caminho}`];
      if (forcado) {
        const { status, corpo: corpoForcado } = typeof forcado === 'number' ? { status: forcado } : forcado;
        return resposta(status, corpoForcado ?? { error: { code: status } });
      }
      const novoEtag = () => `"etag-${(google.versao += 1)}"`;
      const insercao = caminho.match(/^\/calendars\/([^/]+)\/events$/);
      if (insercao && metodo === 'POST') {
        const chave = `${insercao[1]}|${corpo.id}`;
        if (google.eventos.has(chave)) return resposta(409, { error: { code: 409, errors: [{ reason: 'duplicate' }] } });
        const evento = { ...corpo, etag: novoEtag(), updated: new Date().toISOString() };
        google.eventos.set(chave, evento);
        return resposta(200, evento);
      }
      const doEvento = caminho.match(/^\/calendars\/([^/]+)\/events\/([^/]+)$/);
      if (doEvento) {
        const chave = `${doEvento[1]}|${doEvento[2]}`;
        const atual = google.eventos.get(chave);
        if (!atual) return resposta(404, { error: { code: 404 } });
        if (metodo === 'GET') return resposta(200, atual);
        if (metodo === 'DELETE') {
          google.eventos.delete(chave);
          return resposta(204);
        }
        if (metodo === 'PATCH') {
          const ifMatch = init.headers?.['If-Match'];
          if (ifMatch && ifMatch !== atual.etag) return resposta(412, { error: { code: 412 } });
          const evento = { ...atual, ...corpo, etag: novoEtag(), updated: new Date().toISOString() };
          google.eventos.set(chave, evento);
          return resposta(200, evento);
        }
      }
    }
    throw new Error(`fetch não simulado: ${metodo} ${url}`);
  };
}

async function rodarExportacao(ambiente, segredo = 'segredo-do-cron') {
  let handler = null;
  globalThis.Deno = { serve: (fn) => { handler = fn; }, env: { get: (chave) => ambiente.env[chave] } };
  await import(new URL(`google-calendar-export/index.ts?${Math.random()}`, RAIZ).href);
  const response = await handler(new Request('https://funcao.test/', {
    method: 'POST',
    headers: { 'X-Dispatch-Secret': segredo, 'Content-Type': 'application/json' },
    body: '{}',
  }));
  return { status: response.status, corpo: await response.json() };
}

function chamadasAoGoogle(ambiente) {
  return ambiente.google.chamadas.map((c) => `${c.metodo} ${c.caminho}`);
}

test('sem o segredo do cron: 401 e nada é processado', async () => {
  const ambiente = criarAmbiente();
  enfileirar(ambiente.db, {});
  instalarFetch(ambiente);
  const { status } = await rodarExportacao(ambiente, 'errado');
  assert.equal(status, 401);
  assert.equal(ambiente.db.queue[0].tentativas, 0);
  assert.deepEqual(ambiente.google.chamadas, []);
});

test('item novo: cria o evento no destino com id do item e grava o vínculo', async () => {
  const ambiente = criarAmbiente();
  enfileirar(ambiente.db, {});
  instalarFetch(ambiente);
  const { status, corpo } = await rodarExportacao(ambiente);
  assert.equal(status, 200);
  assert.deepEqual(corpo, { exportacao_inicial: 0, processadas: 1, concluidas: 1, reagendadas: 0 });

  assert.deepEqual(chamadasAoGoogle(ambiente), [`POST /calendars/${DESTINO}/events`]);
  const evento = ambiente.google.eventos.get(`${DESTINO}|${EVENTO_ID}`);
  assert.equal(evento.summary, 'Reunião');
  assert.equal(evento.extendedProperties.private.uniflow_item_id, ITEM_ID);

  const [link] = ambiente.db.links;
  assert.equal(link.origin, 'app');
  assert.equal(link.calendar_id, DESTINO);
  assert.equal(link.external_id, EVENTO_ID);
  assert.equal(link.etag, evento.etag);
  assert.ok(ambiente.db.queue[0].concluida_em);
});

test('item editado: PATCH com If-Match e etag novo no vínculo', async () => {
  const ambiente = criarAmbiente();
  enfileirar(ambiente.db, {});
  instalarFetch(ambiente);
  await rodarExportacao(ambiente);
  const etagAntigo = ambiente.db.links[0].etag;

  ambiente.db.items[0].title = 'Reunião remarcada';
  enfileirar(ambiente.db, { versao: 2 });
  ambiente.google.chamadas = [];
  await rodarExportacao(ambiente);

  const [patch] = ambiente.google.chamadas;
  assert.equal(`${patch.metodo} ${patch.caminho}`, `PATCH /calendars/${DESTINO}/events/${EVENTO_ID}`);
  assert.equal(patch.ifMatch, etagAntigo);
  assert.equal(ambiente.google.eventos.get(`${DESTINO}|${EVENTO_ID}`).summary, 'Reunião remarcada');
  assert.notEqual(ambiente.db.links[0].etag, etagAntigo);
});

test('412 com o evento mais novo no Google: não sobrescreve, a importação traz a mudança', async () => {
  const ambiente = criarAmbiente();
  ambiente.google.eventos.set(`${DESTINO}|${EVENTO_ID}`, {
    id: EVENTO_ID, summary: 'Editado no Google', etag: '"etag-google"', updated: '2026-10-09T12:00:00.000Z',
  });
  ambiente.db.links.push({ id: 'link-1', agenda_item_id: ITEM_ID, provider: 'google', calendar_id: DESTINO, external_id: EVENTO_ID, etag: '"etag-velho"', origin: 'app' });
  enfileirar(ambiente.db, {});
  instalarFetch(ambiente);
  await rodarExportacao(ambiente);

  assert.deepEqual(chamadasAoGoogle(ambiente), [
    `PATCH /calendars/${DESTINO}/events/${EVENTO_ID}`,
    `GET /calendars/${DESTINO}/events/${EVENTO_ID}`,
  ]);
  assert.equal(ambiente.google.eventos.get(`${DESTINO}|${EVENTO_ID}`).summary, 'Editado no Google');
  assert.equal(ambiente.db.queue[0].ultimo_erro, 'google_mais_novo');
});

test('412 com o item mais novo no app: repete o PATCH com o etag atual', async () => {
  const ambiente = criarAmbiente();
  ambiente.google.eventos.set(`${DESTINO}|${EVENTO_ID}`, {
    id: EVENTO_ID, summary: 'Antigo', etag: '"etag-google"', updated: '2026-10-08T12:00:00.000Z',
  });
  ambiente.db.links.push({ id: 'link-1', agenda_item_id: ITEM_ID, provider: 'google', calendar_id: DESTINO, external_id: EVENTO_ID, etag: '"etag-velho"', origin: 'app' });
  enfileirar(ambiente.db, {});
  instalarFetch(ambiente);
  await rodarExportacao(ambiente);

  const patches = ambiente.google.chamadas.filter((c) => c.metodo === 'PATCH');
  assert.deepEqual(patches.map((c) => c.ifMatch), ['"etag-velho"', '"etag-google"']);
  assert.equal(ambiente.google.eventos.get(`${DESTINO}|${EVENTO_ID}`).summary, 'Reunião');
  assert.ok(ambiente.db.queue[0].concluida_em);
});

test('insert repetido (409): reaproveita o evento e grava o vínculo, sem duplicar', async () => {
  const ambiente = criarAmbiente();
  ambiente.google.eventos.set(`${DESTINO}|${EVENTO_ID}`, { id: EVENTO_ID, summary: 'Reunião', status: 'cancelled', etag: '"e1"' });
  enfileirar(ambiente.db, {});
  instalarFetch(ambiente);
  await rodarExportacao(ambiente);

  assert.deepEqual(chamadasAoGoogle(ambiente), [
    `POST /calendars/${DESTINO}/events`,
    `PATCH /calendars/${DESTINO}/events/${EVENTO_ID}`,
  ]);
  assert.equal(ambiente.google.eventos.size, 1);
  assert.equal(ambiente.google.eventos.get(`${DESTINO}|${EVENTO_ID}`).status, 'confirmed');
  assert.equal(ambiente.db.links.length, 1);
});

test('Google fora do ar: a linha volta para a fila e o item fica sem vínculo', async () => {
  const ambiente = criarAmbiente();
  ambiente.google.forcar[`POST /calendars/${DESTINO}/events`] = 503;
  enfileirar(ambiente.db, {});
  instalarFetch(ambiente);
  const antes = Date.now();
  const { corpo } = await rodarExportacao(ambiente);

  assert.equal(corpo.reagendadas, 1);
  const [linha] = ambiente.db.queue;
  assert.equal(linha.concluida_em, null);
  assert.equal(linha.ultimo_erro, 'google_503');
  const espera = Date.parse(linha.proxima_tentativa_em) - antes;
  assert.ok(espera >= 59_000 && espera <= 61_000, `primeira espera de 1 minuto, foi ${espera}ms`);
  assert.deepEqual(ambiente.db.links, []);
});

test('destino apagado no Google (404): marca destino_ausente na conexão e tenta de novo depois', async () => {
  const ambiente = criarAmbiente();
  ambiente.google.forcar[`POST /calendars/${DESTINO}/events`] = 404;
  enfileirar(ambiente.db, {});
  instalarFetch(ambiente);
  await rodarExportacao(ambiente);

  assert.equal(ambiente.db.connections[0].last_error_code, 'destino_ausente');
  assert.equal(ambiente.db.queue[0].concluida_em, null);
});

test('item cancelado: apaga o evento e o vínculo', async () => {
  const ambiente = criarAmbiente();
  ambiente.google.eventos.set(`${DESTINO}|${EVENTO_ID}`, { id: EVENTO_ID, etag: '"e1"' });
  ambiente.db.links.push({ id: 'link-1', agenda_item_id: ITEM_ID, provider: 'google', calendar_id: DESTINO, external_id: EVENTO_ID, etag: '"e1"', origin: 'app' });
  ambiente.db.items[0].status = 'cancelled';
  enfileirar(ambiente.db, { operacao: 'delete', calendar_id: DESTINO, external_id: EVENTO_ID });
  instalarFetch(ambiente);
  await rodarExportacao(ambiente);

  assert.deepEqual(chamadasAoGoogle(ambiente), [`DELETE /calendars/${DESTINO}/events/${EVENTO_ID}`]);
  assert.equal(ambiente.google.eventos.size, 0);
  assert.deepEqual(ambiente.db.links, []);
  assert.ok(ambiente.db.queue[0].concluida_em);
});

test('item excluído: apaga o evento guardado na linha da fila; já apagado no Google (410) conta como feito', async () => {
  const ambiente = criarAmbiente();
  ambiente.db.items = [];
  ambiente.google.forcar[`DELETE /calendars/${DESTINO}/events/${EVENTO_ID}`] = 410;
  enfileirar(ambiente.db, { operacao: 'delete', calendar_id: DESTINO, external_id: EVENTO_ID });
  instalarFetch(ambiente);
  await rodarExportacao(ambiente);

  assert.deepEqual(chamadasAoGoogle(ambiente), [`DELETE /calendars/${DESTINO}/events/${EVENTO_ID}`]);
  assert.ok(ambiente.db.queue[0].concluida_em);
});

test('item que veio do Google: cancelar no app não toca no Google', async () => {
  const ambiente = criarAmbiente();
  ambiente.db.links.push({ id: 'link-1', agenda_item_id: ITEM_ID, provider: 'google', calendar_id: 'eu@gmail.test', external_id: 'evgoogle', etag: '"e1"', origin: 'provider' });
  ambiente.db.items[0].status = 'cancelled';
  enfileirar(ambiente.db, { operacao: 'delete', calendar_id: 'eu@gmail.test', external_id: 'evgoogle' });
  instalarFetch(ambiente);
  await rodarExportacao(ambiente);

  assert.deepEqual(ambiente.google.chamadas, []);
  assert.equal(ambiente.db.links.length, 1);
  assert.ok(ambiente.db.queue[0].concluida_em);
});

test('sem conexão ativa ou dono fora do espaço: conclui sem chamar o Google', async () => {
  for (const preparar of [
    (ambiente) => { ambiente.db.connections[0].status = 'error'; },
    (ambiente) => { ambiente.db.members = []; },
  ]) {
    const ambiente = criarAmbiente();
    preparar(ambiente);
    enfileirar(ambiente.db, {});
    instalarFetch(ambiente);
    await rodarExportacao(ambiente);
    assert.deepEqual(ambiente.google.chamadas, []);
    assert.ok(ambiente.db.queue[0].concluida_em);
  }
});

test('item excluído durante o insert: apaga o evento criado em vez de deixar órfão', async () => {
  const ambiente = criarAmbiente();
  enfileirar(ambiente.db, {});
  instalarFetch(ambiente);
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = async (entrada, init = {}) => {
    const response = await fetchOriginal(entrada, init);
    // O item some logo depois que o Google cria o evento.
    if ((init.method ?? 'GET') === 'POST' && String(entrada).includes('/events')) ambiente.db.items = [];
    return response;
  };
  await rodarExportacao(ambiente);

  assert.deepEqual(chamadasAoGoogle(ambiente), [
    `POST /calendars/${DESTINO}/events`,
    `DELETE /calendars/${DESTINO}/events/${EVENTO_ID}`,
  ]);
  assert.equal(ambiente.google.eventos.size, 0);
  assert.deepEqual(ambiente.db.links, []);
});

test('conexão sem exportação inicial: chama a RPC uma vez', async () => {
  const ambiente = criarAmbiente();
  ambiente.db.connections[0].exportacao_inicial_em = null;
  instalarFetch(ambiente);
  await rodarExportacao(ambiente);
  await rodarExportacao(ambiente);
  assert.deepEqual(ambiente.db.iniciais, ['conn-1']);
});

test('Google recusa o corpo (400): conclui com o motivo, sem repetir 30 vezes', async () => {
  const ambiente = criarAmbiente();
  ambiente.google.forcar[`POST /calendars/${DESTINO}/events`] = 400;
  enfileirar(ambiente.db, {});
  instalarFetch(ambiente);
  await rodarExportacao(ambiente);
  assert.ok(ambiente.db.queue[0].concluida_em);
  assert.equal(ambiente.db.queue[0].ultimo_erro, 'google_400');
});

test('escopo faltando ao atualizar: marca a conexão para pedir reconexão e tenta de novo', async () => {
  const ambiente = criarAmbiente();
  ambiente.google.eventos.set(`${DESTINO}|${EVENTO_ID}`, { id: EVENTO_ID, etag: '"e1"' });
  ambiente.db.links.push({ id: 'link-1', agenda_item_id: ITEM_ID, provider: 'google', calendar_id: DESTINO, external_id: EVENTO_ID, etag: '"e1"', origin: 'app' });
  ambiente.google.forcar[`PATCH /calendars/${DESTINO}/events/${EVENTO_ID}`] = {
    status: 403,
    corpo: { error: { code: 403, errors: [{ reason: 'insufficientPermissions' }] } },
  };
  enfileirar(ambiente.db, {});
  instalarFetch(ambiente);
  await rodarExportacao(ambiente);
  assert.equal(ambiente.db.connections[0].last_error_code, 'escopo_insuficiente');
  assert.equal(ambiente.db.queue[0].concluida_em, null);
});

test('banco fora ao checar o membro: a linha volta para a fila, não é descartada', async () => {
  const ambiente = criarAmbiente();
  ambiente.db.falhar = { workspace_members: 503 };
  enfileirar(ambiente.db, {});
  instalarFetch(ambiente);
  await rodarExportacao(ambiente);
  assert.equal(ambiente.db.queue[0].concluida_em, null);
  assert.equal(ambiente.db.queue[0].ultimo_erro, 'banco_indisponivel');
  assert.deepEqual(ambiente.google.chamadas, []);
});

test('exportação inicial roda mesmo com o dono fora do espaço, para não ficar pendente para sempre', async () => {
  const ambiente = criarAmbiente();
  ambiente.db.connections[0].exportacao_inicial_em = null;
  ambiente.db.members = [];
  instalarFetch(ambiente);
  await rodarExportacao(ambiente);
  assert.deepEqual(ambiente.db.iniciais, ['conn-1']);
});
