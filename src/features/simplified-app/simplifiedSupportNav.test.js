import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  resolveSimplifiedFeatureFlags,
  SIMPLIFIED_FEATURE_FLAG_KEYS,
} from './simplifiedFeatureFlags.js';
import {
  resolveSimplifiedNavigation,
  SIMPLIFIED_ROUTES,
} from './simplifiedRoutes.js';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('LOTE D: Suporte sai da barra inferior e a navegação é fixa em três itens', () => {
  assert.equal(SIMPLIFIED_FEATURE_FLAG_KEYS.SUPPORT_NAV, 'VITE_SIMPLIFIED_SUPPORT_NAV_ENABLED');
  assert.equal(resolveSimplifiedFeatureFlags({}).supportNavEnabled, false);
  assert.deepEqual(
    resolveSimplifiedNavigation().map(({ label, path }) => ({ label, path })),
    [
      { label: 'Home', path: '/app/home' },
      { label: 'Registros', path: '/app/registros' },
      { label: 'Conta', path: '/app/conta' },
    ],
  );
});

test('LOTE D: rota de conversa de suporte é SEMPRE registrada e a entrada continua em Conta', async () => {
  const routes = await source('../../app/routes.jsx');
  assert.equal(SIMPLIFIED_ROUTES.SUPPORT_CHAT, '/app/conta/suporte/uni');
  assert.match(routes, /path: SIMPLIFIED_ROUTES\.SUPPORT_CHAT/);
  assert.match(routes, /<SupportCenterPage \/>/);
  assert.doesNotMatch(routes, /SIMPLIFIED_FEATURE_FLAGS\.supportNavEnabled/);
});

test('LOTE D: botão "Falar com a Uni" navega para a conversa de suporte', async () => {
  const page = await source('./SimplifiedSupportPage.jsx');
  assert.match(page, /simplifiedRoutes\.js/);
  assert.match(page, /SIMPLIFIED_ROUTES\.SUPPORT_CHAT/);
  assert.match(page, /: SIMPLIFIED_ROUTES\.UNI/);
});

test('LOTE D: chat de suporte preserva conversa e prompt sem caminho financeiro', async () => {
  const [chat, context] = await Promise.all([
    source('../uni-support/useUniSupportChat.js'),
    source('../product-knowledge/uniSupportContext.js'),
  ]);
  assert.match(chat, /createSupportConversation\(/);
  assert.match(chat, /generateSupportResponse\(/);
  assert.doesNotMatch(chat, /generateContextualResponse|financialContext|tool.?call/i);
  assert.match(context, /mode: UNI_MODE\.SUPPORT/);
  assert.doesNotMatch(context, /financialContext|financialSummary/);
});

test('LOTE D: navegação com três itens mantém contagem responsiva na barra', async () => {
  const navigation = await source('./SimplifiedBottomNavigation.jsx');
  assert.match(navigation, /SIMPLIFIED_ROUTE_IDS\.ACCOUNT/);
  assert.match(navigation, /--simplified-navigation-count/);
});