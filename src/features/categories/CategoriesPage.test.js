import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// --- CategoryCreateModal: guardas de mutacao (padrao da Fase 10) ----------

test('CategoryCreateModal: handleSubmit retorna cedo durante mutacao', async () => {
  const modal = await source('components/CategoryCreateModal.jsx');
  assert.match(modal, /async function handleSubmit\(event\) \{\s*event\.preventDefault\(\);\s*if \(isMutating\) return;/);
});

test('CategoryCreateModal: botao Cancelar fica desabilitado durante mutacao', async () => {
  const modal = await source('components/CategoryCreateModal.jsx');
  assert.match(modal, /variant="ghost" type="button" onClick=\{handleClose\} disabled=\{isMutating\}/);
});

test('CategoryCreateModal: botao principal fica desabilitado durante mutacao (nao so visual via loading)', async () => {
  const modal = await source('components/CategoryCreateModal.jsx');
  assert.match(modal, /type="submit" loading=\{isMutating\} disabled=\{isMutating \|\| !name\.trim\(\)\}/);
});

test('CategoryCreateModal: Modal bloqueia fechamento por overlay durante mutacao', async () => {
  const modal = await source('components/CategoryCreateModal.jsx');
  assert.match(modal, /closeOnOverlayClick=\{!isMutating\}/);
});

test('CategoryCreateModal: Modal bloqueia fechamento por ESC durante mutacao', async () => {
  const modal = await source('components/CategoryCreateModal.jsx');
  assert.match(modal, /closeOnEsc=\{!isMutating\}/);
});

test('CategoryCreateModal: handleClose (usado pelo X do Modal e pelo Cancelar) retorna cedo durante mutacao', async () => {
  const modal = await source('components/CategoryCreateModal.jsx');
  assert.match(modal, /function handleClose\(\) \{\s*if \(isMutating\) return;\s*onClose\?\.\(\);\s*\}/);
  assert.match(modal, /onClose=\{handleClose\}/);
});

// --- CategoriesPage: gate de permissao -------------------------------------

test('CategoriesPage usa useWorkspaceRole com workspaceId/ownerUserId/userId, mesmo padrao de FinanceiroPage.jsx', async () => {
  const page = await source('CategoriesPage.jsx');
  assert.match(page, /import \{ useCategories, useWorkspaceRole \} from '\.\.\/\.\.\/hooks';/);
  assert.match(page, /useWorkspaceRole\(\{\s*workspaceId: workspace\?\.id,\s*ownerUserId: workspace\?\.owner_user_id,\s*userId: user\?\.id,\s*\}\)/);
});

test('canManage depende de canUpdate, !isLoading e !isMutating -- nao concede acesso por fallback', async () => {
  const page = await source('CategoriesPage.jsx');
  assert.match(page, /const canManage =\s*workspaceRole\.canUpdate === true && !workspaceRole\.isLoading && !categoryState\.isMutating;/);
});

test('handleOpenCreate e handleCreate tem guarda defensiva de segunda camada (nao dependem so do disabled)', async () => {
  const page = await source('CategoriesPage.jsx');
  assert.match(page, /function handleOpenCreate\(\) \{\s*if \(!canManage\) return;/);
  assert.match(page, /async function handleCreate\(values\) \{\s*if \(!canManage\) return;/);
});

test('botao "Criar primeira categoria" (estado vazio) usa o mesmo gate canManage e title explicativo', async () => {
  const page = await source('CategoriesPage.jsx');
  assert.match(
    page,
    /onClick=\{handleOpenCreate\}\s*disabled=\{!canManage\}\s*title=\{getManageCategoriesTitle\(\)\}\s*>\s*Criar primeira categoria/,
  );
});

test('botao "Nova categoria" (tile do grid) usa o mesmo gate canManage e title explicativo', async () => {
  const page = await source('CategoriesPage.jsx');
  assert.match(
    page,
    /onClick=\{handleOpenCreate\}\s*disabled=\{!canManage\}\s*title=\{getManageCategoriesTitle\(\)\}\s*>\s*<span className=\{styles\.tileIcon\}>\s*<PlusIcon \/>/,
  );
});

test('getManageCategoriesTitle explica bloqueio sem depender de erro da RLS', async () => {
  const page = await source('CategoriesPage.jsx');
  assert.match(page, /Você não tem permissão para criar categorias neste workspace\./);
  assert.match(page, /Carregando permissões\.\.\./);
  assert.match(page, /Aguarde a operação atual terminar\./);
});

test('nenhum codigo de edicao ou exclusao de categoria foi introduzido em CategoriesPage', async () => {
  const page = await source('CategoriesPage.jsx');
  assert.doesNotMatch(page, /removeCategory/);
  assert.doesNotMatch(page, /handleEdit/);
  assert.doesNotMatch(page, /handleDelete/);
});

// --- Escopo: sem escrita de applies_to, sem dependencia de rotas/arquitetura

test('applies_to continua nao sendo enviado pela interface de criacao (somente leitura)', async () => {
  const modal = await source('components/CategoryCreateModal.jsx');
  const page = await source('CategoriesPage.jsx');
  assert.doesNotMatch(modal, /applies_to/);
  assert.doesNotMatch(page, /applies_to/);
});

test('nenhuma referencia nova a routes.jsx, moduleAccess ou package.json nos arquivos desta subfase', async () => {
  const modal = await source('components/CategoryCreateModal.jsx');
  const page = await source('CategoriesPage.jsx');
  for (const content of [modal, page]) {
    assert.doesNotMatch(content, /moduleAccess/);
    assert.doesNotMatch(content, /routes\.jsx/);
    assert.doesNotMatch(content, /package\.json/);
  }
});
