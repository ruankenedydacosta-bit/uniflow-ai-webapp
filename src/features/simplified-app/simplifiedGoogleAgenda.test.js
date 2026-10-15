// Épico #98 (#99): tela /app/conta/google-agenda. Mesmo padrão das outras
// telas de Conta: lógica pura testada direto, componente por leitura de fonte.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  PADRAO_ID_DE_PENDENCIA as PADRAO_DO_SERVIDOR,
  PARAMETRO_PENDENTE,
} from '../../../supabase/functions/_shared/googleCalendar/confirmacao.js';
import {
  AVISO_LINK_DE_OUTRA_PESSOA,
  avisoDaConfirmacao,
  avisoInicialDoRetorno,
  GOOGLE_AGENDA_PENDING_PARAM,
  PADRAO_ID_DE_PENDENCIA,
  avisoDoRetorno,
  pendenciaDoRetorno,
  mensagemDeErroAoConectar,
  mensagemDoEstadoDaConexao,
  nomeDaAgendaDoEspaco,
  urlDeAutorizacaoValida,
} from './googleAgendaPresentation.js';
import { nomeDoCalendarioDoEspaco } from '../../../supabase/functions/_shared/googleCalendar/oauth.js';
import { ACCOUNT_SUBROUTE_IDS, ACCOUNT_SUBROUTES } from './simplifiedAccountRoutes.js';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('rota /app/conta/google-agenda com o nome "Google Agenda"', () => {
  const rota = ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.GOOGLE_CALENDAR];
  assert.equal(rota.path, '/app/conta/google-agenda');
  assert.equal(rota.title, 'Google Agenda');
});

test('cada retorno do callback vira um aviso; valor desconhecido não mostra nada', () => {
  assert.equal(avisoDoRetorno('conectado').tone, 'success');
  for (const valor of ['negado', 'escopo_insuficiente', 'erro']) {
    assert.equal(avisoDoRetorno(valor).tone, 'alert', valor);
    assert.ok(avisoDoRetorno(valor).message.length > 10);
  }
  assert.equal(avisoDoRetorno(null), null);
  assert.equal(avisoDoRetorno('toString'), null);
  assert.equal(avisoDoRetorno('<script>'), null);
});

test('estado com erro da conexão pede para conectar de novo', () => {
  assert.equal(mensagemDoEstadoDaConexao(null), null);
  assert.equal(mensagemDoEstadoDaConexao({ status: 'active' }), null);
  for (const codigo of ['token_revogado', 'escopo_insuficiente', 'destino_ausente', null]) {
    assert.match(mensagemDoEstadoDaConexao({ status: 'error', last_error_code: codigo }), /Conecte de novo/);
  }
});

test('erro ao conectar: allowlist tem mensagem própria', () => {
  assert.match(mensagemDeErroAoConectar({ code: 'NOT_ALLOWED' }), /ainda não está disponível/);
  assert.match(mensagemDeErroAoConectar({ code: 'NETWORK' }), /Tente de novo/);
});

test('só redireciona para a tela de consentimento do Google', () => {
  assert.equal(urlDeAutorizacaoValida('https://accounts.google.com/o/oauth2/v2/auth?x=1'), true);
  assert.equal(urlDeAutorizacaoValida('http://accounts.google.com/o/oauth2/v2/auth'), false);
  assert.equal(urlDeAutorizacaoValida('https://accounts.google.com.evil.test/'), false);
  assert.equal(urlDeAutorizacaoValida('javascript:alert(1)'), false);
  assert.equal(urlDeAutorizacaoValida(undefined), false);
});

test('nome da agenda do espaço', () => {
  assert.equal(nomeDaAgendaDoEspaco('Ateliê'), 'UniFlow · Ateliê');
  assert.equal(nomeDaAgendaDoEspaco(undefined), 'UniFlow · Meu espaço');
  for (const nome of ['Ateliê', '', '  x  ', 'y'.repeat(200), undefined]) {
    assert.equal(nomeDaAgendaDoEspaco(nome), nomeDoCalendarioDoEspaco(nome), 'a tela mostra o nome criado no Google');
  }
});

test('só a resposta do pedido mais recente da conexão vale', async () => {
  const page = await source('./SimplifiedGoogleAgendaPage.jsx');
  assert.match(page, /if \(ultimoPedidoRef\.current !== pedido\) return;/);
});

test('tela: aviso inline com "X" (sem toast), conectar, desconectar com confirmação e e-mail da conta', async () => {
  const page = await source('./SimplifiedGoogleAgendaPage.jsx');
  assert.match(page, /aria-label="Dispensar aviso"/);
  assert.match(page, /<PhXIcon \/>/);
  assert.match(page, /role=\{isAlert \? 'alert' : 'status'\}/);
  assert.doesNotMatch(page, /from '[^']*(toast|sonner)[^']*'/i);
  assert.match(page, /title="Google Agenda"/);
  assert.match(page, /'Conectar ao Google Agenda'/);
  assert.match(page, /title="Desconectar o Google Agenda\?"/);
  assert.match(page, /conexao\.account_email/);
  assert.match(page, /GOOGLE_AGENDA_RETURN_PARAM/);
  assert.match(page, /urlDeAutorizacaoValida\(data\?\.authorization_url\)/);
});

test('routes.jsx monta a tela na rota do Google Agenda', async () => {
  const routes = await source('../../app/routes.jsx');
  assert.match(routes, /ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.GOOGLE_CALENDAR\]\.path[\s\S]{0,200}<SimplifiedGoogleAgendaPage \/>/);
});

test('retorno "confirmar" traz o id da pendência; sem id válido não há confirmação', () => {
  const pendente = 'a'.repeat(43);
  assert.equal(pendenciaDoRetorno(new URLSearchParams(`google_agenda=confirmar&pendente=${pendente}`)), pendente);
  assert.equal(pendenciaDoRetorno(new URLSearchParams('google_agenda=confirmar&pendente=x')), null);
  assert.equal(pendenciaDoRetorno(new URLSearchParams(`google_agenda=conectado&pendente=${pendente}`)), null);
  assert.equal(avisoDoRetorno('confirmar'), null, 'o aviso vem da confirmação, não do retorno');
});

test('aviso da confirmação: conectado, link de outra pessoa, vencido e já usado', () => {
  assert.equal(avisoDaConfirmacao(null).tone, 'success');
  assert.equal(avisoDaConfirmacao({ code: 'CONFIRMATION_FORBIDDEN' }), AVISO_LINK_DE_OUTRA_PESSOA);
  assert.match(AVISO_LINK_DE_OUTRA_PESSOA.message, /Nada foi conectado/);
  assert.match(avisoDaConfirmacao({ code: 'CONFIRMATION_EXPIRED' }).message, /venceu/);
  assert.match(avisoDaConfirmacao({ code: 'CONFIRMATION_INVALID' }).message, /já foi usado/);
  assert.equal(avisoDaConfirmacao({ code: 'GOOGLE_UNAVAILABLE' }).tone, 'alert');
});

test('tela confirma uma vez só, com a sessão aberta, e limpa o id da URL', async () => {
  const page = await source('./SimplifiedGoogleAgendaPage.jsx');
  assert.match(page, /if \(!pendente \|\| confirmacaoIniciadaRef\.current \|\| isSessionLoading\) return;/);
  assert.match(page, /if \(!user\?\.id\) \{/);
  assert.match(page, /setAviso\(AVISO_SEM_SESSAO\)/);
  assert.match(page, /confirmarConexao\(\{ pendente \}\)/);
  assert.match(page, /next\.delete\(GOOGLE_AGENDA_PENDING_PARAM\)/);
});

test('tela e servidor usam o mesmo parâmetro e o mesmo formato de id', () => {
  assert.equal(GOOGLE_AGENDA_PENDING_PARAM, PARAMETRO_PENDENTE);
  assert.equal(PADRAO_ID_DE_PENDENCIA.source, PADRAO_DO_SERVIDOR.source);
});

test('retorno "confirmar" com id cortado avisa em vez de ficar em silêncio', () => {
  assert.match(avisoInicialDoRetorno(new URLSearchParams('google_agenda=confirmar&pendente=abc')).message, /já foi usado/);
  assert.equal(avisoInicialDoRetorno(new URLSearchParams(`google_agenda=confirmar&pendente=${'a'.repeat(43)}`)), null);
  assert.equal(avisoInicialDoRetorno(new URLSearchParams('google_agenda=negado')).tone, 'alert');
  assert.equal(avisoInicialDoRetorno(new URLSearchParams('')), null);
});
