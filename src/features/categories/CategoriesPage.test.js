import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  CATEGORY_ICON_OPTIONS,
  getDefaultCategoryIconKey,
  resolveCategoryIconKey,
  resolveCategoryTone,
} from './categoryIconCatalog.js';

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

test('catálogo cobre os ícones semânticos financeiros e não repete chaves', () => {
  const keys = CATEGORY_ICON_OPTIONS.map(({ key }) => key);
  assert.equal(new Set(keys).size, keys.length);
  for (const expected of [
    'food', 'transport', 'home', 'home-income', 'subscription', 'health',
    'leisure', 'education', 'debt', 'work', 'other-expense', 'other-income',
    'gift', 'refund', 'yield', 'salary', 'transfer',
  ]) {
    assert.ok(keys.includes(expected), `ícone ausente: ${expected}`);
  }
});

test('resolução semântica distingue entradas, saídas e categorias próximas', () => {
  const cases = [
    ['Alimentação', 'expense', 'food'],
    ['Transporte', 'expense', 'transport'],
    ['Moradia', 'expense', 'home'],
    ['Aluguel recebido', 'income', 'home-income'],
    ['Assinaturas', 'expense', 'subscription'],
    ['Saúde', 'expense', 'health'],
    ['Lazer', 'expense', 'leisure'],
    ['Educação', 'expense', 'education'],
    ['Dívidas', 'expense', 'debt'],
    ['Freelance', 'income', 'work'],
    ['Outras despesas', 'expense', 'other-expense'],
    ['Outras entradas', 'income', 'other-income'],
    ['Presente', 'income', 'gift'],
    ['Reembolso', 'income', 'refund'],
    ['Rendimentos', 'income', 'yield'],
    ['Salário', 'income', 'salary'],
    ['Transferência', 'transfer', 'transfer'],
  ];
  for (const [name, category_type, expected] of cases) {
    assert.equal(resolveCategoryIconKey({ name, category_type }), expected, name);
  }
  assert.equal(resolveCategoryIconKey({ name: 'Pets', category_type: 'expense' }), 'other-expense');
  assert.equal(resolveCategoryIconKey({ name: 'Pets', category_type: 'income' }), 'other-income');
  assert.equal(resolveCategoryIconKey({ name: 'Mercado', icon: 'gift', category_type: 'expense' }), 'gift');
  assert.equal(getDefaultCategoryIconKey('income'), 'other-income');
  assert.equal(resolveCategoryTone({ icon: 'debt' }), 'red');
});

test('CategoryCreateModal oferece nome, tipo e ícone e persiste a chave selecionada', async () => {
  const modal = await source('components/CategoryCreateModal.jsx');
  assert.match(modal, /aria-label="Ícone da categoria"/);
  assert.match(modal, /CATEGORY_ICON_OPTIONS\.map/);
  assert.match(modal, /await onCreate\(\{ name: trimmed, category_type: categoryType, icon \}\)/);
});

test('serviço de categorias mantém icon no contrato de leitura e no payload persistido', async () => {
  const service = await source('../../services/categoryService.js');
  assert.match(service, /parent_category_id, icon, color, is_system/);
  assert.match(service, /'parent_category_id',\s*'icon',\s*'color',\s*'is_active'/);
});

test('todos os ícones escolhíveis possuem desenho inline no renderer', async () => {
  const icons = await source('categoryIcons.jsx');
  for (const { key } of CATEGORY_ICON_OPTIONS) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(icons, new RegExp(`(?:^|\\n)\\s*(?:'${escaped}'|${escaped}):\\s*\\(`));
  }
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
