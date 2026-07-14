import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { MORE_MENU_ROUTES } from './shellRoutes.js';

test('menu Mais possui todos os itens solicitados', () => {
  assert.deepEqual(MORE_MENU_ROUTES.map(({ label }) => label), [
    'Perfil', 'Configurações', 'Segurança', 'Objetivos',
    'Categorias', 'Notificações', 'Suporte', 'Sair',
  ]);
});

test('menu agrupa Conta e Produto e isola Sair', async () => {
  assert.equal(MORE_MENU_ROUTES.filter(({ group }) => group === 'account').length, 3);
  assert.equal(MORE_MENU_ROUTES.filter(({ group }) => group === 'product').length, 4);
  assert.equal(MORE_MENU_ROUTES.find(({ id }) => id === 'sign-out')?.group, 'session');

  const contents = await readFile(new URL('./MoreMenu.jsx', import.meta.url), 'utf8');
  assert.match(contents, />Conta</);
  assert.match(contents, />Produto</);
  assert.match(contents, /drawerSignOut/);
  assert.match(contents, /drawerItemIcon/);
});

test('menu oferece semantica de dialogo e fechamento por Escape', async () => {
  const contents = await readFile(new URL('./MoreMenu.jsx', import.meta.url), 'utf8');
  assert.match(contents, /role="dialog"/);
  assert.match(contents, /aria-modal="true"/);
  assert.match(contents, /event\.key === 'Escape'/);
  assert.match(contents, /\.focus\(\)/);
  assert.match(contents, /if \(!isOpen\) return null/);
  assert.match(contents, /onClose\?\.\(\)/);
});

test('Sair permanece callback e nao implementa autenticacao', async () => {
  const contents = await readFile(new URL('./MoreMenu.jsx', import.meta.url), 'utf8');
  assert.match(contents, /onAction\?\./);
  assert.doesNotMatch(contents, /signOut\s*\(|supabase|fetch\s*\(/i);
});
