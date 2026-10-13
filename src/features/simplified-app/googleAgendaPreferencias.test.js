// Épico #98 (#102): agenda de destino, agendas lidas, "Sincronizar agora" e
// as entradas em Configurações → Preferências e no topo da Agenda.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  agendaPropria,
  avisoDaLeituraSalva,
  avisoDaSincronizacao,
  avisoDoDestinoSalvo,
  comLeitura,
  descricaoDaAgenda,
  descricaoDaLeitura,
  mensagemDeErroAoSalvar,
  nomeDaAgenda,
  opcoesDeDestino,
  ordenarAgendas,
  resumoDaConexaoNaAgenda,
  textoDoUltimoSync,
} from './googleAgendaPresentation.js';
import { resolveSimplifiedFeatureFlags, SIMPLIFIED_FEATURE_FLAG_KEYS } from './simplifiedFeatureFlags.js';
import { SIMPLIFIED_ROUTES } from './simplifiedRoutes.js';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

const UNIFLOW = { id: 'a', external_calendar_id: 'g-app', summary: 'UniFlow · Casa', access_role: 'owner', is_app_created: true, is_read: true };
const PRINCIPAL = { id: 'b', external_calendar_id: 'g-pri', summary: 'ana@gmail.com', access_role: 'owner', is_primary: true, is_read: false };
const ACADEMIA = { id: 'c', external_calendar_id: 'g-aca', summary: 'academia', access_role: 'owner', is_read: false };
const FERIADOS = { id: 'd', external_calendar_id: 'g-fer', summary: 'Feriados', access_role: 'reader', is_read: false };
const TRABALHO = { id: 'e', external_calendar_id: 'g-tra', summary: 'Trabalho', access_role: 'writer', is_read: false };

test('só agenda com access_role owner é própria', () => {
  assert.equal(agendaPropria(UNIFLOW), true);
  for (const agenda of [FERIADOS, TRABALHO, null, {}]) assert.equal(agendaPropria(agenda), false);
});

test('ordem: agenda do UniFlow, principal e as outras por nome, sem caixa', () => {
  const ordem = ordenarAgendas([FERIADOS, TRABALHO, ACADEMIA, PRINCIPAL, UNIFLOW, null]).map(({ id }) => id);
  assert.deepEqual(ordem, ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(ordenarAgendas(undefined), []);
});

test('destino só oferece agenda própria', () => {
  assert.deepEqual(opcoesDeDestino([FERIADOS, TRABALHO, ACADEMIA, UNIFLOW]).map(({ id }) => id), ['a', 'c']);
});

test('nome e apoio de cada agenda', () => {
  assert.equal(nomeDaAgenda({ summary: '  ' }), 'Agenda sem nome');
  assert.equal(nomeDaAgenda(ACADEMIA), 'academia');
  assert.match(descricaoDaAgenda(UNIFLOW), /Criada pelo UniFlow/);
  assert.match(descricaoDaAgenda(PRINCIPAL), /principal/);
  assert.equal(descricaoDaAgenda(ACADEMIA), null);
  assert.match(descricaoDaLeitura(FERIADOS), /Só agendas suas podem ser lidas/);
  assert.match(descricaoDaLeitura({ ...ACADEMIA, is_read: true, last_sync_error: 'x' }), /Sincronizar agora/);
  assert.equal(descricaoDaLeitura({ ...ACADEMIA, is_read: false, last_sync_error: 'x' }), null, 'agenda desmarcada não é lida');
  assert.equal(
    descricaoDaLeitura({ ...ACADEMIA, is_read: true, last_sync_error: 'x' }, { conexaoComErro: true }),
    null,
    'com a conexão em erro, o botão Sincronizar agora não aparece',
  );
});

test('comLeitura troca só a agenda indicada', () => {
  const lista = comLeitura([UNIFLOW, ACADEMIA], 'c', true);
  assert.equal(lista[1].is_read, true);
  assert.equal(lista[0], UNIFLOW);
  assert.equal(ACADEMIA.is_read, false, 'não muda o objeto original');
});

test('hora do último sync: hoje, ontem, data e nunca', () => {
  const agora = new Date('2026-10-13T15:00:00Z');
  const opcoes = { agora, timeZone: 'America/Sao_Paulo' };
  assert.equal(textoDoUltimoSync('2026-10-13T14:32:00Z', opcoes), 'Hoje às 11:32');
  assert.equal(textoDoUltimoSync('2026-10-12T12:05:00Z', opcoes), 'Ontem às 09:05');
  assert.equal(textoDoUltimoSync('2026-10-10T21:00:00Z', opcoes), '10/10/2026 às 18:00');
  // 02:00 UTC do dia 13 ainda é dia 12 em São Paulo.
  assert.equal(textoDoUltimoSync('2026-10-13T02:00:00Z', opcoes), 'Ontem às 23:00');
  assert.equal(textoDoUltimoSync(null, opcoes), 'Ainda não sincronizado');
  assert.equal(textoDoUltimoSync('não é data', opcoes), 'Ainda não sincronizado');
});

test('aviso do "Sincronizar agora": contagem, nada novo, throttle e agenda com erro', () => {
  const ok = (calendarios) => avisoDaSincronizacao({ data: { sincronizado_em: 'x', calendarios }, error: null });
  assert.deepEqual(ok([{ status: 'ok', inseridos: 2, atualizados: 1, cancelados: 0 }, { status: 'ok', inseridos: 1 }]), {
    tone: 'success',
    message: 'Agenda sincronizada. 3 eventos novos e 1 evento alterado.',
  });
  assert.equal(ok([{ status: 'ok', cancelados: 1 }]).message, 'Agenda sincronizada. 1 evento cancelado.');
  assert.equal(ok([{ status: 'ok', inseridos: 0 }]).message, 'Agenda sincronizada. Não há mudanças no Google.');
  assert.equal(ok([]).message, 'Agenda sincronizada. Não há mudanças no Google.');
  assert.match(ok([{ status: 'skipped' }]).message, /aguarde 30 segundos/);
  const comErro = ok([{ status: 'ok', inseridos: 1 }, { status: 'erro' }]);
  assert.equal(comErro.tone, 'alert');
  assert.equal(comErro.message, '1 agenda não foi sincronizada. Tente de novo em alguns minutos.');
  assert.match(ok([{ status: 'erro' }, { status: 'erro' }]).message, /^2 agendas não foram sincronizadas/);
});

test('aviso do "Sincronizar agora": códigos da função e função ainda ausente', () => {
  const erro = (code) => avisoDaSincronizacao({ data: null, error: { code } });
  assert.match(erro('NOT_CONNECTED').message, /não está conectado/);
  assert.match(erro('RECONNECT_REQUIRED').message, /Conectar de novo/);
  assert.match(erro('GOOGLE_UNAVAILABLE').message, /O Google não respondeu/);
  for (const code of ['REQUEST_FAILED', 'PARSE_ERROR', 'NETWORK', undefined]) {
    assert.deepEqual(erro(code), { tone: 'alert', message: 'Não foi possível sincronizar agora. Tente de novo mais tarde.' });
  }
});

test('trocar o destino avisa que só os compromissos novos vão para a agenda nova', () => {
  const aviso = avisoDoDestinoSalvo('academia');
  assert.equal(aviso.tone, 'success');
  assert.match(aviso.message, /próximos compromissos vão para a agenda “academia”/);
  assert.match(aviso.message, /já estão no Google continuam onde estão/);
});

test('desmarcar uma agenda avisa que os eventos já trazidos continuam', () => {
  assert.match(avisoDaLeituraSalva('academia', false).message, /já trazidos continuam no UniFlow/);
  assert.match(avisoDaLeituraSalva('academia', true).message, /vão aparecer no UniFlow/);
});

test('erro ao salvar: recusa por agenda alheia tem mensagem própria', () => {
  assert.match(mensagemDeErroAoSalvar({ code: 'DESTINATION_NOT_ALLOWED' }), /Só agendas suas/);
  assert.match(mensagemDeErroAoSalvar({ code: 'READ_NOT_ALLOWED' }), /Só agendas suas/);
  assert.match(mensagemDeErroAoSalvar({ code: 'PREFERENCES_SAVE_FAILED' }), /Tente de novo/);
});

test('Google Agenda não tem flag: aparece para todos', () => {
  assert.equal('GOOGLE_AGENDA' in SIMPLIFIED_FEATURE_FLAG_KEYS, false);
  assert.equal('googleAgendaEnabled' in resolveSimplifiedFeatureFlags({ VITE_AGENDA_GOOGLE_ENABLED: 'true' }), false);
});

test('Preferências sempre mostra o Google Agenda', async () => {
  const page = await source('./SimplifiedThemePage.jsx');
  assert.doesNotMatch(page, /googleAgendaEnabled/);
  assert.match(page, /ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.GOOGLE_CALENDAR\]\.path/);
  assert.match(page, />Google Agenda</);
});

test('Agenda abre o Google Agenda pela linha do topo, com voltar e OAuth de volta para a Agenda', async () => {
  assert.equal(SIMPLIFIED_ROUTES.AGENDA_GOOGLE, '/app/agenda/google');
  // O callback só aceita /app/... sem query (normalizarReturnPath).
  assert.match(SIMPLIFIED_ROUTES.AGENDA_GOOGLE, /^\/app\/[A-Za-z0-9\-_/]+$/);

  const agenda = await source('./SimplifiedAgendaPage.jsx');
  assert.match(agenda, /navegarComMovimento\(SIMPLIFIED_ROUTES\.AGENDA_GOOGLE\)/);
  // Sem espaço aberto, a linha fica em "Carregando…" (nunca compara undefined com undefined).
  assert.match(agenda, /workspaceId && conexaoGoogle\?\.workspaceId === workspaceId \? conexaoGoogle : \{ estado: 'carregando' \}/);
  assert.ok(agenda.indexOf('styles.googleRow') < agenda.indexOf('styles.calendarBlock'), 'a linha vem antes do calendário');

  const routes = await source('../../app/routes.jsx');
  assert.match(routes, /path: SIMPLIFIED_ROUTES\.AGENDA_GOOGLE,[\s\S]*?<SimplifiedGoogleAgendaPage origem="agenda" \/>/);

  const page = await source('./SimplifiedGoogleAgendaPage.jsx');
  assert.match(page, /iniciarConexao\(\{ workspaceId, returnPath: voltar\.retornoDoOAuth \}\)/);
  assert.match(page, /retornoDoOAuth: SIMPLIFIED_ROUTES\.AGENDA_GOOGLE/);
  assert.match(page, /retornoDoOAuth: ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.GOOGLE_CALENDAR\]\.path/);
  assert.match(page, /rotulo: 'Voltar para a Agenda'/);

  const shell = await source('./SimplifiedAppShell.jsx');
  assert.match(shell, /location\.pathname === SIMPLIFIED_ROUTES\.AGENDA_GOOGLE/);
});

test('linha da Agenda: convite sem conexão, hora do sync quando ativa e alerta quando falhou', () => {
  const agora = new Date('2026-10-13T18:00:00Z');
  const timeZone = 'America/Sao_Paulo';
  assert.deepEqual(resumoDaConexaoNaAgenda({ estado: 'carregando' }), { detalhe: 'Carregando…', tom: 'neutro' });
  // Sem argumento ou com null não quebra a Agenda.
  assert.equal(resumoDaConexaoNaAgenda(null).tom, 'convite');
  assert.equal(resumoDaConexaoNaAgenda().tom, 'convite');
  assert.equal(resumoDaConexaoNaAgenda({ estado: 'erro' }).tom, 'neutro');
  assert.equal(resumoDaConexaoNaAgenda({ estado: 'ok', conexao: null }).tom, 'convite');
  // Pendente ainda não foi confirmada: continua como convite.
  assert.equal(resumoDaConexaoNaAgenda({ estado: 'ok', conexao: { status: 'pending' } }).tom, 'convite');
  assert.deepEqual(
    resumoDaConexaoNaAgenda({ estado: 'ok', conexao: { status: 'active', last_synced_at: '2026-10-13T17:32:00Z' }, agora, timeZone }),
    { detalhe: 'Conectada · Hoje às 14:32', tom: 'ok' },
  );
  assert.equal(
    resumoDaConexaoNaAgenda({ estado: 'ok', conexao: { status: 'active', last_synced_at: null } }).detalhe,
    'Conectada · Ainda não sincronizado',
  );
  assert.equal(resumoDaConexaoNaAgenda({ estado: 'ok', conexao: { status: 'error' } }).tom, 'alerta');
});

test('tela: destino, agendas lidas com caixa só para agenda própria, último sync e Sincronizar agora', async () => {
  const page = await source('./SimplifiedGoogleAgendaPage.jsx');
  assert.match(page, /salvarPreferencias\(\{\s*connectionId,\s*destinationCalendarId: agenda\.external_calendar_id,/);
  assert.match(page, /salvarPreferencias\(\{ connectionId, calendarioId: agenda\.id, lido \}\)/);
  assert.match(page, /type="checkbox"/);
  assert.match(page, /disabled=\{!podeLer \|\| ocupado\}/);
  assert.match(page, /textoDoUltimoSync\(conexao\.last_synced_at\)/);
  assert.match(page, /sincronizarAgora\(\{ workspaceId \}\)/);
  assert.match(page, /setAviso\(avisoDaSincronizacao\(resposta\)\)/);
  assert.match(page, /Sincronizar agora/);
  assert.match(page, /os que já estão no Google continuam onde estão/);
  assert.match(page, /os eventos já trazidos continuam no UniFlow/);
  // Presença no fonte: a leitura que o banco recusa volta ao valor anterior.
  assert.match(page, /comLeitura\(atuais, agenda\.id, !lido\)/);
});

test('tela: gravação e sincronização não correm juntas, e resposta de outro espaço é descartada', async () => {
  const page = await source('./SimplifiedGoogleAgendaPage.jsx');
  assert.match(page, /const ocupado = Boolean\(salvando\) \|\| isSyncing;/);
  assert.match(page, /loading=\{isSyncing\} disabled=\{Boolean\(salvando\)\}/);
  assert.equal(page.match(/if \(workspaceIdRef\.current !== espacoDoPedido\) return;/g)?.length, 3);
  // Falha na releitura depois de sincronizar não apaga a conexão da tela.
  assert.match(page, /if \(silencioso && \(error \|\| erroDasAgendas\)\) return;/);
});
