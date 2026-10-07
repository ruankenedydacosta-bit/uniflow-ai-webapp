import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  ESCOPOS_GOOGLE_AGENDA,
  escoposQueFaltam,
  lerEscoposConcedidos,
  temTodosOsEscopos,
} from '../../supabase/functions/_shared/googleCalendar/escopos.js';
import {
  escolherDestino,
  montarCalendariosDaConexao,
} from '../../supabase/functions/_shared/googleCalendar/listaDeCalendarios.js';
import {
  base64Url,
  desafioPkce,
  gerarSegredoAleatorio,
  hashDoState,
  montarUrlDeAutorizacao,
  montarUrlDeRetorno,
  nomeDoCalendarioDoEspaco,
  normalizarReturnPath,
  origemPermitida,
  RESULTADOS_CONEXAO,
  resultadoDoErroDoGoogle,
  RETURN_PATH_PADRAO,
  usuarioNaAllowlist,
} from '../../supabase/functions/_shared/googleCalendar/oauth.js';

// ---------------------------------------------------------------------------
// Escopos
// ---------------------------------------------------------------------------

test('pede exatamente os três escopos do épico, sem openid/email nem calendar amplo', () => {
  assert.deepEqual([...ESCOPOS_GOOGLE_AGENDA].sort(), [
    'https://www.googleapis.com/auth/calendar.app.created',
    'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
    'https://www.googleapis.com/auth/calendar.events.owned',
  ]);
  for (const escopo of ESCOPOS_GOOGLE_AGENDA) {
    assert.notEqual(escopo, 'https://www.googleapis.com/auth/calendar');
    assert.doesNotMatch(escopo, /openid|userinfo|email/);
  }
});

test('lê escopos concedidos separados por espaço e sem repetição', () => {
  assert.deepEqual(lerEscoposConcedidos(' a  b a '), ['a', 'b']);
  assert.deepEqual(lerEscoposConcedidos(['a', '', 'a', 3]), ['a']);
  assert.deepEqual(lerEscoposConcedidos(undefined), []);
});

test('escopo faltando é detectado; escopo a mais não atrapalha', () => {
  const todos = ESCOPOS_GOOGLE_AGENDA.join(' ');
  assert.equal(temTodosOsEscopos(`${todos} https://www.googleapis.com/auth/drive.file`), true);
  const semEventos = ESCOPOS_GOOGLE_AGENDA.slice(0, 2).join(' ');
  assert.equal(temTodosOsEscopos(semEventos), false);
  assert.deepEqual(escoposQueFaltam(semEventos), [ESCOPOS_GOOGLE_AGENDA[2]]);
});

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

test('return_path: padrão quando ausente, só /app/..., sem query, fragmento, // ou ..', () => {
  assert.equal(normalizarReturnPath(undefined), RETURN_PATH_PADRAO);
  assert.equal(normalizarReturnPath(''), RETURN_PATH_PADRAO);
  assert.equal(RETURN_PATH_PADRAO, '/app/conta/google-agenda');
  assert.equal(normalizarReturnPath('/app/agenda'), '/app/agenda');
  for (const invalido of [
    '/app', '/app/', 'https://evil.test/app/x', '//evil.test/app/x', '/app//evil.test',
    '/app/../admin', '/app/agenda?x=1', '/app/agenda#x', '/dashboard', 'app/agenda', 42, '/app/a\\b',
  ]) {
    assert.equal(normalizarReturnPath(invalido), null, String(invalido));
  }
});

test('URL de autorização: offline, consent, PKCE S256, state e os três escopos', () => {
  const url = new URL(montarUrlDeAutorizacao({
    clientId: 'cliente', redirectUri: 'https://exemplo.test/cb', state: 'st', codeChallenge: 'cc',
  }));
  assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(url.searchParams.get('client_id'), 'cliente');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://exemplo.test/cb');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.get('prompt'), 'consent');
  assert.equal(url.searchParams.get('state'), 'st');
  assert.equal(url.searchParams.get('code_challenge'), 'cc');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.deepEqual(url.searchParams.get('scope').split(' '), [...ESCOPOS_GOOGLE_AGENDA]);
});

test('URL de retorno: origem + return_path + ?google_agenda=, valor desconhecido vira erro', () => {
  assert.equal(
    montarUrlDeRetorno({ origem: 'https://app.exemplo.test', returnPath: '/app/conta/google-agenda', resultado: 'conectado' }),
    'https://app.exemplo.test/app/conta/google-agenda?google_agenda=conectado',
  );
  assert.equal(
    montarUrlDeRetorno({ origem: 'https://app.exemplo.test', returnPath: '//evil.test', resultado: 'qualquer' }),
    'https://app.exemplo.test/app/conta/google-agenda?google_agenda=erro',
  );
  assert.deepEqual(Object.values(RESULTADOS_CONEXAO).sort(), ['conectado', 'erro', 'escopo_insuficiente', 'negado']);
});

test('access_denied do Google vira "negado"; outro erro vira "erro"', () => {
  assert.equal(resultadoDoErroDoGoogle('access_denied'), 'negado');
  assert.equal(resultadoDoErroDoGoogle('server_error'), 'erro');
});

test('allowlist: vazia bloqueia todos, lista libera os ids, "*" libera todos', () => {
  assert.equal(usuarioNaAllowlist('u1', ''), false);
  assert.equal(usuarioNaAllowlist('u1', undefined), false);
  assert.equal(usuarioNaAllowlist('u1', 'u2, u1'), true);
  assert.equal(usuarioNaAllowlist('u3', 'u2,u1'), false);
  assert.equal(usuarioNaAllowlist('u3', '*'), true);
  assert.equal(usuarioNaAllowlist('', '*'), false);
});

test('origem: lista exata de APP_ALLOWED_ORIGINS ou localhost', () => {
  assert.equal(origemPermitida('https://app.exemplo.test', 'https://app.exemplo.test,https://b.test'), true);
  assert.equal(origemPermitida('https://app.exemplo.test.evil', 'https://app.exemplo.test'), false);
  assert.equal(origemPermitida('http://localhost:5173', ''), true);
  assert.equal(origemPermitida('', 'https://app.exemplo.test'), false);
});

test('nome do calendário do espaço', () => {
  assert.equal(nomeDoCalendarioDoEspaco('  Ateliê Maria '), 'UniFlow · Ateliê Maria');
  assert.equal(nomeDoCalendarioDoEspaco(''), 'UniFlow · Meu espaço');
  assert.equal(nomeDoCalendarioDoEspaco('x'.repeat(200)).length, 'UniFlow · '.length + 80);
});

test('PKCE: code_challenge é base64url(sha256(verifier)), como a RFC 7636', async () => {
  // Exemplo do apêndice B da RFC 7636.
  const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
  assert.equal(await desafioPkce(verifier), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
});

test('segredo aleatório é base64url e não repete; hash do state é sha256 em hex', async () => {
  const a = gerarSegredoAleatorio(32);
  const b = gerarSegredoAleatorio(32);
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a, b);
  assert.equal(await hashDoState('abc'), createHash('sha256').update('abc').digest('hex'));
  assert.equal(base64Url(new Uint8Array([251, 255])), '-_8');
});

// ---------------------------------------------------------------------------
// Lista de calendários
// ---------------------------------------------------------------------------

const ITENS = [
  { id: 'eu@exemplo.test', summary: 'Eu', timeZone: 'America/Sao_Paulo', accessRole: 'owner', primary: true },
  { id: 'app-cal', summary: 'UniFlow · Espaço', accessRole: 'owner' },
  { id: 'trabalho', summary: 'Trabalho', summaryOverride: 'Meu trabalho', accessRole: 'owner' },
  { id: 'feriados', summary: 'Feriados', accessRole: 'reader' },
  { id: 'apagado', summary: 'X', accessRole: 'owner', deleted: true },
];

test('primeira conexão: primário e calendário do espaço começam lidos; o resto não', () => {
  const { linhas, removidos } = montarCalendariosDaConexao({ itens: ITENS, appCalendarId: 'app-cal' });
  const porId = Object.fromEntries(linhas.map((linha) => [linha.external_calendar_id, linha]));
  assert.deepEqual(Object.keys(porId).sort(), ['app-cal', 'eu@exemplo.test', 'feriados', 'trabalho']);
  assert.equal(porId['eu@exemplo.test'].is_read, true);
  assert.equal(porId['eu@exemplo.test'].is_primary, true);
  assert.equal(porId['app-cal'].is_read, true);
  assert.equal(porId['app-cal'].is_app_created, true);
  assert.equal(porId.trabalho.is_read, false);
  assert.equal(porId.trabalho.summary, 'Meu trabalho');
  assert.equal(porId.feriados.is_read, false);
  assert.deepEqual(removidos, []);
});

test('linhas nunca levam sync_token, janela nem channel_* (o sync do #101 fica preservado)', () => {
  const { linhas } = montarCalendariosDaConexao({ itens: ITENS, appCalendarId: 'app-cal' });
  for (const linha of linhas) {
    for (const chave of Object.keys(linha)) {
      assert.doesNotMatch(chave, /sync_token|sync_window|channel_|sync_lock|last_sync|last_full_sync/);
    }
  }
});

test('reconexão mantém a escolha de leitura; calendário que deixou de ser próprio para de ser lido', () => {
  const existentes = [
    { external_calendar_id: 'eu@exemplo.test', is_read: false },
    { external_calendar_id: 'trabalho', is_read: true },
    { external_calendar_id: 'feriados', is_read: true },
    { external_calendar_id: 'sumiu', is_read: true },
  ];
  const { linhas, removidos } = montarCalendariosDaConexao({ itens: ITENS, existentes, appCalendarId: 'app-cal' });
  const porId = Object.fromEntries(linhas.map((linha) => [linha.external_calendar_id, linha]));
  assert.equal(porId['eu@exemplo.test'].is_read, false);
  assert.equal(porId.trabalho.is_read, true);
  assert.equal(porId.feriados.is_read, false);
  assert.deepEqual(removidos, ['sumiu']);
});

test('papel desconhecido vira "none" e nunca é lido', () => {
  const { linhas } = montarCalendariosDaConexao({ itens: [{ id: 'x', accessRole: 'admin', primary: true }] });
  assert.equal(linhas[0].access_role, 'none');
  assert.equal(linhas[0].is_read, false);
});

test('destino: mantém o atual se for próprio; senão, o calendário do espaço; senão, nenhum', () => {
  const { linhas } = montarCalendariosDaConexao({ itens: ITENS, appCalendarId: 'app-cal' });
  assert.equal(escolherDestino({ destinoAtual: 'trabalho', appCalendarId: 'app-cal', linhas }), 'trabalho');
  assert.equal(escolherDestino({ destinoAtual: 'feriados', appCalendarId: 'app-cal', linhas }), 'app-cal');
  assert.equal(escolherDestino({ destinoAtual: null, appCalendarId: 'app-cal', linhas }), 'app-cal');
  assert.equal(escolherDestino({ destinoAtual: null, appCalendarId: 'outro', linhas }), null);
});
