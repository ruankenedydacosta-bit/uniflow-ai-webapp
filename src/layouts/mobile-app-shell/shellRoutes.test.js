import assert from 'node:assert/strict';
import test from 'node:test';
import { MODULE_IDS } from '../../app/moduleAccess.js';
import { MORE_MENU_ROUTES, filterShellRoutesByContext } from './shellRoutes.js';

// ============================================================================
// UX2 -- Grupo "Gestão" (CRM/Clientes/Projetos) no menu mobile. Comportamento
// real (nao regex): filterShellRoutesByContext e canAccessModule sao as MESMAS
// funcoes puras que a Sidebar desktop usa (moduleAccess.js) -- nenhuma regra
// de autorizacao nova foi criada para o mobile.
// ============================================================================

test('em workspace business (PJ), Clientes/CRM/Projetos aparecem no menu mobile', () => {
  const visible = filterShellRoutesByContext(MORE_MENU_ROUTES, 'business');
  const ids = visible.map((item) => item.id);
  assert.ok(ids.includes('clients'), 'Clientes deveria aparecer em PJ');
  assert.ok(ids.includes('crm'), 'CRM deveria aparecer em PJ');
  assert.ok(ids.includes('projects'), 'Projetos deveria aparecer em PJ');
});

test('em workspace personal (PF), Clientes/CRM/Projetos NAO aparecem no menu mobile', () => {
  const visible = filterShellRoutesByContext(MORE_MENU_ROUTES, 'personal');
  const ids = visible.map((item) => item.id);
  assert.equal(ids.includes('clients'), false, 'Clientes nao deveria aparecer em PF');
  assert.equal(ids.includes('crm'), false, 'CRM nao deveria aparecer em PF');
  assert.equal(ids.includes('projects'), false, 'Projetos nao deveria aparecer em PF');
});

test('rotas do grupo Gestão apontam para os paths corretos', () => {
  const byId = Object.fromEntries(MORE_MENU_ROUTES.map((item) => [item.id, item]));
  assert.equal(byId.clients.path, '/clientes');
  assert.equal(byId.crm.path, '/crm');
  assert.equal(byId.projects.path, '/projetos');
  assert.equal(byId.clients.group, 'management');
  assert.equal(byId.crm.group, 'management');
  assert.equal(byId.projects.group, 'management');
});

test('grupo Gestão usa os MESMOS moduleIds de moduleAccess.js (fonte unica, sem regra duplicada)', () => {
  const byId = Object.fromEntries(MORE_MENU_ROUTES.map((item) => [item.id, item]));
  assert.equal(byId.clients.moduleId, MODULE_IDS.CLIENTES);
  assert.equal(byId.crm.moduleId, MODULE_IDS.CRM);
  assert.equal(byId.projects.moduleId, MODULE_IDS.PROJETOS);
});

test('Clientes/CRM/Projetos nao estao duplicados em nenhum outro grupo do menu mobile', () => {
  const managementIds = ['clients', 'crm', 'projects'];
  const occurrences = MORE_MENU_ROUTES.filter((item) => managementIds.includes(item.id));
  assert.equal(occurrences.length, 3, 'cada item deve aparecer exatamente uma vez em MORE_MENU_ROUTES');
});

// ============================================================================
// UX2 -- Notificações/Suporte: itens comingSoon, nunca navegam nem executam
// handler vazio (achado P0 da UX1: eram cliques mortos sem feedback).
// ============================================================================

test('Notificações e Suporte sao itens comingSoon, sem path nem action (nunca navegam nem disparam handler)', () => {
  const byId = Object.fromEntries(MORE_MENU_ROUTES.map((item) => [item.id, item]));
  assert.equal(byId.notifications.comingSoon, true);
  assert.equal(byId.notifications.path, undefined);
  assert.equal(byId.notifications.action, undefined);
  assert.equal(byId.support.comingSoon, true);
  assert.equal(byId.support.path, undefined);
  assert.equal(byId.support.action, undefined);
});

test('Notificações e Suporte continuam sempre visiveis (sem moduleId, nao dependem de PF/PJ)', () => {
  const visibleBusiness = filterShellRoutesByContext(MORE_MENU_ROUTES, 'business').map((item) => item.id);
  const visiblePersonal = filterShellRoutesByContext(MORE_MENU_ROUTES, 'personal').map((item) => item.id);
  assert.ok(visibleBusiness.includes('notifications'));
  assert.ok(visibleBusiness.includes('support'));
  assert.ok(visiblePersonal.includes('notifications'));
  assert.ok(visiblePersonal.includes('support'));
});

test('nenhum item comingSoon possui moduleId de modulo real (sao acoes puras, sempre visiveis)', () => {
  const byId = Object.fromEntries(MORE_MENU_ROUTES.map((item) => [item.id, item]));
  assert.equal(byId.notifications.moduleId, undefined);
  assert.equal(byId.support.moduleId, undefined);
});
