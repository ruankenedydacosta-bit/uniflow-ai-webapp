import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PLANS, WORKSPACE_TYPES } from '../../../app/access.js';
import { canAccessModule, getModuleContexts } from '../../../app/moduleAccess.js';
import { filterNavigationItems, navigationItems, SIDEBAR_GROUPS } from '../../../app/navigation.js';
import { getDemoPlanCapabilities } from '../../../../supabase/functions/_shared/planCatalog.js';
import {
  MORE_MENU_ROUTES,
} from '../../../layouts/mobile-app-shell/shellRoutes.js';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

const PF = WORKSPACE_TYPES.PERSONAL;
const PJ = WORKSPACE_TYPES.BUSINESS;

const accessPF = {
  userMode: 'personal',
  plan: PLANS.BUSINESS,
  currentWorkspace: PF,
  capabilities: getDemoPlanCapabilities(PLANS.BUSINESS),
};
const accessPJ = {
  userMode: 'business',
  plan: PLANS.BUSINESS,
  currentWorkspace: PJ,
  capabilities: getDemoPlanCapabilities(PLANS.BUSINESS),
};

function groupItems(access, groupId) {
  return filterNavigationItems(navigationItems, access).filter((item) => item.group === groupId);
}

// ============================================================================
// UX6 -- sidebar desktop agrupada. Antes: lista plana de 12 itens sem
// hierarquia. Agora: SIDEBAR_GROUPS (fonte única em navigation.js) organiza
// os mesmos módulos reais em até 5 grupos escaneáveis, sem duplicar nenhuma
// regra de acesso -- a visibilidade continua vindo inteiramente de
// moduleAccess.js/filterNavigationItems.
// ============================================================================

test('SIDEBAR_GROUPS tem no máximo 5 grupos, cada um com id e label', () => {
  assert.ok(SIDEBAR_GROUPS.length <= 5);
  for (const group of SIDEBAR_GROUPS) {
    assert.equal(typeof group.id, 'string');
    assert.equal(typeof group.label, 'string');
    assert.ok(group.label.length > 0);
  }
});

test('todo item de navigationItems pertence a um grupo válido de SIDEBAR_GROUPS -- nenhum módulo perdido na reorganização', () => {
  const groupIds = new Set(SIDEBAR_GROUPS.map((g) => g.id));
  for (const item of navigationItems) {
    assert.ok(groupIds.has(item.group), `item ${item.path} tem group inválido: ${item.group}`);
  }
});

test('Sidebar.jsx itera SIDEBAR_GROUPS na ordem oficial e pula grupos vazios', async () => {
  const content = await source('Sidebar.jsx');
  assert.match(content, /import \{ filterNavigationItems, navigationItems, SIDEBAR_GROUPS \} from '\.\.\/\.\.\/\.\.\/app\/navigation';/);
  assert.match(content, /\{SIDEBAR_GROUPS\.map\(\(group\) => \{/);
  assert.match(content, /if \(!groupItems\.length\) return null;/);
});

test('grupo Gestão fica vazio em PF (CRM/Clientes/Projetos são BUSINESS_ONLY) -- não aparece na sidebar', () => {
  const items = groupItems(accessPF, 'gestao');
  assert.equal(items.length, 0);
});

test('grupo Gestão aparece em PJ com CRM, Clientes e Projetos', () => {
  const items = groupItems(accessPJ, 'gestao').map((item) => item.path);
  assert.deepEqual(items.sort(), ['/clientes', '/crm', '/projetos'].sort());
});

test('itens do grupo Gestão continuam derivados de moduleAccess.js (getModuleContexts), nenhuma regra de acesso nova', () => {
  const gestaoItems = navigationItems.filter((item) => item.group === 'gestao');
  assert.equal(gestaoItems.length, 3);
  for (const item of gestaoItems) {
    assert.deepEqual(item.workspaces, getModuleContexts(item.moduleId));
    assert.equal(canAccessModule(item.moduleId, PF), false);
    assert.equal(canAccessModule(item.moduleId, PJ), true);
  }
});

test('nenhum grupo fica permanentemente vazio para todo contexto (todo grupo declarado tem ao menos 1 item possível)', () => {
  for (const group of SIDEBAR_GROUPS) {
    const itemsAnyContext = navigationItems.filter((item) => item.group === group.id);
    assert.ok(itemsAnyContext.length > 0, `grupo ${group.id} não tem nenhum item associado`);
  }
});

test('item ativo continua usando NavLink isActive + Badge "Ativo" (comportamento preexistente preservado)', async () => {
  const content = await source('Sidebar.jsx');
  assert.match(content, /className=\{\(\{ isActive \}\) => \(isActive \? `\$\{styles\.item\} \$\{styles\.active\}` : styles\.item\)\}/);
  assert.match(content, /variant="primary" size="sm"[\s\S]{0,60}Ativo/);
});

test('nenhuma regra de acesso hardcoded no JSX da Sidebar -- só filterNavigationItems/moduleId/group, nunca comparação direta de workspace ou moduleId', async () => {
  const content = await source('Sidebar.jsx');
  assert.doesNotMatch(content, /workspace\s*===|moduleId\s*===|MODULE_IDS\./);
  assert.match(content, /filterNavigationItems\(navigationItems, access\)/);
});

test('grupo Gestão na sidebar desktop cobre os MESMOS 3 módulos do grupo "management" no menu mobile -- classificação consistente entre desktop e mobile', () => {
  const desktopPaths = navigationItems.filter((item) => item.group === 'gestao').map((item) => item.path).sort();
  const mobilePaths = MORE_MENU_ROUTES.filter((route) => route.group === 'management').map((route) => route.path).sort();
  assert.deepEqual(desktopPaths, mobilePaths);
});
