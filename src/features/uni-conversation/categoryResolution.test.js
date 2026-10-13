import assert from 'node:assert/strict';
import test from 'node:test';
import { CATEGORY_RESOLUTION_STATUS, resolveFinancialCategory } from './categoryResolution.js';

// #80: a categoria sai do uni-interpret (categoryId) ou da pessoa (nome
// exato de uma categoria dela, chips, edição do card). Palavra solta da
// frase nunca escolhe categoria.

const CATEGORIAS = Object.freeze([
  { id: 'cat-alimentacao', name: 'Alimentação', category_type: 'expense', is_active: true },
  { id: 'cat-educacao', name: 'Educação', category_type: 'expense', is_active: true },
  { id: 'cat-impostos', name: 'Impostos', category_type: 'expense', is_active: true },
  { id: 'cat-mercado', name: 'Mercado', category_type: 'expense', is_active: true },
  { id: 'cat-supermercado', name: 'Supermercado', category_type: 'expense', is_active: true },
  { id: 'cat-contas', name: 'Contas', category_type: 'expense', is_active: true },
  { id: 'cat-contas-casa', name: 'Contas da casa', category_type: 'expense', is_active: true },
  { id: 'cat-salario', name: 'Salário', category_type: 'income', is_active: true },
]);

test('BUG REAL: "mensalidade escolar das crianças" não vira Impostos pelo "das"', () => {
  const result = resolveFinancialCategory({
    categories: CATEGORIAS,
    transactionType: 'expense',
    input: 'Lance 300 reais referente a mensalidade escolar das crianças',
  });
  assert.equal(result.status, CATEGORY_RESOLUTION_STATUS.NOT_FOUND);
  assert.equal(result.category, undefined);
  assert.equal(result.proposedCategoryName, null);
});

test('palavra da frase não escolhe categoria, nem com o nome de uma categoria dentro', () => {
  for (const input of ['Gastei 50 no mercado', 'paguei 120 de gasolina', 'Recebi 2300 de salário']) {
    const result = resolveFinancialCategory({ categories: CATEGORIAS, transactionType: 'expense', input });
    assert.equal(result.category, undefined, input);
    assert.equal(result.proposedCategoryName, null, input);
  }
});

test('sem categoria escolhida, as candidatas são as do tipo do lançamento', () => {
  const result = resolveFinancialCategory({ categories: CATEGORIAS, transactionType: 'income', input: 'Recebi 100' });
  assert.deepEqual(result.candidates.map((category) => category.id), ['cat-salario']);
});

test('categoryId do uni-interpret resolve; de outro tipo fica incompatível', () => {
  const resolved = resolveFinancialCategory({ categories: CATEGORIAS, transactionType: 'expense', categoryId: 'cat-educacao' });
  assert.equal(resolved.status, CATEGORY_RESOLUTION_STATUS.RESOLVED);
  assert.equal(resolved.category.id, 'cat-educacao');

  const incompatible = resolveFinancialCategory({ categories: CATEGORIAS, transactionType: 'expense', categoryId: 'cat-salario' });
  assert.equal(incompatible.status, CATEGORY_RESOLUTION_STATUS.MISSING);
  assert.equal(incompatible.incompatible, true);
});

test('nome pedido resolve pelo nome exato, sem acento e sem caixa', () => {
  const result = resolveFinancialCategory({ categories: CATEGORIAS, transactionType: 'expense', requestedName: 'educacao' });
  assert.equal(result.status, CATEGORY_RESOLUTION_STATUS.RESOLVED);
  assert.equal(result.category.id, 'cat-educacao');
});

test('nome pedido parecido não resolve: vira proposta de criação com confirmação', () => {
  const result = resolveFinancialCategory({ categories: CATEGORIAS, transactionType: 'expense', requestedName: 'Mercadinho' });
  assert.equal(result.status, CATEGORY_RESOLUTION_STATUS.NOT_FOUND);
  assert.equal(result.proposedCategoryName, 'Mercadinho');
  assert.equal(result.category, undefined);
});

test('"na categoria Mercado" na frase escolhe Mercado, e não Supermercado', () => {
  const result = resolveFinancialCategory({
    categories: CATEGORIAS,
    transactionType: 'expense',
    input: 'Gastei 50 reais na categoria Mercado ontem',
  });
  assert.equal(result.status, CATEGORY_RESOLUTION_STATUS.RESOLVED);
  assert.equal(result.category.id, 'cat-mercado');
});

test('"categoria é Educação." com acento e pontuação resolve', () => {
  const result = resolveFinancialCategory({
    categories: CATEGORIAS,
    transactionType: 'expense',
    input: 'Paguei 300, categoria é Educação.',
  });
  assert.equal(result.category?.id, 'cat-educacao');
});

test('com dois nomes possíveis depois de "categoria", vence o maior', () => {
  const result = resolveFinancialCategory({
    categories: CATEGORIAS,
    transactionType: 'expense',
    input: 'paguei 90 na categoria contas da casa',
  });
  assert.equal(result.category?.id, 'cat-contas-casa');
});

test('nome de categoria sem a palavra "categoria" antes não escolhe nada', () => {
  const result = resolveFinancialCategory({
    categories: CATEGORIAS,
    transactionType: 'expense',
    input: 'paguei os impostos da casa',
  });
  assert.equal(result.category, undefined);
});

test('categoria citada de outro tipo não serve ao lançamento', () => {
  const result = resolveFinancialCategory({
    categories: CATEGORIAS,
    transactionType: 'expense',
    input: 'gastei 40 na categoria salário',
  });
  assert.equal(result.category, undefined);
});

test('create_new com nome pedido vira proposta de criação; sem nome, falta o nome', () => {
  const willCreate = resolveFinancialCategory({
    categories: CATEGORIAS,
    transactionType: 'expense',
    requestedName: 'Pets',
    decision: 'create_new',
    workspaceType: 'business',
  });
  assert.equal(willCreate.status, CATEGORY_RESOLUTION_STATUS.WILL_CREATE);
  assert.deepEqual(willCreate.proposedCategory, { name: 'Pets', category_type: 'expense', applies_to: 'business' });

  const missing = resolveFinancialCategory({ categories: CATEGORIAS, transactionType: 'expense', decision: 'create_new' });
  assert.equal(missing.status, CATEGORY_RESOLUTION_STATUS.MISSING);
});

test('nome recusado pela pessoa não volta como proposta', () => {
  const result = resolveFinancialCategory({
    categories: CATEGORIAS,
    transactionType: 'expense',
    requestedName: 'Pets',
    excludedCategoryName: 'pets',
  });
  assert.equal(result.status, CATEGORY_RESOLUTION_STATUS.NOT_FOUND);
  assert.equal(result.proposedCategoryName, null);
});

test('categoria inativa não é candidata nem resolve', () => {
  const result = resolveFinancialCategory({
    categories: [{ id: 'x', name: 'Viagem', category_type: 'expense', is_active: false }],
    transactionType: 'expense',
    requestedName: 'Viagem',
  });
  assert.equal(result.category, undefined);
  assert.deepEqual(result.candidates, []);
});

test('"categoria da Educação" e "categoria do Mercado" também valem como escolha pelo nome', () => {
  const daEducacao = resolveFinancialCategory({
    categories: CATEGORIAS,
    transactionType: 'expense',
    input: 'Gastei 50 na categoria da Educação',
  });
  assert.equal(daEducacao.category?.id, 'cat-educacao');
  const doMercado = resolveFinancialCategory({
    categories: CATEGORIAS,
    transactionType: 'expense',
    input: 'lança 20 na categoria do mercado',
  });
  assert.equal(doMercado.category?.id, 'cat-mercado');
});
