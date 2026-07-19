import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  findWorkspaceByType,
  getAvailableWorkspaceTypes,
  getWorkspaceProfileName,
  getWorkspaceTypeFromContext,
  readWorkspaceSelection,
  WORKSPACE_SELECTION_STORAGE_KEY,
  writeWorkspaceSelection,
} from './workspaceSelection.js';

const workspaces = [
  { id: 'personal-id', workspace_type: 'personal' },
  { id: 'business-id', workspace_type: 'business' },
];

test('PF e PJ resolvem workspaces distintos deterministicamente', () => {
  assert.equal(getWorkspaceTypeFromContext('PF'), 'personal');
  assert.equal(getWorkspaceTypeFromContext('PJ'), 'business');
  assert.equal(findWorkspaceByType(workspaces, 'personal').id, 'personal-id');
  assert.equal(findWorkspaceByType(workspaces, 'business').id, 'business-id');
});

test('workspace ausente retorna estado seguro sem misturar perfis', () => {
  assert.equal(findWorkspaceByType([workspaces[0]], 'business'), null);
  assert.deepEqual(getAvailableWorkspaceTypes([workspaces[0]]), ['personal']);
});

test('perfil ausente recebe nome determinístico conforme PF ou PJ', () => {
  assert.equal(getWorkspaceProfileName('personal'), 'Perfil PF');
  assert.equal(getWorkspaceProfileName('business'), 'Perfil PJ');
});

test('seleção PF e PJ persiste e valores inválidos são ignorados', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };

  assert.equal(readWorkspaceSelection(storage), null);
  assert.equal(writeWorkspaceSelection('personal', storage), true);
  assert.equal(readWorkspaceSelection(storage), 'personal');
  assert.equal(writeWorkspaceSelection('business', storage), true);
  assert.equal(readWorkspaceSelection(storage), 'business');
  assert.equal(writeWorkspaceSelection('personal', storage), true);
  assert.equal(readWorkspaceSelection(storage), 'personal');
  values.set(WORKSPACE_SELECTION_STORAGE_KEY, 'invalid');
  assert.equal(readWorkspaceSelection(storage), null);
});

test('seleção inexistente permanece visualmente ativa sem renderizar outro workspace', async () => {
  const sessionSource = await readFile(new URL('./SessionContext.jsx', import.meta.url), 'utf8');
  const layoutSource = await readFile(
    new URL('../layouts/mobile-app-shell/AuthenticatedLayout.jsx', import.meta.url),
    'utf8',
  );

  assert.match(sessionSource, /setSelectedWorkspaceType\(workspaceType\)/);
  assert.match(sessionSource, /writeWorkspaceSelection\(workspaceType\)/);
  assert.match(layoutSource, /activeContext = effectiveWorkspaceType === 'business'/);
  assert.match(layoutSource, /shouldHidePreviousWorkspace/);
  assert.match(layoutSource, /O contexto selecionado foi mantido/);
});

test('troca persiste current_workspace_id e ressincroniza a sessão', async () => {
  const source = await readFile(new URL('./SessionContext.jsx', import.meta.url), 'utf8');
  assert.match(source, /updateProfile\(state\.user\.id/);
  assert.match(source, /current_workspace_id: targetWorkspace\.id/);
  assert.match(source, /synchronizeSession\(state\.session\)/);
});

test('criação reutiliza workspace existente e prepara rollback seguro', async () => {
  const sessionSource = await readFile(new URL('./SessionContext.jsx', import.meta.url), 'utf8');
  const layoutSource = await readFile(
    new URL('../layouts/mobile-app-shell/AuthenticatedLayout.jsx', import.meta.url),
    'utf8',
  );

  assert.match(sessionSource, /findWorkspaceByType\(workspacesResult\.data, workspaceType\)/);
  assert.match(sessionSource, /createWorkspace\(\{/);
  assert.match(sessionSource, /deleteOwnedWorkspace\(targetWorkspace\.id\)/);
  assert.match(sessionSource, /current_workspace_id: targetWorkspace\.id/);
  assert.match(layoutSource, /Criar perfil \$\{activeContext\}/);
  assert.match(layoutSource, /navigate\('\/financeiro'/);
});

test('Financeiro recarrega todos os hooks pelo workspace selecionado', async () => {
  const source = await readFile(new URL('../pages/FinanceiroPage.jsx', import.meta.url), 'utf8');
  assert.equal((source.match(/workspaceId: workspace\?\.id/g) ?? []).length, 4);
  assert.match(source, /useFinancialBalances/);
});

test('header não usa callback vazio para alternância', async () => {
  const source = await readFile(
    new URL('../layouts/mobile-app-shell/MobileHeader.jsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /onContextChange=\{onContextChange\}/);
  assert.doesNotMatch(source, /const NOOP/);
});
