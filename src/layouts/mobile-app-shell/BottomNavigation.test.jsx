import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { BOTTOM_NAVIGATION_ROUTES } from './shellRoutes.js';

test('navegacao inferior possui os cinco destinos na ordem oficial', () => {
  assert.deepEqual(BOTTOM_NAVIGATION_ROUTES.map(({ label }) => label), [
    'Home', 'Financeiro', 'Uni', 'Agenda', 'Mais',
  ]);
});

test('Home preserva a rota atual do Dashboard', () => {
  assert.equal(BOTTOM_NAVIGATION_ROUTES[0].path, '/dashboard');
});

test('rotas da navegacao permanecem profundamente imutaveis', () => {
  assert.equal(Object.isFrozen(BOTTOM_NAVIGATION_ROUTES), true);
  assert.equal(BOTTOM_NAVIGATION_ROUTES.every(Object.isFrozen), true);
});

test('Uni usa componente central e Mais abre dialogo', async () => {
  const contents = await readFile(new URL('./BottomNavigation.jsx', import.meta.url), 'utf8');
  assert.match(contents, /<UniCenterButton/);
  assert.match(contents, /aria-haspopup="dialog"/);
  assert.match(contents, /aria-label="Navegação principal mobile"/);
});
