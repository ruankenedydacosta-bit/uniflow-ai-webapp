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

test('navegação da Uni Suporte nasce desligada e exige true literal', () => {
  assert.equal(SIMPLIFIED_FEATURE_FLAG_KEYS.SUPPORT_NAV, 'VITE_SIMPLIFIED_SUPPORT_NAV_ENABLED');
  assert.equal(resolveSimplifiedFeatureFlags({}).supportNavEnabled, false);
  assert.equal(resolveSimplifiedFeatureFlags({ VITE_SIMPLIFIED_SUPPORT_NAV_ENABLED: 'TRUE' }).supportNavEnabled, false);
  assert.equal(resolveSimplifiedFeatureFlags({ VITE_SIMPLIFIED_SUPPORT_NAV_ENABLED: 'true' }).supportNavEnabled, true);
});

test('flag desligada preserva a navegação atual e flag ligada expõe somente Suporte', () => {
  assert.deepEqual(
    resolveSimplifiedNavigation({}).map(({ label }) => label),
    ['Home', 'Registros', 'Conta'],
  );
  assert.deepEqual(
    resolveSimplifiedNavigation({ supportNavEnabled: true }).map(({ label, path }) => ({ label, path })),
    [
      { label: 'Home', path: '/app/home' },
      { label: 'Registros', path: '/app/registros' },
      { label: 'Suporte', path: '/app/conta/suporte' },
      { label: 'Conta', path: '/app/conta' },
    ],
  );
});

test('rota de conversa simplificada reutiliza SupportCenterPage somente com a flag', async () => {
  const routes = await source('../../app/routes.jsx');
  assert.equal(SIMPLIFIED_ROUTES.SUPPORT_CHAT, '/app/conta/suporte/uni');
  assert.match(routes, /SIMPLIFIED_FEATURE_FLAGS\.supportNavEnabled/);
  assert.match(routes, /path: SIMPLIFIED_ROUTES\.SUPPORT_CHAT/);
  assert.match(routes, /<SupportCenterPage \/>/);
});

test('entrada da tela de suporte mantém o comportamento atual quando desligada e usa o chat de suporte quando ligada', async () => {
  const page = await source('./SimplifiedSupportPage.jsx');
  assert.match(page, /SIMPLIFIED_FEATURE_FLAGS\.supportNavEnabled/);
  assert.match(page, /\? SIMPLIFIED_ROUTES\.SUPPORT_CHAT/);
  assert.match(page, /: SIMPLIFIED_ROUTES\.UNI/);
});

test('chat reutilizado preserva conversa e prompt de suporte sem caminho financeiro', async () => {
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

test('navegação usa ícone existente e mantém quantidade de colunas responsiva', async () => {
  const navigation = await source('./SimplifiedBottomNavigation.jsx');
  assert.match(navigation, /HelpIcon/);
  assert.match(navigation, /SIMPLIFIED_ROUTE_IDS\.SUPPORT/);
  assert.match(navigation, /--simplified-navigation-count/);
});
