import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { WORKSPACE_TYPES } from './access.js';
import { MODULE_IDS, MODULE_ACCESS, canAccessModule, getModuleContexts } from './moduleAccess.js';
import { navigationItems } from './navigation.js';
import {
  BOTTOM_NAVIGATION_ROUTES,
  MORE_MENU_ROUTES,
  filterShellRoutesByContext,
} from '../layouts/mobile-app-shell/shellRoutes.js';

const PF = WORKSPACE_TYPES.PERSONAL;
const PJ = WORKSPACE_TYPES.BUSINESS;

const routesSource = await readFile(new URL('./routes.jsx', import.meta.url), 'utf8');
const appRoutesBlock = routesSource.slice(routesSource.indexOf('export const appRoutes = ['));

function extractPaths(block) {
  return [...block.matchAll(/path: '([^']+)'/g)].map((m) => m[1]);
}

const appRoutePaths = extractPaths(appRoutesBlock);
const shellPaths = [...BOTTOM_NAVIGATION_ROUTES, ...MORE_MENU_ROUTES]
  .filter((route) => route.path)
  .map((route) => route.path);

// ── unicidade de IDs ──────────────────────────────────────────────────────────

test('MODULE_IDS: todos os IDs de módulo são únicos', () => {
  const ids = Object.values(MODULE_IDS);
  assert.equal(ids.length, new Set(ids).size);
});

test('MODULE_ACCESS: cobre exatamente os módulos declarados em MODULE_IDS', () => {
  const declaredIds = Object.values(MODULE_IDS).sort();
  const accessIds = Object.keys(MODULE_ACCESS).sort();
  assert.deepEqual(accessIds, declaredIds);
});

// ── unicidade de paths ────────────────────────────────────────────────────────

test('routes.jsx: nenhum path duplicado em appRoutes', () => {
  assert.equal(appRoutePaths.length, new Set(appRoutePaths).size);
});

test('navigation.js: nenhum path duplicado em navigationItems', () => {
  const paths = navigationItems.map((item) => item.path);
  assert.equal(paths.length, new Set(paths).size);
});

// ── módulos obrigatórios presentes ────────────────────────────────────────────

const REQUIRED_MODULE_PATHS = {
  [MODULE_IDS.CATEGORIAS]: '/categorias',
  [MODULE_IDS.PROJETOS]: '/projetos',
  [MODULE_IDS.RELATORIOS]: '/relatorios',
  [MODULE_IDS.OPEN_FINANCE]: '/open-finance',
  [MODULE_IDS.FUTURO]: '/futuro',
  [MODULE_IDS.OBJETIVOS]: '/objetivos',
  [MODULE_IDS.UNI_AI]: '/uni-ai',
};

test('routes.jsx: módulos obrigatórios possuem rota válida com o path esperado', () => {
  for (const [moduleId, path] of Object.entries(REQUIRED_MODULE_PATHS)) {
    assert.ok(
      appRoutesBlock.includes(`moduleId: MODULE_IDS.${Object.keys(MODULE_IDS).find((k) => MODULE_IDS[k] === moduleId)}`),
      `moduleId ${moduleId} ausente em appRoutes`,
    );
    assert.ok(appRoutePaths.includes(path), `path ${path} ausente em appRoutes`);
  }
});

test('navigation.js: módulos obrigatórios aparecem na navegação desktop', () => {
  const navPaths = navigationItems.map((item) => item.path);
  for (const path of Object.values(REQUIRED_MODULE_PATHS)) {
    assert.ok(navPaths.includes(path), `path ${path} ausente em navigationItems`);
  }
});

// ── navegação sem links mortos ────────────────────────────────────────────────

test('navigation.js: todo path de navigationItems existe em appRoutes (sem link morto)', () => {
  for (const item of navigationItems) {
    assert.ok(appRoutePaths.includes(item.path), `navigationItems aponta para path inexistente: ${item.path}`);
  }
});

test('shellRoutes.js: todo path da shell mobile (Bottom + Mais) existe em appRoutes', () => {
  for (const path of shellPaths) {
    assert.ok(appRoutePaths.includes(path), `shell mobile aponta para path inexistente: ${path}`);
  }
});

test('shellRoutes.js: módulos compartilhados (BOTH) do escopo mobile estão presentes no menu Mais ou na barra inferior', () => {
  // Projetos/CRM/Clientes são PJ-only e, por design, não aparecem no menu mobile
  // (mesmo padrão já usado por CRM/Clientes antes desta consolidação).
  for (const path of [
    REQUIRED_MODULE_PATHS[MODULE_IDS.CATEGORIAS],
    REQUIRED_MODULE_PATHS[MODULE_IDS.RELATORIOS],
    REQUIRED_MODULE_PATHS[MODULE_IDS.OPEN_FINANCE],
    REQUIRED_MODULE_PATHS[MODULE_IDS.FUTURO],
    REQUIRED_MODULE_PATHS[MODULE_IDS.OBJETIVOS],
    REQUIRED_MODULE_PATHS[MODULE_IDS.UNI_AI],
  ]) {
    assert.ok(shellPaths.includes(path), `path ${path} ausente da shell mobile`);
  }
});

// ── consistência entre acesso, rotas e shell ──────────────────────────────────

test('navigation.js: workspaces de cada item vem sempre de getModuleContexts (mesma fonte)', () => {
  for (const item of navigationItems) {
    assert.deepEqual(item.workspaces, getModuleContexts(item.moduleId));
  }
});

test('shellRoutes.js: filterShellRoutesByContext concorda com canAccessModule para todo item com moduleId', () => {
  for (const ctx of [PF, PJ]) {
    for (const routes of [BOTTOM_NAVIGATION_ROUTES, MORE_MENU_ROUTES]) {
      const visible = filterShellRoutesByContext(routes, ctx);
      for (const route of routes) {
        const shouldBeVisible = route.moduleId ? canAccessModule(route.moduleId, ctx) : true;
        assert.equal(visible.includes(route), shouldBeVisible);
      }
    }
  }
});

test('desktop e mobile concordam sobre acesso por contexto para todo módulo compartilhado', () => {
  for (const moduleId of Object.values(MODULE_IDS)) {
    for (const ctx of [PF, PJ]) {
      const navItem = navigationItems.find((item) => item.moduleId === moduleId);
      if (!navItem) continue;
      const navAllows = navItem.workspaces.includes(ctx);
      assert.equal(navAllows, canAccessModule(moduleId, ctx));
    }
  }
});

// ── ausência de dependência do Dashboard ──────────────────────────────────────

test('moduleAccess.js não depende de nenhum arquivo do Dashboard', async () => {
  const source = await readFile(new URL('./moduleAccess.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /features\/dashboard/);
});

test('shellRoutes.js não depende de nenhum arquivo do Dashboard (apenas moduleAccess.js)', async () => {
  const source = await readFile(new URL('../layouts/mobile-app-shell/shellRoutes.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /features\/dashboard/);
});
