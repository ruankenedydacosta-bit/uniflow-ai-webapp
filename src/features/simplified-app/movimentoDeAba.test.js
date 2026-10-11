import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abaDaRota, sentidoDaAba } from './movimentoDeAba.js';
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
