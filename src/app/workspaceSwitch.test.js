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
  assert.match(sessionSource, /writeWorkspaceSelectionForUser\(state\.user\.id, workspaceType\)/);
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
  // 4 hooks de dados (accounts/categories/transactions/balances) + 1
  // useWorkspaceRole (gate de permissao, Subfase 10.2) = 5 bindings.
  assert.equal((source.match(/workspaceId: workspace\?\.id/g) ?? []).length, 5);
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

// ── Fase 11 — Auditoria de Produto ──────────────────────────────────────────

test('useFutureData escuta FINANCIAL_DATA_CHANGED_EVENT para manter projeções atuais', async () => {
  const source = await readFile(new URL('../features/future/useFutureData.js', import.meta.url), 'utf8');
  assert.match(source, /FINANCIAL_DATA_CHANGED_EVENT/);
  assert.match(source, /addEventListener/);
  assert.match(source, /refreshAll/);
});

test('useFutureData inclui refresh dos tres hooks de dados financeiros', async () => {
  const source = await readFile(new URL('../features/future/useFutureData.js', import.meta.url), 'utf8');
  assert.match(source, /refreshBalance/);
  assert.match(source, /refreshTransactions/);
  assert.match(source, /refreshGoals/);
});

test('useHomeFinancialData integra useGoals e retorna dados reais', async () => {
  const source = await readFile(new URL('../features/dashboard/mobile/useHomeFinancialData.js', import.meta.url), 'utf8');
  assert.match(source, /useGoals/);
  assert.match(source, /homeGoals/);
  assert.match(source, /goals\.length > 0/);
});

test('ObjetivosPage destrutor error e renderiza estado de erro', async () => {
  const source = await readFile(new URL('../pages/ObjetivosPage.jsx', import.meta.url), 'utf8');
  assert.match(source, /error,.*addGoal/);
  assert.match(source, /errorBanner/);
  assert.match(source, /error\.message/);
});

test('FinanceiroPage limpa erros antes de refresh para evitar estado inconsistente', async () => {
  const source = await readFile(new URL('../pages/FinanceiroPage.jsx', import.meta.url), 'utf8');
  assert.match(source, /clearAllErrors/);
  assert.match(source, /clearError\(\)/);
  assert.match(source, /refreshFinancialData/);
});

test('FinanceiroPage notifica evento global apos mutacao para sincronizar modulos', async () => {
  const source = await readFile(new URL('../pages/FinanceiroPage.jsx', import.meta.url), 'utf8');
  assert.match(source, /notifyFinancialDataChanged\('financeiro'\)/);
  assert.match(source, /FINANCIAL_DATA_CHANGED_EVENT/);
});

test('FinanceiroPage usa funcoes individuais como dependencias para evitar re-registro de listener', async () => {
  const source = await readFile(new URL('../pages/FinanceiroPage.jsx', import.meta.url), 'utf8');
  assert.match(source, /accountState\.refresh/);
  assert.match(source, /balanceState\.refresh/);
  assert.match(source, /exhaustive-deps/);
  assert.match(source, /clearAllErrors/);
});

test('DashboardPage renderiza condicionalmente mobile ou desktop sem duplicar DOM', async () => {
  const source = await readFile(new URL('../features/dashboard/DashboardPage.jsx', import.meta.url), 'utf8');
  assert.match(source, /useMobileViewport/);
  assert.match(source, /if \(isMobile\)/);
  assert.match(source, /MobileHomeView/);
  assert.match(source, /dashboard/);
});

test('UniChatPage nao possui estado hasError morto ou ErrorState nao utilizado', async () => {
  const source = await readFile(new URL('../features/uni-chat/UniChatPage.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /setHasError\(/);
  assert.doesNotMatch(source, /useState\(false\).*hasError/);
  assert.doesNotMatch(source, /<ErrorState/);
});

test('routes.jsx nao possui alias Unused UniChatProtoPage', async () => {
  const source = await readFile(new URL('../app/routes.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /UniChatProtoPage/);
  assert.match(source, /UniChatPage/);
});
