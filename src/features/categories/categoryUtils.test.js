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
} from './categoryUtils.js';

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
