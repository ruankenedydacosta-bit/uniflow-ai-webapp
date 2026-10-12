import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORY_TYPES,
  buildUniNavigationState,
  buildUniPrefillFromState,
  filterCategoriesBySearch,
  getUniButtonLabel,
  isDuplicateCategoryName,
  normalizeText,
  shouldShowSearch,
  splitCategoriesByType,
  APPLIES_TO,
  DEFAULT_GLOBAL_CATEGORY_APPLIES_TO,
  categoryAppliesToContext,
  filterCategoriesForContext,
  normalizeWorkspaceContext,
  canManageCategory,
  getCategoryErrorMessage,
  categoriasDestinoParaMover,
  categoriasParaSeletor,
  lancamentosQueBloqueiam,
  podeOcultarCategoria,
  separarCategoriasOcultas,
} from './categoryUtils.js';
import { resolveFinancialCategory } from '../uni-conversation/categoryResolution.js';

const SAMPLE = [
  { id: '1', name: 'Alimentação', category_type: 'expense', is_active: true },
  { id: '2', name: 'Transporte', category_type: 'expense', is_active: true },
  { id: '3', name: 'Saúde', category_type: 'expense', is_active: true },
  { id: '4', name: 'Salário', category_type: 'income', is_active: true },
  { id: '5', name: 'Arquivada', category_type: 'expense', is_active: false },
  { id: '6', name: 'Transferência', category_type: 'transfer', is_active: true },
];

test('splitCategoriesByType separa por tipo e ignora inativas', () => {
  const buckets = splitCategoriesByType(SAMPLE);
  assert.equal(buckets.expense.length, 3);
  assert.equal(buckets.income.length, 1);
  assert.equal(buckets.transfer.length, 1);
  assert.ok(!buckets.expense.some((c) => c.id === '5'));
});

test('alternância Despesas/Receitas -> rótulo correto do botão da Uni', () => {
  assert.equal(getUniButtonLabel(CATEGORY_TYPES.EXPENSE), 'Registrar gasto com a Uni');
  assert.equal(getUniButtonLabel(CATEGORY_TYPES.INCOME), 'Registrar entrada com a Uni');
});

test('busca é case e acento-insensível', () => {
  assert.equal(filterCategoriesBySearch(SAMPLE, 'alimenta').length, 1);
  assert.equal(filterCategoriesBySearch(SAMPLE, 'SAUDE')[0].id, '3');
  assert.equal(filterCategoriesBySearch(SAMPLE, 'transp')[0].name, 'Transporte');
});

test('busca sem resultado retorna lista vazia', () => {
  assert.deepEqual(filterCategoriesBySearch(SAMPLE, 'inexistente'), []);
});

test('busca vazia retorna a lista completa', () => {
  assert.equal(filterCategoriesBySearch(SAMPLE, '').length, SAMPLE.length);
});

test('nome duplicado é detectado dentro do mesmo tipo', () => {
  assert.equal(isDuplicateCategoryName(SAMPLE, 'alimentação', 'expense'), true);
  assert.equal(isDuplicateCategoryName(SAMPLE, ' Transporte ', 'expense'), true);
});

test('mesmo nome em tipo diferente não é duplicado', () => {
  assert.equal(isDuplicateCategoryName(SAMPLE, 'Alimentação', 'income'), false);
});

test('excludeId ignora o próprio registro em edição', () => {
  assert.equal(isDuplicateCategoryName(SAMPLE, 'Alimentação', 'expense', { excludeId: '1' }), false);
});

test('shouldShowSearch usa o limiar de 8 itens', () => {
  assert.equal(shouldShowSearch(7), false);
  assert.equal(shouldShowSearch(8), true);
});

test('contexto enviado à Uni é estruturado e sem dados sensíveis', () => {
  const despesa = buildUniNavigationState(CATEGORY_TYPES.EXPENSE);
  assert.deepEqual(despesa, {
    origin: 'categorias',
    intent: 'registrar_transacao',
    tipoInicial: 'despesa',
  });
  const receita = buildUniNavigationState(CATEGORY_TYPES.INCOME, 'Salário');
  assert.equal(receita.tipoInicial, 'receita');
  assert.equal(receita.categoriaSugerida, 'Salário');
});

test('prefill da Uni é derivado do state (nunca auto-envia)', () => {
  assert.equal(
    buildUniPrefillFromState({ origin: 'categorias', intent: 'registrar_transacao', tipoInicial: 'despesa' }),
    'Registrar um gasto: ',
  );
  assert.equal(
    buildUniPrefillFromState({ origin: 'categorias', intent: 'registrar_transacao', tipoInicial: 'receita', categoriaSugerida: 'Salário' }),
    'Registrar uma entrada em Salário: ',
  );
});

test('prefill ignora state de outras origens', () => {
  assert.equal(buildUniPrefillFromState(null), '');
  assert.equal(buildUniPrefillFromState({ origin: 'dashboard' }), '');
});

test('normalizeText remove acentos e caixa', () => {
  assert.equal(normalizeText('  SAÚDE  '), 'saude');
});


// --- Fase 3: filtro PF/PJ por applies_to ------------------------------------

const GLOBALS = [
  { id: 'g1', name: 'Salário', category_type: 'income', is_system: true, workspace_id: null, applies_to: 'personal' },
  { id: 'g2', name: 'Receita de vendas', category_type: 'income', is_system: true, workspace_id: null, applies_to: 'business' },
  { id: 'g3', name: 'Outras entradas', category_type: 'income', is_system: true, workspace_id: null, applies_to: 'both' },
  { id: 'g4', name: 'Fornecedores', category_type: 'expense', is_system: true, workspace_id: null, applies_to: 'business' },
  { id: 'g5', name: 'Alimentação', category_type: 'expense', is_system: true, workspace_id: null, applies_to: 'personal' },
  // custom do workspace (sem applies_to relevante) — sempre visivel
  { id: 'c1', name: 'Aula de música', category_type: 'expense', is_system: false, workspace_id: 'ws-1' },
];

test('normalizeWorkspaceContext defaults inválidos para personal', () => {
  assert.equal(normalizeWorkspaceContext('business'), 'business');
  assert.equal(normalizeWorkspaceContext('personal'), 'personal');
  assert.equal(normalizeWorkspaceContext(undefined), 'personal');
  assert.equal(normalizeWorkspaceContext('qualquer'), 'personal');
});

test('categoria global business não aparece em PF', () => {
  assert.equal(categoryAppliesToContext(GLOBALS[1], 'personal'), false);
  assert.equal(categoryAppliesToContext(GLOBALS[3], 'personal'), false);
});

test('categoria global personal não aparece em PJ', () => {
  assert.equal(categoryAppliesToContext(GLOBALS[0], 'business'), false);
  assert.equal(categoryAppliesToContext(GLOBALS[4], 'business'), false);
});

test('categoria global both aparece nos dois contextos', () => {
  assert.equal(categoryAppliesToContext(GLOBALS[2], 'personal'), true);
  assert.equal(categoryAppliesToContext(GLOBALS[2], 'business'), true);
});

test('categoria customizada do workspace é sempre visível (ignora applies_to)', () => {
  assert.equal(categoryAppliesToContext(GLOBALS[5], 'personal'), true);
  assert.equal(categoryAppliesToContext(GLOBALS[5], 'business'), true);
});

test('applies_to ausente em global é excluído por segurança', () => {
  const legacy = { name: 'X', is_system: true, workspace_id: null };
  assert.equal(categoryAppliesToContext(legacy, 'personal'), false);
  assert.equal(categoryAppliesToContext(legacy, 'business'), false);
});

test('filterCategoriesForContext PF remove globais empresariais e mantém custom', () => {
  const pf = filterCategoriesForContext(GLOBALS, 'personal');
  const ids = pf.map((c) => c.id);
  assert.deepEqual(ids, ['g1', 'g3', 'g5', 'c1']);
  assert.ok(!ids.includes('g2'));
  assert.ok(!ids.includes('g4'));
});

test('filterCategoriesForContext PJ remove globais domésticas e mantém custom', () => {
  const pj = filterCategoriesForContext(GLOBALS, 'business');
  const ids = pj.map((c) => c.id);
  assert.deepEqual(ids, ['g2', 'g3', 'g4', 'c1']);
});

test('R4: categorias PJ proibidas em PF não têm applies_to personal/both', () => {
  const forbiddenInPF = ['fornecedores', 'impostos', 'operacional', 'receita de vendas'];
  for (const key of forbiddenInPF) {
    assert.equal(DEFAULT_GLOBAL_CATEGORY_APPLIES_TO[key], APPLIES_TO.BUSINESS, key);
  }
});

test('mapa de backfill só contém valores válidos', () => {
  const valid = new Set(['personal', 'business', 'both']);
  for (const v of Object.values(DEFAULT_GLOBAL_CATEGORY_APPLIES_TO)) {
    assert.ok(valid.has(v), v);
  }
});

test('canManageCategory bloqueia categoria do sistema para qualquer papel', () => {
  const global = { id: 'g', is_system: true, workspace_id: null };
  assert.equal(canManageCategory(global, { canUpdate: true, canDelete: true, userId: 'u1' }), false);
});

test('canManageCategory libera owner/admin em qualquer categoria do espaço', () => {
  const custom = { id: 'c', is_system: false, workspace_id: 'w', created_by: 'outro' };
  assert.equal(canManageCategory(custom, { canUpdate: true, canDelete: true, userId: 'u1' }), true);
});

test('canManageCategory libera member só na categoria que ele criou', () => {
  const role = { canUpdate: true, canDelete: false, userId: 'u1' };
  assert.equal(canManageCategory({ is_system: false, workspace_id: 'w', created_by: 'u1' }, role), true);
  assert.equal(canManageCategory({ is_system: false, workspace_id: 'w', created_by: 'u2' }, role), false);
});

test('canManageCategory bloqueia viewer e papel ainda desconhecido', () => {
  const custom = { is_system: false, workspace_id: 'w', created_by: 'u1' };
  assert.equal(canManageCategory(custom, { canUpdate: false, canDelete: false, userId: 'u1' }), false);
  assert.equal(canManageCategory(custom), false);
  assert.equal(canManageCategory(null, { canDelete: true }), false);
});

test('getCategoryErrorMessage nunca mostra erro cru do banco', () => {
  const fallback = 'Não foi possível salvar a categoria. Tente novamente.';
  assert.equal(getCategoryErrorMessage(null, fallback), '');
  assert.match(getCategoryErrorMessage({ code: '23505', message: 'duplicate key value' }, fallback), /Já existe/);
  assert.match(getCategoryErrorMessage({ code: 'CATEGORY_NOT_FOUND', message: 'nao encontrada' }, fallback), /não existe mais/);
  assert.equal(getCategoryErrorMessage({ code: '42501', message: 'permission denied' }, fallback), fallback);
  const dependency = { code: 'CATEGORY_HAS_DEPENDENCIES', message: 'Esta categoria tem lançamentos.' };
  assert.equal(getCategoryErrorMessage(dependency, fallback), dependency.message);
});

// --- #181: excluir categoria movendo os lançamentos ------------------------

test('lancamentosQueBloqueiam lê a contagem só do erro de dependências', () => {
  assert.equal(lancamentosQueBloqueiam(null), 0);
  assert.equal(lancamentosQueBloqueiam({ code: '42501' }), 0);
  assert.equal(lancamentosQueBloqueiam({ code: 'CATEGORY_HAS_DEPENDENCIES', dependencyCount: 7 }), 7);
  // Erro sem contagem ainda bloqueia: vale 1 para o texto fazer sentido.
  assert.equal(lancamentosQueBloqueiam({ code: 'CATEGORY_HAS_DEPENDENCIES' }), 1);
  assert.equal(lancamentosQueBloqueiam({ code: 'CATEGORY_HAS_DEPENDENCIES', dependencyCount: 'x' }), 1);
});

test('categoriasDestinoParaMover lista só ativas do mesmo tipo e nunca a própria', () => {
  const origem = { id: 'a', category_type: 'expense', workspace_id: 'w' };
  const lista = [
    { id: 'sys', category_type: 'expense', is_system: true, workspace_id: null, name: 'Alimentação' },
    origem,
    { id: 'b', category_type: 'expense', workspace_id: 'w', name: 'Mercado' },
    { id: 'c', category_type: 'income', workspace_id: 'w', name: 'Salário' },
    { id: 'd', category_type: 'expense', workspace_id: 'w', is_active: false, name: 'Antiga' },
    { category_type: 'expense', name: 'sem id' },
  ];
  assert.deepEqual(
    categoriasDestinoParaMover(lista, origem).map((c) => c.id),
    ['sys', 'b'],
  );
});

test('categoriasDestinoParaMover devolve vazio sem categoria ou sem lista', () => {
  assert.deepEqual(categoriasDestinoParaMover([{ id: 'x', category_type: 'expense' }], null), []);
  assert.deepEqual(categoriasDestinoParaMover(null, { id: 'a', category_type: 'expense' }), []);
  assert.deepEqual(categoriasDestinoParaMover([{ id: 'a', category_type: 'expense' }], { id: 'a', category_type: 'expense' }), []);
});

// #184: categoria oculta por espaço.
const DO_ESPACO = [
  { id: 'sis-mer', name: 'Alimentação', category_type: 'expense', is_system: true },
  { id: 'sis-tra', name: 'Transporte', category_type: 'expense', is_system: true },
  { id: 'pet', name: 'Pet', category_type: 'expense', workspace_id: 'w1' },
  { id: 'sal', name: 'Salário', category_type: 'income', is_system: true },
];

test('separarCategoriasOcultas tira as ocultas e mantém a ordem', () => {
  const { visiveis, ocultas } = separarCategoriasOcultas(DO_ESPACO, ['sis-tra', 'pet']);
  assert.deepEqual(visiveis.map((c) => c.id), ['sis-mer', 'sal']);
  assert.deepEqual(ocultas.map((c) => c.id), ['sis-tra', 'pet']);
});

test('separarCategoriasOcultas sem ocultas devolve a mesma lista', () => {
  const { visiveis, ocultas } = separarCategoriasOcultas(DO_ESPACO, []);
  assert.equal(visiveis, DO_ESPACO);
  assert.deepEqual(ocultas, []);
  assert.deepEqual(separarCategoriasOcultas(null, null), { visiveis: [], ocultas: [] });
});

test('categoriasParaSeletor esconde a oculta, menos a que o lançamento já usa', () => {
  const { visiveis } = separarCategoriasOcultas(DO_ESPACO, ['pet']);
  assert.deepEqual(
    categoriasParaSeletor({ visiveis, todas: DO_ESPACO }).map((c) => c.id),
    ['sis-mer', 'sis-tra', 'sal'],
  );
  assert.deepEqual(
    categoriasParaSeletor({ visiveis, todas: DO_ESPACO, selecionadaId: 'pet' }).map((c) => c.id),
    ['sis-mer', 'sis-tra', 'sal', 'pet'],
  );
  assert.equal(categoriasParaSeletor({ visiveis, todas: DO_ESPACO, selecionadaId: 'sis-mer' }), visiveis);
  assert.equal(categoriasParaSeletor({ visiveis, todas: DO_ESPACO, selecionadaId: 'nao-existe' }), visiveis);
});

test('podeOcultarCategoria recusa as padrão de último recurso', () => {
  assert.equal(podeOcultarCategoria({ id: '1', name: 'Outras despesas', is_system: true, workspace_id: null }), false);
  assert.equal(podeOcultarCategoria({ id: '2', name: 'Outras entradas', is_system: true }), false);
  assert.equal(podeOcultarCategoria({ id: '3', name: 'Transferência', is_system: true }), false);
  assert.equal(podeOcultarCategoria({ id: '4', name: 'Transporte', is_system: true }), true);
  // Categoria do espaço com o mesmo nome pode ser ocultada.
  assert.equal(podeOcultarCategoria({ id: '5', name: 'Outras despesas', workspace_id: 'w1' }), true);
  assert.equal(podeOcultarCategoria(null), false);
});

test('a Uni não sugere categoria oculta', () => {
  const { visiveis } = separarCategoriasOcultas(DO_ESPACO, ['sis-tra']);
  const pelaFrase = resolveFinancialCategory({
    categories: visiveis,
    transactionType: 'expense',
    requestedName: 'Transporte',
    normalizedInput: 'gastei 30 com transporte',
  });
  assert.notEqual(pelaFrase.category?.id, 'sis-tra');
  assert.ok(!pelaFrase.candidates.some((c) => c.id === 'sis-tra'));

  const pelaOutra = resolveFinancialCategory({
    categories: visiveis,
    transactionType: 'expense',
    requestedName: 'Alimentação',
  });
  assert.equal(pelaOutra.category?.id, 'sis-mer');
});
