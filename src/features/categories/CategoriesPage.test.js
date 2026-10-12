import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  CATEGORY_ICON_GROUPS,
  CATEGORY_ICON_OPTIONS,
  getCategoryIconSections,
  getDefaultCategoryIconKey,
  LIMITE_ICONES_SUGERIDOS,
  resolveCategoryIconKey,
  resolveCategoryTone,
  sugerirIconesCategoria,
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
  assert.equal(keys.length, 74);
  assert.deepEqual(
    new Set(CATEGORY_ICON_OPTIONS.map(({ group }) => group)),
    new Set(Object.values(CATEGORY_ICON_GROUPS)),
  );
  for (const expected of [
    'food', 'groceries', 'restaurant', 'home', 'rent', 'condo', 'water',
    'energy', 'gas', 'internet', 'phone', 'transport', 'fuel', 'parking',
    'toll', 'car-maintenance', 'health', 'pharmacy', 'health-plan',
    'personal-care', 'clothing', 'education', 'school-material', 'leisure',
    'games', 'travel', 'pets', 'subscription', 'taxes', 'debt', 'loan',
    'insurance', 'gift', 'shopping', 'electronics', 'home-maintenance',
    'services', 'other-expense', 'salary', 'work', 'sales', 'commission',
    'bonus', 'refund', 'home-income', 'yield', 'investment', 'dividends',
    'retirement', 'benefits', 'pension', 'gift-income', 'transfer',
    'other-income', 'person', 'people', 'company', 'store', 'briefcase',
    'star', 'heart', 'calendar', 'box', 'tag', 'wallet', 'coin', 'card',
    'document', 'chart', 'check', 'tool', 'settings', 'package', 'location',
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
    ['Presente', 'income', 'gift-income'],
    ['Reembolso', 'income', 'refund'],
    ['Rendimentos', 'income', 'yield'],
    ['Salário', 'income', 'salary'],
    ['Transferência', 'transfer', 'transfer'],
  ];
  for (const [name, category_type, expected] of cases) {
    assert.equal(resolveCategoryIconKey({ name, category_type }), expected, name);
  }
  assert.equal(resolveCategoryIconKey({ name: 'Pets', category_type: 'expense' }), 'pets');
  assert.equal(resolveCategoryIconKey({ name: 'Cliente João', category_type: 'income' }), 'other-income');
  assert.equal(resolveCategoryIconKey({ name: 'Mercado', icon: 'gift', category_type: 'expense' }), 'gift');
  assert.equal(getDefaultCategoryIconKey('income'), 'other-income');
  assert.equal(resolveCategoryTone({ icon: 'debt' }), 'red');
});

test('seletor prioriza o tipo atual sem esconder grupos alternativos', () => {
  const expenseSections = getCategoryIconSections('expense');
  const incomeSections = getCategoryIconSections('income');
  assert.deepEqual(expenseSections.map(({ id }) => id), ['expense', 'generic', 'income']);
  assert.deepEqual(incomeSections.map(({ id }) => id), ['income', 'generic', 'expense']);
  assert.equal(expenseSections.flatMap(({ options }) => options).length, CATEGORY_ICON_OPTIONS.length);
  assert.equal(incomeSections.flatMap(({ options }) => options).length, CATEGORY_ICON_OPTIONS.length);
  assert.equal(expenseSections[0].label, 'Recomendados para Saída');
  assert.equal(incomeSections[0].label, 'Recomendados para Entrada');
});

test('CategoryCreateModal oferece nome, tipo e ícone e persiste a chave selecionada', async () => {
  const modal = await source('components/CategoryCreateModal.jsx');
  assert.match(modal, /aria-label="Ícone da categoria"/);
  assert.match(modal, /getCategoryIconSections\(categoryType\)/);
  assert.match(modal, /section\.options\.map/);
  assert.match(modal, /: \{ name: trimmed, category_type: categoryType, icon \}/);
});

test('CategoryCreateModal em edição preenche a categoria, fixa o tipo e ignora o próprio nome', async () => {
  const modal = await source('components/CategoryCreateModal.jsx');
  assert.match(modal, /setName\(category\?\.name \?\? ''\)/);
  assert.match(modal, /isEditing \? null : \(\s*<Segmented/);
  assert.match(modal, /isEditing\s*\? \{ name: trimmed, icon \}/);
  assert.match(modal, /isDuplicateCategoryName\(categories, trimmed, categoryType, \{ excludeId: category\?\.id \}\)/);
});

test('CategoryCreateModal preserva escolha livre ao alternar Entrada/Saída', async () => {
  const modal = await source('components/CategoryCreateModal.jsx');
  assert.match(modal, /iconWasChosenRef\.current = true;\s*setIcon\(chave\)/);
  assert.match(modal, /if \(!iconWasChosenRef\.current\) \{\s*setIcon\(iconePeloNome\(name, type\)\)/);
});

// Tela 10d: seis ícones sugeridos pelo nome e "Ver todos" para a grade completa.
test('sugestão de ícone segue o nome sem acento e sem caixa', () => {
  const mercado = sugerirIconesCategoria('MERCADO', 'expense');
  assert.equal(mercado.porNome, true);
  assert.equal(mercado.icones.length, LIMITE_ICONES_SUGERIDOS);
  assert.equal(mercado.icones[0], 'groceries');
  assert.ok(mercado.icones.includes('food'));
  assert.ok(mercado.icones.includes('restaurant'));

  const comAcento = sugerirIconesCategoria('Farmácia', 'expense');
  const semAcento = sugerirIconesCategoria('farmacia', 'expense');
  assert.deepEqual(comAcento.icones, semAcento.icones);
  assert.equal(comAcento.icones[0], 'pharmacy');

  assert.equal(sugerirIconesCategoria('Salário', 'income').icones[0], 'salary');
  assert.equal(sugerirIconesCategoria('Presente', 'income').icones[0], 'gift-income');
  assert.equal(sugerirIconesCategoria('Presente', 'expense').icones[0], 'gift');
  assert.equal(sugerirIconesCategoria('Aluguel', 'income').icones[0], 'home-income');
  // Sem ícone do tipo atual no nome, a ordem de afinidade fica: o primeiro
  // não vira um genérico.
  assert.equal(sugerirIconesCategoria('Investimento', 'expense').icones[0], 'investment');
  assert.equal(sugerirIconesCategoria('Salário', 'expense').icones[0], 'salary');
  assert.equal(sugerirIconesCategoria('Educação', 'expense').icones[0], 'education');
});

test('sugestão sem nome ou sem palavra conhecida traz os mais usados do tipo', () => {
  const vazio = sugerirIconesCategoria('', 'expense');
  assert.equal(vazio.porNome, false);
  assert.deepEqual(vazio.icones, ['groceries', 'food', 'home', 'transport', 'health', 'leisure']);
  assert.deepEqual(sugerirIconesCategoria(null, 'income').icones, ['salary', 'work', 'sales', 'investment', 'refund', 'other-income']);

  const semMatch = sugerirIconesCategoria('Xyzzy', 'income');
  assert.equal(semMatch.porNome, false);
  assert.deepEqual(semMatch.icones, sugerirIconesCategoria('', 'income').icones);
});

test('sugestão não casa palavra curta no meio de outra e aceita digitação parcial', () => {
  assert.equal(sugerirIconesCategoria('Gastos', 'expense').porNome, false);
  assert.equal(sugerirIconesCategoria('Casamento', 'expense').porNome, false);
  assert.equal(sugerirIconesCategoria('Alimentação', 'expense').icones.includes('investment'), false);
  assert.equal(sugerirIconesCategoria('merc', 'expense').icones[0], 'groceries');
  assert.equal(sugerirIconesCategoria('Gás', 'expense').icones[0], 'gas');
});

test('sugestão mantém o ícone já escolhido à vista e nunca repete', () => {
  const { icones } = sugerirIconesCategoria('Mercado', 'expense', { manter: 'star' });
  assert.equal(icones.length, LIMITE_ICONES_SUGERIDOS);
  assert.ok(icones.includes('star'));
  assert.equal(new Set(icones).size, icones.length);
  for (const chave of icones) {
    assert.ok(CATEGORY_ICON_OPTIONS.some(({ key }) => key === chave), chave);
  }
  const semManter = sugerirIconesCategoria('Mercado', 'expense', { manter: 'inexistente' });
  assert.equal(semManter.icones.includes('inexistente'), false);
});

test('CategoryCreateModal mostra os sugeridos, abre a grade completa em Ver todos e o ícone segue o nome', async () => {
  const modal = await source('components/CategoryCreateModal.jsx');
  const css = await source('components/CategoryCreateModal.module.css');
  assert.match(modal, /sugerirIconesCategoria\(name, categoryType, \{ manter: icon \}\)/);
  assert.match(modal, /sugestao\.icones\.map\(\(chave\) => renderIconOption\(chave\)\)/);
  assert.match(modal, /aria-expanded=\{mostrarTodos\}/);
  assert.match(modal, /\{mostrarTodos \? 'Ver sugeridos' : 'Ver todos'\}/);
  assert.match(modal, /setMostrarTodos\(false\);\s*\/\/[^\n]*\n\s*iconWasChosenRef\.current = Boolean\(category\)/);
  assert.match(modal, /onChange=\{\(event\) => handleNameChange\(event\.target\.value\)\}/);
  assert.match(modal, /if \(!iconWasChosenRef\.current\) \{\s*setIcon\(iconePeloNome\(value, categoryType\)\)/);
  assert.match(css, /\.iconSuggestedGrid\s*\{[\s\S]*?grid-template-columns: repeat\(6, minmax\(0, 1fr\)\)/);
});

// Tela 22h: no celular a Nova categoria é a folha padrão. A folha não passa
// da altura da tela: só a grade de ícones rola, e as ações ficam à vista.
test('folha de Nova categoria rola só a grade de ícones e mantém as ações à vista', async () => {
  const modal = await source('components/CategoryCreateModal.jsx');
  const css = await source('components/CategoryCreateModal.module.css');
  const baseModal = await source('../../components/ui/Modal/Modal.jsx');
  assert.match(modal, /size="lg"/);
  assert.match(modal, /bodyClassName=\{styles\.categoryCreateBody\}/);
  assert.match(modal, /headerClassName=\{styles\.categoryCreateHeader\}/);
  assert.match(baseModal, /bodyClassName/);
  assert.match(baseModal, /headerClassName/);
  assert.match(css, /\.categoryCreateDialog\.categoryCreateDialog \{[\s\S]*?overflow: hidden;/);
  assert.match(css, /\.iconLibrary\s*\{[\s\S]*?overflow-x: hidden;[\s\S]*?overflow-y: auto;[\s\S]*?overscroll-behavior: contain;/);
  assert.match(css, /\.iconGrid\s*\{[\s\S]*?grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(min-width: 768px\)[\s\S]*?max-width: 520px;/);
  assert.match(css, /@media \(max-height: 520px\)[\s\S]*?\.categoryCreateHeader p\s*\{\s*display: none;/);
  assert.match(modal, /Role para ver todos os ícones\./);
});

test('ícones têm nome acessível e a seleção usa violeta, sem cor de perigo', async () => {
  const modal = await source('components/CategoryCreateModal.jsx');
  const css = await source('components/CategoryCreateModal.module.css');
  assert.match(modal, /aria-label=\{rotulo\}/);
  assert.match(modal, /aria-checked=\{selected\}/);
  assert.match(css, /\.iconOption\[aria-checked="true"\] \{[\s\S]*?var\(--uf-app-brand-violet\)/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i);
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
    assert.match(icons, new RegExp(`(?:^|\\n)\\s*(?:'${escaped}'|${escaped}):\\s*<svg`));
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

test('CategoriesPage só oferece Editar/Excluir para categoria que o papel pode alterar', async () => {
  const page = await source('CategoriesPage.jsx');
  assert.match(page, /canManageCategory\(selectedCategory, \{/);
  assert.match(page, /\{canManageSelected \? \(/);
  assert.match(page, /if \(!canManageSelected \|\| categoryState\.isMutating\) return;/);
  assert.match(page, /categoryState\.saveCategory\(values, editingCategory\.id\)/);
  assert.match(page, /categoryState\.removeCategory\(deletingCategory\.id\)/);
});

test('CategoryDeleteConfirmModal bloqueia fechamento e clique duplo durante mutacao', async () => {
  const modal = await source('components/CategoryDeleteConfirmModal.jsx');
  assert.match(modal, /function handleClose\(\) \{\s*if \(isMutating\) return;/);
  assert.match(modal, /async function handleConfirm\(\) \{\s*if \(isMutating\) return;/);
  assert.match(modal, /closeOnOverlayClick=\{!isMutating\}/);
  assert.match(modal, /closeOnEsc=\{!isMutating\}/);
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
