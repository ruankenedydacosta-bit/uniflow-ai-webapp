// Épico #98 (#99): fluxo connect -> callback -> confirm das Edge Functions,
// rodado no Node com Deno.serve e fetch simulados (banco em memória e Google
// falso). Cobre a correção do link repassado: o callback só deixa a conexão
// pendente, e quem ativa é a google-calendar-confirm, com a sessão de quem
// iniciou o fluxo.
import assert from 'node:assert/strict';
import test from 'node:test';

const RAIZ = new URL('../../supabase/functions/', import.meta.url);
const WORKSPACE = '11111111-1111-4111-8111-111111111111';
const DONO = 'user-dono';
const OUTRA = 'user-outra';
const ESCOPOS = [
  'https://www.googleapis.com/auth/calendar.app.created',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.events.owned',
].join(' ');

function criarAmbiente() {
  const env = {
    SUPABASE_URL: 'https://projeto.supabase.test',
    SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: 'service',
    GOOGLE_CALENDAR_CLIENT_ID: 'cliente',
    GOOGLE_CALENDAR_CLIENT_SECRET: 'segredo-do-cliente',
    GOOGLE_CALENDAR_REDIRECT_URI: 'https://projeto.supabase.test/functions/v1/google-calendar-oauth-callback',
    GOOGLE_CALENDAR_ALLOWED_USER_IDS: `${DONO},${OUTRA}`,
    APP_ALLOWED_ORIGINS: 'https://app.test',
  };
  const db = {
    states: [],
    connections: [],
    calendars: [],
    links: [],
    secrets: new Map(),
    members: [{ workspace_id: WORKSPACE, user_id: DONO, status: 'active' }, { workspace_id: WORKSPACE, user_id: OUTRA, status: 'active' }],
  };
  const google = { calendars: [{ id: 'eu@gmail.test', accessRole: 'owner', primary: true, timeZone: 'America/Sao_Paulo' }], criados: 0, revogados: [] };
  return { env, db, google };
}

function filtrar(linhas, query) {
  return linhas.filter((linha) => {
    for (const [campo, filtro] of query) {
      if (['select', 'limit', 'on_conflict'].includes(campo)) continue;
      const [, op, valor] = filtro.match(/^(eq|neq|gte|gt|lte|lt|not\.in)\.(.*)$/s) ?? [];
      if (!op) throw new Error(`filtro não simulado: ${campo}=${filtro}`);
      const atual = linha[campo] ?? null;
      if (op === 'eq' && String(atual) !== valor) return false;
      if (op === 'neq' && String(atual) === valor) return false;
      if (op === 'gt' && !(atual !== null && atual > valor)) return false;
      if (op === 'lt' && !(atual !== null && atual < valor)) return false;
      if (op === 'lte' && !(atual !== null && atual <= valor)) return false;
      if (op === 'gte' && !(atual !== null && atual >= valor)) return false;
    }
    return true;
  });
}

function resposta(status, corpo) {
  return new Response(corpo === undefined ? null : JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
}

function instalarFetch({ db, google }) {
  globalThis.fetch = async (entrada, init = {}) => {
    const url = new URL(String(entrada));
    const metodo = init.method ?? 'GET';
    const corpo = typeof init.body === 'string' && init.body.startsWith('{') || typeof init.body === 'string' && init.body.startsWith('[')
      ? JSON.parse(init.body) : init.body;
    const query = [...url.searchParams.entries()];
    const tabela = (nome) => ({ calendar_connections: db.connections, calendar_oauth_states: db.states, calendar_connection_calendars: db.calendars, agenda_item_links: db.links, workspace_members: db.members })[nome];

    if (url.pathname === '/auth/v1/user') {
      const token = (init.headers?.Authorization ?? '').replace('Bearer ', '');
      return token.startsWith('jwt-') ? resposta(200, { id: token.slice(4) }) : resposta(401, {});
    }
    if (url.pathname === '/rest/v1/workspaces') return resposta(200, [{ name: 'Ateliê' }]);
    if (url.pathname === '/rest/v1/rpc/calendar_connection_set_refresh_token') {
      db.secrets.set(corpo.p_connection_id, corpo.p_refresh_token);
      return resposta(204);
    }
    if (url.pathname === '/rest/v1/rpc/calendar_connection_get_refresh_token') {
      return resposta(200, db.secrets.get(corpo.p_connection_id) ?? null);
    }
    const nome = url.pathname.replace('/rest/v1/', '');
    const linhas = tabela(nome);
    if (linhas) {
      if (metodo === 'GET') return resposta(200, filtrar(linhas, query));
      if (metodo === 'POST') {
        for (const item of Array.isArray(corpo) ? corpo : [corpo]) {
          if (nome === 'calendar_connections') {
            // Mesmos índices únicos parciais da 055: um por (pessoa, espaço)
            // entre as conexões e outro entre as pendências.
            const pendente = item.status === 'pending';
            const conflito = linhas.find((l) => l.user_id === item.user_id && l.workspace_id === item.workspace_id
              && (l.status === 'pending') === pendente);
            if (conflito) return resposta(409, { code: '23505' });
            db.sequencia = (db.sequencia ?? 0) + 1;
            item.id = `conn-${db.sequencia}`;
            linhas.push({ ...item });
          } else if (nome === 'calendar_connection_calendars') {
            const existente = linhas.find((l) => l.connection_id === item.connection_id && l.external_calendar_id === item.external_calendar_id);
            if (existente) Object.assign(existente, item); else linhas.push({ ...item });
          } else {
            linhas.push({ ...item });
          }
        }
        if (nome === 'calendar_connections') {
          const item = Array.isArray(corpo) ? corpo[0] : corpo;
          return resposta(201, [{ id: item.id }]);
        }
        return resposta(201);
      }
      if (metodo === 'PATCH') {
        const alvo = filtrar(linhas, query);
        for (const linha of alvo) Object.assign(linha, corpo);
        return resposta(200, alvo.map((l) => ({ ...l })));
      }
      if (metodo === 'DELETE') {
        if (nome === 'agenda_item_links') return resposta(204);
        const alvo = filtrar(linhas, query);
        for (const linha of alvo) {
          linhas.splice(linhas.indexOf(linha), 1);
          if (nome === 'calendar_connections') db.secrets.delete(linha.id);
        }
        return resposta(200, alvo);
      }
    }

    if (url.host === 'oauth2.googleapis.com' && url.pathname === '/token') {
      const parametros = new URLSearchParams(init.body);
      if (parametros.get('grant_type') === 'authorization_code') {
        assert.ok(parametros.get('code_verifier'), 'PKCE: code_verifier obrigatório');
        return resposta(200, { access_token: 'AT', refresh_token: `RT-${parametros.get('code')}`, scope: ESCOPOS });
      }
      return resposta(200, { access_token: 'AT2' });
    }
    if (url.host === 'oauth2.googleapis.com' && url.pathname === '/revoke') {
      google.revogados.push(new URLSearchParams(init.body).get('token'));
      return resposta(200, {});
    }
    if (url.host === 'www.googleapis.com') {
      const caminho = url.pathname.replace('/calendar/v3', '');
      const falha = google.falhas?.[caminho];
      if (falha) {
        // Corpo no formato que a Calendar API devolve: errors[] (v3) e ErrorInfo em details.
        const info = { insufficientPermissions: 'ACCESS_TOKEN_SCOPE_INSUFFICIENT', accessNotConfigured: 'SERVICE_DISABLED', rateLimitExceeded: 'RATE_LIMIT_EXCEEDED' }[falha];
        return resposta(403, {
          error: {
            code: 403,
            status: 'PERMISSION_DENIED',
            errors: [{ domain: 'global', reason: falha }],
            details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: info, domain: 'googleapis.com' }],
          },
        });
      }
      if (caminho === '/users/me/calendarList/primary') return resposta(200, google.calendars[0]);
      if (caminho === '/users/me/calendarList') return resposta(200, { items: google.calendars });
      if (caminho === '/calendars' && metodo === 'POST') {
        google.criados += 1;
        const novo = { id: `app-${google.criados}@group`, summary: corpo.summary, description: corpo.description, accessRole: 'owner' };
        google.calendars.push(novo);
        return resposta(200, novo);
      }
    }
    throw new Error(`fetch não simulado: ${metodo} ${url}`);
  };
}

async function carregarFuncao(ambiente, nome) {
  let handler = null;
  globalThis.Deno = { serve: (fn) => { handler = fn; }, env: { get: (chave) => ambiente.env[chave] } };
  await import(new URL(`${nome}/index.ts?${Math.random()}`, RAIZ).href);
  return handler;
}

function post(userId, corpo) {
  return new Request('https://funcao.test/', {
    method: 'POST',
    headers: { Origin: 'https://app.test', Authorization: `Bearer jwt-${userId}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
}

async function iniciarEVoltarDoGoogle(ambiente, userId = DONO, code = 'c1') {
  const connect = await carregarFuncao(ambiente, 'google-calendar-connect');
  const inicio = await connect(post(userId, { workspace_id: WORKSPACE }));
  assert.equal(inicio.status, 200);
  const { authorization_url: authorizationUrl } = await inicio.json();
  const state = new URL(authorizationUrl).searchParams.get('state');

  const callback = await carregarFuncao(ambiente, 'google-calendar-oauth-callback');
  const retorno = await callback(new Request(`https://funcao.test/?state=${state}&code=${code}`));
  assert.equal(retorno.status, 302);
  return new URL(retorno.headers.get('Location'));
}

async function confirmar(ambiente, userId, pendente) {
  const confirm = await carregarFuncao(ambiente, 'google-calendar-confirm');
  const resposta = await confirm(post(userId, { pendente }));
  return { status: resposta.status, corpo: await resposta.json() };
}

test('callback não ativa: deixa a conexão pendente e volta com google_agenda=confirmar&pendente=', async () => {
  const ambiente = criarAmbiente();
  instalarFetch(ambiente);
  const retorno = await iniciarEVoltarDoGoogle(ambiente);
  assert.equal(retorno.origin + retorno.pathname, 'https://app.test/app/conta/google-agenda');
  assert.equal(retorno.searchParams.get('google_agenda'), 'confirmar');
  const pendente = retorno.searchParams.get('pendente');
  assert.match(pendente, /^[A-Za-z0-9_-]{43}$/);

  const [conexao] = ambiente.db.connections;
  assert.equal(conexao.status, 'pending');
  assert.notEqual(conexao.confirmation_hash, pendente, 'o banco guarda só o hash');
  assert.equal(ambiente.google.criados, 0, 'nenhuma agenda criada antes da confirmação');
  assert.equal(ambiente.db.secrets.get(conexao.id), 'RT-c1');
});

test('mesma pessoa confirma: agenda do espaço criada, calendários gravados, status active', async () => {
  const ambiente = criarAmbiente();
  instalarFetch(ambiente);
  const pendente = (await iniciarEVoltarDoGoogle(ambiente)).searchParams.get('pendente');

  const { status, corpo } = await confirmar(ambiente, DONO, pendente);
  assert.equal(status, 200);
  assert.deepEqual(corpo, { connected: true, workspace_id: WORKSPACE });

  const [conexao] = ambiente.db.connections;
  assert.equal(ambiente.db.connections.length, 1, 'a pendência saiu; ficou só a conexão');
  assert.equal(conexao.status, 'active');
  assert.equal(conexao.confirmation_hash, undefined);
  assert.equal(ambiente.db.secrets.get(conexao.id), 'RT-c1');
  assert.equal(conexao.app_calendar_id, 'app-1@group');
  assert.equal(conexao.destination_calendar_id, 'app-1@group');
  assert.equal(ambiente.google.criados, 1);
  assert.deepEqual(ambiente.db.calendars.map((c) => [c.external_calendar_id, c.is_read]).sort(), [['app-1@group', true], ['eu@gmail.test', true]]);
  assert.deepEqual(ambiente.google.revogados, []);
});

test('outra pessoa abre o retorno: nada é conectado, o token é revogado e a pendência sai', async () => {
  const ambiente = criarAmbiente();
  instalarFetch(ambiente);
  const pendente = (await iniciarEVoltarDoGoogle(ambiente, DONO, 'repassado')).searchParams.get('pendente');

  const { status, corpo } = await confirmar(ambiente, OUTRA, pendente);
  assert.equal(status, 403);
  assert.equal(corpo.error.code, 'CONFIRMATION_FORBIDDEN');
  assert.deepEqual(ambiente.db.connections, []);
  assert.deepEqual(ambiente.google.revogados, ['RT-repassado']);
  assert.equal(ambiente.google.criados, 0);

  // Quem iniciou também não consegue mais usar o id.
  const depois = await confirmar(ambiente, DONO, pendente);
  assert.equal(depois.status, 410);
  assert.equal(depois.corpo.error.code, 'CONFIRMATION_INVALID');
});

test('id reutilizado: a segunda confirmação falha e não mexe na conexão ativa', async () => {
  const ambiente = criarAmbiente();
  instalarFetch(ambiente);
  const pendente = (await iniciarEVoltarDoGoogle(ambiente)).searchParams.get('pendente');
  assert.equal((await confirmar(ambiente, DONO, pendente)).status, 200);

  const segunda = await confirmar(ambiente, DONO, pendente);
  assert.equal(segunda.status, 410);
  assert.equal(segunda.corpo.error.code, 'CONFIRMATION_INVALID');
  assert.equal(ambiente.db.connections[0].status, 'active');
  assert.deepEqual(ambiente.google.revogados, []);

  const deOutra = await confirmar(ambiente, OUTRA, pendente);
  assert.equal(deOutra.status, 410);
  assert.equal(ambiente.db.connections.length, 1);
});

test('id vencido: revoga o token, apaga a pendência e devolve CONFIRMATION_EXPIRED', async () => {
  const ambiente = criarAmbiente();
  instalarFetch(ambiente);
  const pendente = (await iniciarEVoltarDoGoogle(ambiente, DONO, 'velho')).searchParams.get('pendente');
  ambiente.db.connections[0].confirmation_expires_at = new Date(Date.now() - 1000).toISOString();

  const { status, corpo } = await confirmar(ambiente, DONO, pendente);
  assert.equal(status, 410);
  assert.equal(corpo.error.code, 'CONFIRMATION_EXPIRED');
  assert.deepEqual(ambiente.db.connections, []);
  assert.deepEqual(ambiente.google.revogados, ['RT-velho']);
});

test('pendência vencida de outra pessoa é limpa no próximo connect', async () => {
  const ambiente = criarAmbiente();
  instalarFetch(ambiente);
  await iniciarEVoltarDoGoogle(ambiente, OUTRA, 'abandonado');
  ambiente.db.connections[0].confirmation_expires_at = new Date(Date.now() - 1000).toISOString();

  const connect = await carregarFuncao(ambiente, 'google-calendar-connect');
  assert.equal((await connect(post(DONO, { workspace_id: WORKSPACE }))).status, 200);
  assert.deepEqual(ambiente.db.connections, []);
  assert.deepEqual(ambiente.google.revogados, ['RT-abandonado']);
});

test('reconectar depois de desconectar reaproveita a agenda do espaço pela marca', async () => {
  const ambiente = criarAmbiente();
  instalarFetch(ambiente);
  let pendente = (await iniciarEVoltarDoGoogle(ambiente)).searchParams.get('pendente');
  assert.equal((await confirmar(ambiente, DONO, pendente)).status, 200);

  const disconnect = await carregarFuncao(ambiente, 'google-calendar-disconnect');
  const saida = await disconnect(post(DONO, { workspace_id: WORKSPACE }));
  assert.deepEqual(await saida.json(), { disconnected: true, revoked: true });
  assert.deepEqual(ambiente.db.connections, []);

  pendente = (await iniciarEVoltarDoGoogle(ambiente, DONO, 'c2')).searchParams.get('pendente');
  assert.equal((await confirmar(ambiente, DONO, pendente)).status, 200);
  assert.equal(ambiente.google.criados, 1, 'nenhuma agenda duplicada');
  assert.equal(ambiente.db.connections[0].app_calendar_id, 'app-1@group');
});

test('link repassado não toca a conexão que quem mandou já tinha', async () => {
  const ambiente = criarAmbiente();
  instalarFetch(ambiente);
  let pendente = (await iniciarEVoltarDoGoogle(ambiente, DONO, 'original')).searchParams.get('pendente');
  assert.equal((await confirmar(ambiente, DONO, pendente)).status, 200);
  const antes = structuredClone(ambiente.db.connections[0]);
  const calendariosAntes = ambiente.db.calendars.length;

  // Quem recebe o link consente com outra conta Google.
  ambiente.google.calendars[0] = { id: 'vitima@gmail.test', accessRole: 'owner', primary: true };
  pendente = (await iniciarEVoltarDoGoogle(ambiente, DONO, 'repassado')).searchParams.get('pendente');
  const ativa = ambiente.db.connections.find((c) => c.status !== 'pending');
  assert.deepEqual(ativa, antes, 'o callback não altera a conexão ativa');
  assert.equal(ambiente.db.calendars.length, calendariosAntes);
  assert.equal(ambiente.db.secrets.get(antes.id), 'RT-original');

  const { status } = await confirmar(ambiente, OUTRA, pendente);
  assert.equal(status, 403);
  assert.deepEqual(ambiente.db.connections, [antes], 'a pendência saiu e a conexão ativa ficou');
  assert.equal(ambiente.db.secrets.get(antes.id), 'RT-original');
  assert.deepEqual(ambiente.google.revogados, ['RT-repassado']);
});

test('reconexão não confirmada mantém a conexão ativa; a pendência vencida sai sozinha', async () => {
  const ambiente = criarAmbiente();
  instalarFetch(ambiente);
  let pendente = (await iniciarEVoltarDoGoogle(ambiente, DONO, 'original')).searchParams.get('pendente');
  assert.equal((await confirmar(ambiente, DONO, pendente)).status, 200);
  const antes = structuredClone(ambiente.db.connections[0]);

  await iniciarEVoltarDoGoogle(ambiente, DONO, 'abandonado');
  ambiente.db.connections.find((c) => c.status === 'pending').confirmation_expires_at = new Date(Date.now() - 1000).toISOString();

  const connect = await carregarFuncao(ambiente, 'google-calendar-connect');
  assert.equal((await connect(post(OUTRA, { workspace_id: WORKSPACE }))).status, 200);
  assert.deepEqual(ambiente.db.connections, [antes]);
  assert.deepEqual(ambiente.google.revogados, [], 'mesma conta ativa: o grant não é revogado');
});

test('troca de conta confirmada: calendários da conta anterior saem e o token dela é revogado', async () => {
  const ambiente = criarAmbiente();
  instalarFetch(ambiente);
  let pendente = (await iniciarEVoltarDoGoogle(ambiente, DONO, 'conta-a')).searchParams.get('pendente');
  assert.equal((await confirmar(ambiente, DONO, pendente)).status, 200);
  const id = ambiente.db.connections[0].id;

  ambiente.google.calendars = [{ id: 'b@gmail.test', accessRole: 'owner', primary: true }];
  pendente = (await iniciarEVoltarDoGoogle(ambiente, DONO, 'conta-b')).searchParams.get('pendente');
  assert.equal((await confirmar(ambiente, DONO, pendente)).status, 200);

  assert.equal(ambiente.db.connections.length, 1);
  const [conexao] = ambiente.db.connections;
  assert.equal(conexao.id, id);
  assert.equal(conexao.account_email, 'b@gmail.test');
  assert.equal(ambiente.db.secrets.get(id), 'RT-conta-b');
  assert.deepEqual(ambiente.google.revogados, ['RT-conta-a']);
  assert.ok(ambiente.db.calendars.every((c) => c.external_calendar_id !== 'eu@gmail.test'));
});

test('Calendar API desativada no callback: volta com erro, não com falta de permissão', async () => {
  const ambiente = criarAmbiente();
  ambiente.google.falhas = { '/users/me/calendarList/primary': 'accessNotConfigured' };
  instalarFetch(ambiente);
  const retorno = await iniciarEVoltarDoGoogle(ambiente);
  assert.equal(retorno.searchParams.get('google_agenda'), 'erro');
  assert.deepEqual(ambiente.db.connections, []);
  assert.deepEqual(ambiente.google.revogados, ['RT-c1'], 'o grant recém-emitido não fica órfão na conta Google');
});

test('escopo faltando no callback: volta com escopo_insuficiente', async () => {
  const ambiente = criarAmbiente();
  ambiente.google.falhas = { '/users/me/calendarList/primary': 'insufficientPermissions' };
  instalarFetch(ambiente);
  const retorno = await iniciarEVoltarDoGoogle(ambiente);
  assert.equal(retorno.searchParams.get('google_agenda'), 'escopo_insuficiente');
});

test('cota estourada na confirmação: 502, não pede para marcar permissões', async () => {
  const ambiente = criarAmbiente();
  instalarFetch(ambiente);
  const pendente = (await iniciarEVoltarDoGoogle(ambiente)).searchParams.get('pendente');
  ambiente.google.falhas = { '/users/me/calendarList': 'rateLimitExceeded' };

  const { status, corpo } = await confirmar(ambiente, DONO, pendente);
  assert.equal(status, 502);
  assert.equal(corpo.error.code, 'GOOGLE_UNAVAILABLE');
});

test('escopo faltando ao criar a agenda do espaço: 403 SCOPE_INSUFFICIENT', async () => {
  const ambiente = criarAmbiente();
  instalarFetch(ambiente);
  const pendente = (await iniciarEVoltarDoGoogle(ambiente)).searchParams.get('pendente');
  ambiente.google.falhas = { '/calendars': 'insufficientPermissions' };

  const { status, corpo } = await confirmar(ambiente, DONO, pendente);
  assert.equal(status, 403);
  assert.equal(corpo.error.code, 'SCOPE_INSUFFICIENT');
});
