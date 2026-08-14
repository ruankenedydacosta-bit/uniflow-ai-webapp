import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GA4_EXCLUDED_PATHS,
  GA4_PAGE_CATALOG,
  buildGa4PageView,
  resolveGa4Config,
  resolveGa4Page,
} from './ga4Contracts.js';
import { ACCOUNT_SUBROUTES } from '../simplified-app/simplifiedAccountRoutes.js';
import { SIMPLIFIED_ROUTES } from '../simplified-app/simplifiedRoutes.js';

test('GA4 nasce desligado e exige Measurement ID válido', () => {
  assert.deepEqual(resolveGa4Config(), {
    enabled: false,
    requestedEnabled: false,
    hasValidMeasurementId: false,
    measurementId: '',
  });
  assert.equal(resolveGa4Config({ VITE_GA4_ENABLED: 'true' }).enabled, false);
  assert.equal(resolveGa4Config({
    VITE_GA4_ENABLED: 'true',
    VITE_GA4_MEASUREMENT_ID: 'invalid',
  }).enabled, false);
  assert.equal(resolveGa4Config({
    VITE_GA4_ENABLED: 'true',
    VITE_GA4_MEASUREMENT_ID: 'G-TEST123',
  }).enabled, true);
});

test('catálogo é fechado e inclui somente páginas canônicas explícitas', () => {
  assert.equal(Object.isFrozen(GA4_PAGE_CATALOG), true);
  assert.equal(resolveGa4Page('/welcome').title, 'Welcome');
  assert.equal(resolveGa4Page('/app/home').title, 'Home');
  assert.equal(resolveGa4Page('/app/conta/tema').title, 'Conta - Tema');
  assert.equal(resolveGa4Page('/app/conta/pagamentos/historico').title, 'Conta - Historico de Pagamentos');
  assert.equal(resolveGa4Page('/dashboard'), null);
  assert.equal(resolveGa4Page('/rota-desconhecida'), null);
});

test('todas as rotas simplificadas e subrotas legítimas de Conta estão catalogadas', () => {
  const simplifiedPaths = [
    SIMPLIFIED_ROUTES.HOME,
    SIMPLIFIED_ROUTES.UNI,
    SIMPLIFIED_ROUTES.RECORDS,
    SIMPLIFIED_ROUTES.AGENDA,
    SIMPLIFIED_ROUTES.ACCOUNT,
    SIMPLIFIED_ROUTES.SUPPORT,
    SIMPLIFIED_ROUTES.SUPPORT_CHAT,
  ];
  const accountPaths = Object.values(ACCOUNT_SUBROUTES).map((route) => route.path);

  for (const pathname of new Set([...simplifiedPaths, ...accountPaths])) {
    assert.ok(resolveGa4Page(pathname), pathname);
  }
});

test('rotas técnicas, callbacks e redirects são deliberadamente excluídos', () => {
  for (const pathname of GA4_EXCLUDED_PATHS) {
    assert.equal(resolveGa4Page(pathname), null, pathname);
  }
  assert.equal(resolveGa4Page('/auth/callback?code=secret&state=secret'), null);
  assert.equal(resolveGa4Page('/redefinir-senha#access_token=secret'), null);
});

test('page_location contém exclusivamente origin e pathname canônico', () => {
  const pageView = buildGa4PageView(
    '/app/home?_gl=secret&code=oauth&access_token=token#fragment',
    'https://app.example.test/base?unsafe=true',
  );

  assert.deepEqual(pageView, {
    page_title: 'Home',
    page_location: 'https://app.example.test/app/home',
  });
  assert.doesNotMatch(JSON.stringify(pageView), /_gl|code|access_token|fragment|unsafe/);
});

test('títulos são fixos e não possuem conteúdo identificável', () => {
  for (const page of Object.values(GA4_PAGE_CATALOG)) {
    assert.match(page.title, /^[A-Za-z -]+$/);
    assert.doesNotMatch(page.title, /@|R\$|\d{3,}/);
  }
});
