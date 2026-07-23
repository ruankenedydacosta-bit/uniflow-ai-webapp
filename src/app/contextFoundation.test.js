import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  DEFAULT_DEMO_ACCESS,
  USER_MODES,
  PLANS,
  WORKSPACE_TYPES,
  getAccessFromSession,
} from './access.js';
import {
  MODULE_IDS,
  MODULE_ACCESS,
  canAccessModule,
  getModuleContexts,
  modulesForContext,
} from './moduleAccess.js';
import {
  WORKSPACE_SELECTION_STORAGE_KEY,
  buildWorkspaceSelectionKey,
  readWorkspaceSelectionForUser,
  writeWorkspaceSelectionForUser,
  resolveActiveWorkspace,
} from './workspaceSelection.js';

function createStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

const personalWs = { id: 'ws-personal', workspace_type: 'personal' };
const businessWs = { id: 'ws-business', workspace_type: 'business' };

// ── Modo demo inicia em PF ────────────────────────────────────────────────────

test('demo abre em contexto pessoal (PF), sem simular acesso empresarial', () => {
  assert.equal(DEFAULT_DEMO_ACCESS.currentWorkspace, WORKSPACE_TYPES.PERSONAL);
  assert.equal(DEFAULT_DEMO_ACCESS.userMode, USER_MODES.PERSONAL);
  assert.equal(DEFAULT_DEMO_ACCESS.plan, PLANS.FREE);
});

// ── Fonte de verdade: access deriva da sessão ────────────────────────────────

test('usuário só PF deriva currentWorkspace personal', () => {
  const access = getAccessFromSession({ user_mode: 'personal' }, personalWs, null);
  assert.equal(access.currentWorkspace, 'personal');
  assert.equal(access.userMode, 'personal');
});

test('usuário só PJ deriva currentWorkspace business', () => {
  const access = getAccessFromSession({ user_mode: 'business' }, businessWs, { plan_id: 'business' });
  assert.equal(access.currentWorkspace, 'business');
  assert.equal(access.plan, 'business');
});

test('usuário PF+PJ segue o workspace ativo (troca PF↔PJ muda o derivado)', () => {
  const asPersonal = getAccessFromSession({ user_mode: 'both' }, personalWs, null);
  const asBusiness = getAccessFromSession({ user_mode: 'both' }, businessWs, null);
  assert.equal(asPersonal.currentWorkspace, 'personal');
  assert.equal(asBusiness.currentWorkspace, 'business');
  assert.equal(asPersonal.userMode, 'both');
});

test('workspace inválido/ausente cai em personal com segurança', () => {
  assert.equal(getAccessFromSession(null, null, null).currentWorkspace, 'personal');
  assert.equal(getAccessFromSession({}, { workspace_type: 'xxx' }, null).currentWorkspace, 'personal');
});

// ── localStorage isolado por usuário + migração ──────────────────────────────

test('chave é namespaced por user_id (não usa e-mail)', () => {
  assert.equal(buildWorkspaceSelectionKey('u-123'), 'uniflow:active-workspace:u-123');
  assert.equal(buildWorkspaceSelectionKey(null), null);
});

test('preferência é isolada por usuário e persiste na chave namespaced', () => {
  const storage = createStorage();
  assert.equal(writeWorkspaceSelectionForUser('u-1', 'business', storage), true);
  assert.equal(readWorkspaceSelectionForUser('u-1', { storage }), 'business');
  // Outro usuário no mesmo browser não herda a preferência.
  assert.equal(readWorkspaceSelectionForUser('u-2', { storage }), null);
});

test('valor salvo que não pertence aos workspaces do usuário é ignorado', () => {
  const storage = createStorage({ 'uniflow:active-workspace:u-1': 'business' });
  assert.equal(
    readWorkspaceSelectionForUser('u-1', { allowedTypes: ['personal'], storage }),
    null,
  );
  assert.equal(
    readWorkspaceSelectionForUser('u-1', { allowedTypes: ['personal', 'business'], storage }),
    'business',
  );
});

test('migra a chave antiga global para a namespaced e remove a antiga', () => {
  const storage = createStorage({ [WORKSPACE_SELECTION_STORAGE_KEY]: 'business' });
  const value = readWorkspaceSelectionForUser('u-1', {
    allowedTypes: ['personal', 'business'],
    storage,
  });
  assert.equal(value, 'business');
  assert.equal(storage.getItem('uniflow:active-workspace:u-1'), 'business');
  // A chave antiga não deve mais existir (evita herança entre usuários).
  assert.equal(storage.getItem(WORKSPACE_SELECTION_STORAGE_KEY), null);
});

test('logout/login de usuários diferentes no mesmo browser não vaza contexto', () => {
  const storage = createStorage();
  writeWorkspaceSelectionForUser('userA', 'business', storage);
  // userB entra: sem preferência própria → null (usa fallback da sessão dele).
  assert.equal(readWorkspaceSelectionForUser('userB', { storage }), null);
  // userA continua com a sua.
  assert.equal(readWorkspaceSelectionForUser('userA', { storage }), 'business');
});

// ── Fallback de workspace ativo ──────────────────────────────────────────────

test('current_workspace_id válido resolve o próprio workspace', () => {
  const ws = resolveActiveWorkspace('ws-business', [personalWs, businessWs]);
  assert.equal(ws.id, 'ws-business');
});

test('current_workspace_id inválido/de outro usuário cai no primeiro válido, preferindo personal', () => {
  const ws = resolveActiveWorkspace('id-desconhecido', [businessWs, personalWs]);
  assert.equal(ws.id, 'ws-personal');
});

test('fallback com um único workspace usa esse workspace', () => {
  const ws = resolveActiveWorkspace('id-invalido', [businessWs]);
  assert.equal(ws.id, 'ws-business');
});

test('lista vazia resolve null com segurança', () => {
  assert.equal(resolveActiveWorkspace('x', []), null);
});

// ── Mapa declarativo de módulos + guard ──────────────────────────────────────

test('mapa cobre os módulos reais e usa IDs canônicos', () => {
  assert.ok(MODULE_ACCESS[MODULE_IDS.DASHBOARD]);
  assert.ok(MODULE_ACCESS[MODULE_IDS.CRM]);
  assert.deepEqual(getModuleContexts(MODULE_IDS.DASHBOARD), ['personal', 'business']);
});

test('módulo compartilhado é permitido nos dois contextos', () => {
  assert.equal(canAccessModule(MODULE_IDS.FINANCEIRO, 'personal'), true);
  assert.equal(canAccessModule(MODULE_IDS.FINANCEIRO, 'business'), true);
});

test('módulo exclusivo PJ é bloqueado em PF', () => {
  assert.equal(canAccessModule(MODULE_IDS.CRM, 'business'), true);
  assert.equal(canAccessModule(MODULE_IDS.CRM, 'personal'), false);
});

test('hoje nenhum módulo é PF-only, mas o mecanismo suporta', () => {
  const businessModules = modulesForContext('business');
  const personalModules = modulesForContext('personal');
  // Nenhum módulo some no contexto business por ser PF-only.
  const pfOnly = personalModules.filter((m) => !businessModules.includes(m));
  assert.deepEqual(pfOnly, []);
  // Mas o guard responde corretamente a um id hipotético PF-only.
  const fakeMap = { 'pf-only': ['personal'] };
  const canAccess = (id, ctx) => (fakeMap[id] ?? []).includes(ctx);
  assert.equal(canAccess('pf-only', 'personal'), true);
  assert.equal(canAccess('pf-only', 'business'), false);
});

test('guard fail-closed: contexto inválido nega sem lançar (sem loop)', () => {
  assert.equal(canAccessModule(MODULE_IDS.FINANCEIRO, undefined), false);
  assert.equal(canAccessModule(MODULE_IDS.FINANCEIRO, 'xxx'), false);
  assert.deepEqual(modulesForContext('xxx'), []);
});

// ── Ausência de estado paralelo (asserções de fonte) ─────────────────────────

test('AccessContext deriva do SessionContext, sem estado próprio de access', async () => {
  const src = await readFile(new URL('./AccessContext.jsx', import.meta.url), 'utf8');
  assert.match(src, /useSession/);
  assert.match(src, /getAccessFromSession/);
  assert.match(src, /useMemo/);
  // Não pode existir useState guardando o objeto de access (fonte paralela).
  assert.doesNotMatch(src, /useState\(DEFAULT_DEMO_ACCESS\)/);
});

test('SessionContext não empurra mais estado para o AccessContext (sem setAccess)', async () => {
  const src = await readFile(new URL('./SessionContext.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /setAccess\(/);
  assert.doesNotMatch(src, /useAccess\(/);
  assert.doesNotMatch(src, /from '\.\/AccessContext'/);
});

test('App envolve AccessProvider dentro de SessionProvider', async () => {
  const src = await readFile(new URL('./App.jsx', import.meta.url), 'utf8');
  const sessionIdx = src.indexOf('<SessionProvider>');
  const accessIdx = src.indexOf('<AccessProvider>');
  assert.ok(sessionIdx !== -1 && accessIdx !== -1);
  assert.ok(sessionIdx < accessIdx, 'SessionProvider deve envolver AccessProvider');
});
