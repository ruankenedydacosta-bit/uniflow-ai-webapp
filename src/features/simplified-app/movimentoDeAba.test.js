import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abaDaRota, movimentoDaNavegacao, sentidoDaAba } from './movimentoDeAba.js';
import { ACCOUNT_SUBROUTE_IDS, ACCOUNT_SUBROUTES } from './simplifiedAccountRoutes.js';
import { SIMPLIFIED_ROUTE_IDS, SIMPLIFIED_ROUTES } from './simplifiedRoutes.js';

test('abaDaRota acha a aba da rota e das sub-rotas dela', () => {
  assert.equal(abaDaRota(SIMPLIFIED_ROUTES.HOME)?.id, SIMPLIFIED_ROUTE_IDS.HOME);
  assert.equal(abaDaRota(SIMPLIFIED_ROUTES.RECORDS)?.id, SIMPLIFIED_ROUTE_IDS.RECORDS);
  assert.equal(abaDaRota(`${SIMPLIFIED_ROUTES.ACCOUNT}/plano`)?.id, SIMPLIFIED_ROUTE_IDS.ACCOUNT);
});

test('abaDaRota não confunde rota com prefixo parecido nem rota fora da barra', () => {
  assert.equal(abaDaRota(`${SIMPLIFIED_ROUTES.ACCOUNT}a`), null);
  assert.equal(abaDaRota(SIMPLIFIED_ROUTES.UNI), null);
  assert.equal(abaDaRota(SIMPLIFIED_ROUTES.RELATORIO), null);
});

test('sentidoDaAba segue a ordem da barra inferior', () => {
  assert.equal(sentidoDaAba(SIMPLIFIED_ROUTE_IDS.HOME, SIMPLIFIED_ROUTE_IDS.AGENDA), 1);
  assert.equal(sentidoDaAba(SIMPLIFIED_ROUTE_IDS.ACCOUNT, SIMPLIFIED_ROUTE_IDS.RECORDS), -1);
  assert.equal(sentidoDaAba(SIMPLIFIED_ROUTE_IDS.HOME, SIMPLIFIED_ROUTE_IDS.HOME), 1);
});

test('movimentoDaNavegacao abre a tela-filha e volta para a tela-pai', () => {
  const plano = ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.PLAN].path;
  const historico = ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.PAYMENT_HISTORY].path;
  const pagamentos = ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.PAYMENTS].path;
  const suporte = ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.SUPPORT].path;
  assert.equal(movimentoDaNavegacao(SIMPLIFIED_ROUTES.ACCOUNT, plano), 'abrir');
  assert.equal(movimentoDaNavegacao(pagamentos, historico), 'abrir');
  assert.equal(movimentoDaNavegacao(plano, SIMPLIFIED_ROUTES.ACCOUNT), 'voltar');
  assert.equal(movimentoDaNavegacao(historico, pagamentos), 'voltar');
  assert.equal(movimentoDaNavegacao(SIMPLIFIED_ROUTES.SUPPORT_CHAT, suporte), 'voltar');
});

test('movimentoDaNavegacao abre Uni e Relatório por cima e volta deles para a aba', () => {
  const plano = ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.PLAN].path;
  assert.equal(movimentoDaNavegacao(SIMPLIFIED_ROUTES.ACCOUNT, SIMPLIFIED_ROUTES.RELATORIO), 'abrir');
  assert.equal(movimentoDaNavegacao(plano, SIMPLIFIED_ROUTES.UNI), 'abrir');
  assert.equal(movimentoDaNavegacao(SIMPLIFIED_ROUTES.RELATORIO, SIMPLIFIED_ROUTES.HOME), 'voltar');
  assert.equal(movimentoDaNavegacao(SIMPLIFIED_ROUTES.RECORDS, SIMPLIFIED_ROUTES.ORGANIZAR), 'abrir');
  assert.equal(movimentoDaNavegacao(SIMPLIFIED_ROUTES.ORGANIZAR, SIMPLIFIED_ROUTES.CATEGORIAS), 'abrir');
  assert.equal(movimentoDaNavegacao(SIMPLIFIED_ROUTES.CATEGORIAS, SIMPLIFIED_ROUTES.ORGANIZAR), 'voltar');
  assert.equal(movimentoDaNavegacao(SIMPLIFIED_ROUTES.ORGANIZAR, SIMPLIFIED_ROUTES.RECORDS), 'voltar');
});

test('movimentoDaNavegacao troca de aba ao ir para a raiz de outra aba, mesmo de uma tela aberta', () => {
  const notificacoes = ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.NOTIFICATIONS].path;
  assert.equal(movimentoDaNavegacao(SIMPLIFIED_ROUTES.ACCOUNT, SIMPLIFIED_ROUTES.AGENDA), 'aba');
  assert.equal(movimentoDaNavegacao(notificacoes, SIMPLIFIED_ROUTES.AGENDA), 'aba');
});

test('movimentoDaNavegacao troca na hora entre telas lado a lado e fora do app', () => {
  const tema = ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.THEME].path;
  const voz = ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.VOICE].path;
  const historico = ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.PAYMENT_HISTORY].path;
  const suporte = ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.SUPPORT].path;
  assert.equal(movimentoDaNavegacao(tema, voz), null);
  assert.equal(movimentoDaNavegacao(historico, suporte), null);
  assert.equal(movimentoDaNavegacao(SIMPLIFIED_ROUTES.HOME, SIMPLIFIED_ROUTES.HOME), null);
  assert.equal(movimentoDaNavegacao(SIMPLIFIED_ROUTES.ACCOUNT, '/login'), null);
});
