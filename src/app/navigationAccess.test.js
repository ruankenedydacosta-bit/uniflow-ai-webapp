import assert from 'node:assert/strict';
import test from 'node:test';

import { USER_MODES, PLANS, WORKSPACE_TYPES, DEFAULT_DEMO_ACCESS } from './access.js';
import { MODULE_IDS, modulesForContext } from './moduleAccess.js';
import { navigationItems, filterNavigationItems } from './navigation.js';
import {
  canAccessRouteInContext,
  getFallbackRoute,
} from './accessRules.js';
import {
  BOTTOM_NAVIGATION_ROUTES,
  MORE_MENU_ROUTES,
  filterShellRoutesByContext,
} from '../layouts/mobile-app-shell/shellRoutes.js';

const PF = WORKSPACE_TYPES.PERSONAL;
const PJ = WORKSPACE_TYPES.BUSINESS;

const accessPF = {
  userMode: USER_MODES.PERSONAL,
  plan: PLANS.FREE,
  currentWorkspace: PF,
};
const accessPJ = {
  userMode: USER_MODES.BUSINESS,
  plan: PLANS.BUSINESS,
  currentWorkspace: PJ,
};
const accessBoth = {
  userMode: USER_MODES.BOTH,
  plan: PLANS.ENTERPRISE,
  currentWorkspace: PJ,
};

const labels = (items) => items.map((i) => i.label);
const paths = (items) => items.map((i) => i.path);

// ── Sidebar desktop (filterNavigationItems) ──────────────────────────────────

test('Sidebar PF: oculta módulos PJ-exclusivos (CRM/Clientes/Projetos)', () => {
  const visible = paths(filterNavigationItems(navigationItems, accessPF));
  assert.ok(visible.includes('/dashboard'));
  assert.ok(visible.includes('/financeiro'));
  assert.ok(!visible.includes('/crm'));
  assert.ok(!visible.includes('/clientes'));
  assert.ok(!visible.includes('/projetos'));
});

test('Sidebar PJ: mostra módulos empresariais + compartilhados', () => {
  const visible = paths(filterNavigationItems(navigationItems, accessPJ));
  assert.ok(visible.includes('/crm'));
  assert.ok(visible.includes('/clientes'));
  assert.ok(visible.includes('/projetos'));
  assert.ok(visible.includes('/dashboard'));
  assert.ok(visible.includes('/financeiro'));
});

test('Troca PF→PJ e PJ→PF atualiza a Sidebar (mesma fonte, contexto diferente)', () => {
  const pf = paths(filterNavigationItems(navigationItems, accessPF));
  const pj = paths(filterNavigationItems(navigationItems, accessPJ));
  assert.notDeepEqual(pf, pj);
  assert.ok(!pf.includes('/crm') && pj.includes('/crm'));
});

test('permissões por plano preservam Relatórios e Gestão para os quatro planos', () => {
  const expectations = [
    { plan: PLANS.FREE, reports: false, management: false },
    { plan: PLANS.PRO, reports: true, management: false },
    { plan: PLANS.BUSINESS, reports: true, management: true },
    { plan: PLANS.ENTERPRISE, reports: true, management: true },
  ];

  for (const expected of expectations) {
    const visible = paths(filterNavigationItems(navigationItems, {
      userMode: USER_MODES.BUSINESS,
      plan: expected.plan,
      currentWorkspace: PJ,
    }));
    assert.equal(visible.includes('/relatorios'), expected.reports, `${expected.plan}: Relatórios`);
    assert.equal(visible.includes('/crm'), expected.management, `${expected.plan}: CRM`);
    assert.equal(visible.includes('/clientes'), expected.management, `${expected.plan}: Clientes`);
    assert.equal(visible.includes('/projetos'), expected.management, `${expected.plan}: Projetos`);
  }
});

// ── BottomNavigation (mesma fonte declarativa) ───────────────────────────────

test('BottomNavigation PF e PJ: itens fixos são todos compartilhados (composição estável)', () => {
  const pf = filterShellRoutesByContext(BOTTOM_NAVIGATION_ROUTES, PF);
  const pj = filterShellRoutesByContext(BOTTOM_NAVIGATION_ROUTES, PJ);
  assert.deepEqual(labels(pf), ['Home', 'Financeiro', 'Uni', 'Agenda', 'Mais']);
  assert.deepEqual(labels(pf), labels(pj));
});

test('BottomNavigation nunca expõe rota proibida no contexto', () => {
  for (const ctx of [PF, PJ]) {
    const visible = filterShellRoutesByContext(BOTTOM_NAVIGATION_ROUTES, ctx);
    for (const item of visible) {
      if (item.path) assert.ok(canAccessRouteInContext(item, ctx));
    }
  }
});

// ── Menu "Mais" ──────────────────────────────────────────────────────────────

test('Menu Mais PF/PJ: só módulos permitidos + ações puras', () => {
  const pf = filterShellRoutesByContext(MORE_MENU_ROUTES, PF);
  const pj = filterShellRoutesByContext(MORE_MENU_ROUTES, PJ);
  // UX2: grupo "Gestão" (Clientes/CRM/Projetos) é BUSINESS_ONLY -- só aparece
  // em PJ, mesmo padrão já usado pela Sidebar desktop (ver teste da linha 59).
  assert.ok(!labels(pf).includes('Clientes'));
  assert.ok(!labels(pf).includes('CRM'));
  assert.ok(!labels(pf).includes('Projetos'));
  assert.ok(labels(pj).includes('Clientes'));
  assert.ok(labels(pj).includes('CRM'));
  assert.ok(labels(pj).includes('Projetos'));
  // Fora do grupo Gestão, a composição continua idêntica nos dois contextos.
  const withoutManagement = (items) => items.filter((i) => i.group !== 'management');
  assert.deepEqual(labels(withoutManagement(pf)), labels(withoutManagement(pj)));
  // Ações puras (sem moduleId) sempre presentes.
  assert.ok(pf.some((i) => i.id === 'sign-out'));
  assert.ok(pf.some((i) => i.id === 'notifications'));
});

test('Menu Mais: grupo sem itens não deve renderizar (lógica de grupo vazio)', () => {
  // Simula um contexto hipotético que zera o grupo "product".
  const fakeItems = [
    { id: 'settings', label: 'Config', group: 'account', path: '/configuracoes', moduleId: MODULE_IDS.CONFIGURACOES },
    { id: 'crmish', label: 'CRM-ish', group: 'product', path: '/crm', moduleId: MODULE_IDS.CRM },
  ];
  const visible = filterShellRoutesByContext(fakeItems, PF);
  const productItems = visible.filter((i) => i.group === 'product');
  assert.equal(productItems.length, 0); // grupo Produto ficaria vazio → não renderiza
  const accountItems = visible.filter((i) => i.group === 'account');
  assert.equal(accountItems.length, 1);
});

// ── Guard de rota (contexto) ─────────────────────────────────────────────────

const crmRoute = { path: '/crm', moduleId: MODULE_IDS.CRM };
const financeRoute = { path: '/financeiro', moduleId: MODULE_IDS.FINANCEIRO };
const techRoute = { path: '/algo-tecnico' }; // sem moduleId

test('rota compartilhada permitida nos dois contextos', () => {
  assert.equal(canAccessRouteInContext(financeRoute, PF), true);
  assert.equal(canAccessRouteInContext(financeRoute, PJ), true);
});

test('rota PJ bloqueada em PF (acesso direto por URL)', () => {
  assert.equal(canAccessRouteInContext(crmRoute, PF), false);
  assert.equal(canAccessRouteInContext(crmRoute, PJ), true);
});

test('rota sem moduleId não é bloqueada por contexto (rota técnica)', () => {
  assert.equal(canAccessRouteInContext(techRoute, PF), true);
  assert.equal(canAccessRouteInContext(null, PF), true);
});

test('contexto inválido → guard nega módulo restrito sem lançar (sem loop)', () => {
  assert.equal(canAccessRouteInContext(crmRoute, 'xxx'), false);
});

// ── Fallback de rota ─────────────────────────────────────────────────────────

test('fallback é a Home do contexto atual (/dashboard) em PF e PJ', () => {
  assert.equal(getFallbackRoute(PF, navigationItems), '/dashboard');
  assert.equal(getFallbackRoute(PJ, navigationItems), '/dashboard');
});

test('fallback tier 2: sem dashboard, usa primeiro módulo compartilhado seguro', () => {
  const meta = [
    { moduleId: MODULE_IDS.CRM, path: '/crm' },
    { moduleId: MODULE_IDS.FINANCEIRO, path: '/financeiro' },
  ];
  assert.equal(getFallbackRoute(PF, meta), '/financeiro'); // CRM é PJ-only, pulado
});

test('fallback tier 3: sem rota segura, cai no genérico /dashboard', () => {
  const meta = [{ moduleId: MODULE_IDS.CRM, path: '/crm' }];
  assert.equal(getFallbackRoute(PF, meta), '/dashboard');
  assert.equal(getFallbackRoute(PF, []), '/dashboard');
});

// ── Modo demo ────────────────────────────────────────────────────────────────

test('demo inicia em PF: navegação não mostra CRM/Clientes/Projetos', () => {
  assert.equal(DEFAULT_DEMO_ACCESS.currentWorkspace, PF);
  const mods = modulesForContext(DEFAULT_DEMO_ACCESS.currentWorkspace);
  assert.ok(!mods.includes(MODULE_IDS.CRM));
  assert.ok(!mods.includes(MODULE_IDS.CLIENTES));
  assert.ok(!mods.includes(MODULE_IDS.PROJETOS));
  assert.ok(mods.includes(MODULE_IDS.DASHBOARD));
});

test('demo trocado para PJ atualiza módulos disponíveis', () => {
  const pjMods = modulesForContext(PJ);
  assert.ok(pjMods.includes(MODULE_IDS.CRM));
});

// ── aria-current: item ativo só entre os visíveis, nunca rota proibida ────────

function resolveActive(visibleItems, pathname) {
  return visibleItems.find((i) => i.path === pathname) ?? null;
}

test('aria-current: item ativo pertence ao conjunto visível do contexto', () => {
  const visiblePF = filterShellRoutesByContext(BOTTOM_NAVIGATION_ROUTES, PF);
  const active = resolveActive(visiblePF, '/financeiro');
  assert.ok(active && active.id === 'finance');
});

test('aria-current: rota proibida no contexto não resolve item ativo', () => {
  const visiblePF = filterNavigationItems(navigationItems, accessPF);
  const active = resolveActive(visiblePF, '/crm');
  assert.equal(active, null); // após redirect, nenhum item PF fica ativo em /crm
});

// ── Ausência de regra divergente desktop vs mobile ───────────────────────────

test('desktop e mobile compartilham a MESMA fonte declarativa (sem divergência)', () => {
  // Um módulo PJ-only (CRM) deve ser negado no PF em ambas as camadas.
  const sidebarPF = paths(filterNavigationItems(navigationItems, accessPF));
  assert.ok(!sidebarPF.includes('/crm'));
  assert.equal(canAccessRouteInContext(crmRoute, PF), false);
});

test('usuário PF+PJ (both) mantém acesso empresarial no contexto PJ', () => {
  const visible = paths(filterNavigationItems(navigationItems, accessBoth));
  assert.ok(visible.includes('/crm'));
});

// ============================================================================
// UX5 -- clareza PF/PJ: a autorização em si (canAccessRouteInContext,
// getFallbackRoute, moduleAccess.js) permanece EXATAMENTE a mesma; só a
// comunicação ao redor dela muda (App.jsx/AuthenticatedLayout.jsx). Estes
// testes travam que nenhuma regra nova de bloqueio foi introduzida aqui.
// ============================================================================

test('CRM/Clientes/Projetos continuam bloqueados em PF -- autorização não foi enfraquecida por UX5', () => {
  const clientesRoute = navigationItems.find((item) => item.path === '/clientes');
  const projetosRoute = navigationItems.find((item) => item.path === '/projetos');
  assert.equal(canAccessRouteInContext(crmRoute, PF), false);
  assert.equal(canAccessRouteInContext(clientesRoute, PF), false);
  assert.equal(canAccessRouteInContext(projetosRoute, PF), false);
  assert.equal(canAccessRouteInContext(crmRoute, PJ), true);
  assert.equal(canAccessRouteInContext(clientesRoute, PJ), true);
  assert.equal(canAccessRouteInContext(projetosRoute, PJ), true);
});

test('getFallbackRoute nunca aponta de volta para a própria rota bloqueada (sem risco de loop)', () => {
  assert.equal(getFallbackRoute(PF, navigationItems), '/dashboard');
  assert.notEqual(getFallbackRoute(PF, navigationItems), '/crm');
});
