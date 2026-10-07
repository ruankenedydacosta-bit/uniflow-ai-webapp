// Épico #98 (#99): tela /app/conta/google-agenda. Mesmo padrão das outras
// telas de Conta: lógica pura testada direto, componente por leitura de fonte.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  avisoDoRetorno,
  mensagemDeErroAoConectar,
  mensagemDoEstadoDaConexao,
  nomeDaAgendaDoEspaco,
  urlDeAutorizacaoValida,
} from './googleAgendaPresentation.js';
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

test('routes.jsx monta a tela e a tira do placeholder', async () => {
  const routes = await source('../../app/routes.jsx');
  assert.match(routes, /<SimplifiedGoogleAgendaPage \/>/);
  assert.match(routes, /subroute\.path !== ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.GOOGLE_CALENDAR\]\.path/);
});
