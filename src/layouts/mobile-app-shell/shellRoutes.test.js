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
// UX2/NOTIF1 -- Notificações e uma acao real (NOTIF1): abre o painel
// compartilhado com o sino desktop via handleShellAction.
// SUPORTE1 -- Suporte deixou de ser comingSoon: agora e uma rota real
// (/suporte, MODULE_IDS.SUPORTE), disponivel em ambos os workspaces (BOTH
// em moduleAccess.js), igual a qualquer outro modulo real da shell.
// ============================================================================

test('Notificações e uma acao real (open-notifications), nunca comingSoon nem clique morto', () => {
  const byId = Object.fromEntries(MORE_MENU_ROUTES.map((item) => [item.id, item]));
  assert.equal(byId.notifications.comingSoon, undefined);
  assert.equal(byId.notifications.path, undefined);
  assert.equal(byId.notifications.action, 'open-notifications');
});

test('Suporte e uma rota real (/suporte), nunca mais comingSoon', () => {
  const byId = Object.fromEntries(MORE_MENU_ROUTES.map((item) => [item.id, item]));
  assert.equal(byId.support.comingSoon, undefined);
  assert.equal(byId.support.path, '/suporte');
  assert.equal(byId.support.action, undefined);
});

test('Notificações continua sempre visivel (sem moduleId); Suporte visivel em PF e PJ (moduleId BOTH)', () => {
  const visibleBusiness = filterShellRoutesByContext(MORE_MENU_ROUTES, 'business').map((item) => item.id);
  const visiblePersonal = filterShellRoutesByContext(MORE_MENU_ROUTES, 'personal').map((item) => item.id);
  assert.ok(visibleBusiness.includes('notifications'));
  assert.ok(visibleBusiness.includes('support'));
  assert.ok(visiblePersonal.includes('notifications'));
  assert.ok(visiblePersonal.includes('support'));
});

test('Notificações continua sem moduleId (acao pura); Suporte agora tem MODULE_IDS.SUPORTE (rota real)', () => {
  const byId = Object.fromEntries(MORE_MENU_ROUTES.map((item) => [item.id, item]));
  assert.equal(byId.notifications.moduleId, undefined);
  assert.equal(byId.support.moduleId, 'suporte');
});

// ============================================================================
// UX3 -- Perfil/Configurações/Segurança levam a secoes distintas e
// enderecaveis (?section=), em vez de apontarem todos para a mesma pagina
// sem diferenciacao (duplicacao confusa apontada na auditoria UX1).
// ============================================================================

test('Perfil/Configurações/Segurança compartilham o mesmo path (/configuracoes) mas cada um tem uma section canonica distinta', () => {
  const byId = Object.fromEntries(MORE_MENU_ROUTES.map((item) => [item.id, item]));
  assert.equal(byId.profile.path, '/configuracoes');
  assert.equal(byId.settings.path, '/configuracoes');
  assert.equal(byId.security.path, '/configuracoes');
  assert.equal(byId.profile.section, 'perfil');
  assert.equal(byId.settings.section, 'preferencias');
  assert.equal(byId.security.section, 'seguranca');
  const sections = new Set([byId.profile.section, byId.settings.section, byId.security.section]);
  assert.equal(sections.size, 3, 'as 3 secoes devem ser distintas entre si');
});
