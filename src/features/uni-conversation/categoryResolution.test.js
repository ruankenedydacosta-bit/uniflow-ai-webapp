import assert from 'node:assert/strict';
import test from 'node:test';
import { CATEGORY_RESOLUTION_STATUS, resolveFinancialCategory } from './categoryResolution.js';

// ============================================================================
// BLOCO UNI 1A: cobertura da ordem de resolução determinística exigida --
// 1. categoryId explícito; 2. nome real exato; 3. alias determinístico;
// 4. aproximação textual local; 5. IA (coberta em
// categoryResolutionAiInference.test.js); 6. sugestão; 7. criação assistida.
// ============================================================================

const PERSONAL_CATEGORIES = Object.freeze([
  { id: 'cat-alimentacao', name: 'Alimentação', category_type: 'expense', is_active: true },
  { id: 'cat-transporte', name: 'Transporte', category_type: 'expense', is_active: true },
  { id: 'cat-moradia', name: 'Moradia', category_type: 'expense', is_active: true },
  { id: 'cat-saude', name: 'Saúde', category_type: 'expense', is_active: true },
  { id: 'cat-assinaturas', name: 'Assinaturas', category_type: 'expense', is_active: true },
  { id: 'cat-salario', name: 'Salário', category_type: 'income', is_active: true },
  { id: 'cat-reembolso', name: 'Reembolso', category_type: 'income', is_active: true },
]);

// A categoria de negócio existe SÓ para provar que o alias nunca a escolhe
// por coincidência de nome -- o canônico do alias "aluguel" é "Moradia",
// nunca "Aluguel" (nome da categoria business).
const WITH_BUSINESS_CATEGORY = Object.freeze([
  ...PERSONAL_CATEGORIES,
  { id: 'cat-aluguel-business', name: 'Aluguel', category_type: 'expense', is_active: true, applies_to: 'business' },
]);

test('"Gastei R$ 50 no mercado" resolve Alimentação via alias, sem pedir confirmação', () => {
  const result = resolveFinancialCategory({
    categories: PERSONAL_CATEGORIES,
    transactionType: 'expense',
    description: 'no mercado',
    normalizedInput: 'gastei 50 no mercado',
  });
  assert.equal(result.status, CATEGORY_RESOLUTION_STATUS.RESOLVED);
  assert.equal(result.category.id, 'cat-alimentacao');
  assert.equal(result.approximate, false);
  assert.equal(result.viaAlias, true);
});

test('"Paguei R$ 120 de gasolina pelo Nubank" resolve Transporte via alias', () => {
  const result = resolveFinancialCategory({
    categories: PERSONAL_CATEGORIES,
    transactionType: 'expense',
    description: 'gasolina',
    normalizedInput: 'paguei 120 de gasolina pelo nubank',
  });
  assert.equal(result.status, CATEGORY_RESOLUTION_STATUS.RESOLVED);
  assert.equal(result.category.id, 'cat-transporte');
});

test('"Registra R$ 29,90 da Netflix" resolve Assinaturas via alias', () => {
  const result = resolveFinancialCategory({
    categories: PERSONAL_CATEGORIES,
    transactionType: 'expense',
    description: 'da Netflix',
    normalizedInput: 'registra 29 90 da netflix',
  });
  assert.equal(result.status, CATEGORY_RESOLUTION_STATUS.RESOLVED);
  assert.equal(result.category.id, 'cat-assinaturas');
});

test('"Paguei o aluguel" resolve Moradia via alias, mesmo com categoria "Aluguel" de negócio presente', () => {
  const result = resolveFinancialCategory({
    categories: WITH_BUSINESS_CATEGORY,
    transactionType: 'expense',
    description: 'o aluguel',
    normalizedInput: 'paguei o aluguel',
  });
  assert.equal(result.status, CATEGORY_RESOLUTION_STATUS.RESOLVED);
  assert.equal(result.category.id, 'cat-moradia', 'nunca deveria escolher a categoria de negócio "Aluguel"');
});

test('"Gastei R$ 80 na farmácia" resolve Saúde via alias', () => {
  const result = resolveFinancialCategory({
    categories: PERSONAL_CATEGORIES,
    transactionType: 'expense',
    description: 'na farmácia',
    normalizedInput: 'gastei 80 na farmacia',
  });
  assert.equal(result.status, CATEGORY_RESOLUTION_STATUS.RESOLVED);
  assert.equal(result.category.id, 'cat-saude');
});

test('"Recebi R$ 2.300 de salário" resolve Salário via alias (tipo income)', () => {
  const result = resolveFinancialCategory({
    categories: PERSONAL_CATEGORIES,
    transactionType: 'income',
    description: 'de salário',
    normalizedInput: 'recebi 2300 de salario',
  });
  assert.equal(result.status, CATEGORY_RESOLUTION_STATUS.RESOLVED);
  assert.equal(result.category.id, 'cat-salario');
});

test('"Recebi um reembolso de R$ 90" resolve Reembolso via alias', () => {
  const result = resolveFinancialCategory({
    categories: PERSONAL_CATEGORIES,
    transactionType: 'income',
    description: 'um reembolso',
    normalizedInput: 'recebi um reembolso de 90',
  });
  assert.equal(result.status, CATEGORY_RESOLUTION_STATUS.RESOLVED);
  assert.equal(result.category.id, 'cat-reembolso');
});

test('categoria canônica ausente (ex.: "Paguei a conta de luz" -> Contas da casa) nunca finge existir -- propõe criação assistida', () => {
  const result = resolveFinancialCategory({
    categories: PERSONAL_CATEGORIES, // "Contas da casa" não existe neste workspace
    transactionType: 'expense',
    description: 'a conta de luz',
    normalizedInput: 'paguei a conta de luz',
  });
  assert.equal(result.status, CATEGORY_RESOLUTION_STATUS.NOT_FOUND);
  assert.equal(result.proposedCategoryName, 'Contas da casa');
  assert.equal(result.viaAlias, true);
  assert.equal(result.category, undefined, 'nunca deveria devolver uma categoria como se existisse');
});

test('"Entrou R$ 800 de um freela" -> canônico "Renda extra" ausente -> criação assistida, nunca a categoria "Freelance" por engano', () => {
  const withFreelance = [
    ...PERSONAL_CATEGORIES,
    { id: 'cat-freelance', name: 'Freelance', category_type: 'income', is_active: true },
  ];
  const result = resolveFinancialCategory({
    categories: withFreelance,
    transactionType: 'income',
    description: 'de um freela',
    normalizedInput: 'entrou 800 de um freela',
  });
  assert.equal(result.status, CATEGORY_RESOLUTION_STATUS.NOT_FOUND);
  assert.equal(result.proposedCategoryName, 'Renda extra');
});

test('"Comprei uma roupa por R$ 150" resolve Compras via alias quando a categoria existe', () => {
  const withCompras = [...PERSONAL_CATEGORIES, { id: 'cat-compras', name: 'Compras', category_type: 'expense', is_active: true }];
  const result = resolveFinancialCategory({
    categories: withCompras,
    transactionType: 'expense',
    description: 'uma roupa',
    normalizedInput: 'comprei uma roupa por 150',
  });
  assert.equal(result.status, CATEGORY_RESOLUTION_STATUS.RESOLVED);
  assert.equal(result.category.id, 'cat-compras');
});

test('nome real exato tem prioridade sobre o alias -- "Gastei com Transporte" nunca cede a um alias concorrente', () => {
  const result = resolveFinancialCategory({
    categories: PERSONAL_CATEGORIES,
    transactionType: 'expense',
    requestedName: 'Transporte',
    description: 'Transporte',
    normalizedInput: 'gastei com transporte',
  });
  assert.equal(result.status, CATEGORY_RESOLUTION_STATUS.RESOLVED);
  assert.equal(result.category.id, 'cat-transporte');
  assert.equal(result.viaAlias, undefined, 'deveria resolver pelo nome exato, não pelo alias');
});

test('alias tem prioridade sobre a inferência de IA -- mesmo com aiInference presente, "mercado" nunca cai na IA', () => {
  const result = resolveFinancialCategory({
    categories: PERSONAL_CATEGORIES,
    transactionType: 'expense',
    description: 'no mercado',
    normalizedInput: 'gastei 50 no mercado',
    aiInference: {
      decision: 'existing_category',
      categoryId: 'cat-saude',
      confidence: 0.99,
      suggestedName: null,
    },
  });
  assert.equal(result.status, CATEGORY_RESOLUTION_STATUS.RESOLVED);
  assert.equal(result.category.id, 'cat-alimentacao', 'a IA nunca deveria sobrescrever um alias inequívoco');
});

test('termo sem alias e sem correspondência textual continua indo para NOT_FOUND (comportamento anterior preservado)', () => {
  const result = resolveFinancialCategory({
    categories: PERSONAL_CATEGORIES,
    transactionType: 'expense',
    description: 'consultoria de marketing',
    normalizedInput: 'paguei uma consultoria de marketing digital',
  });
  assert.equal(result.status, CATEGORY_RESOLUTION_STATUS.NOT_FOUND);
});

test('categoria empresarial nunca é escolhida mesmo quando presente na lista (o chamador já filtra por workspace, mas o alias nunca teria motivo de escolhê-la)', () => {
  const result = resolveFinancialCategory({
    categories: WITH_BUSINESS_CATEGORY,
    transactionType: 'expense',
    description: 'o aluguel',
    normalizedInput: 'paguei o aluguel',
    workspaceType: 'personal',
  });
  assert.equal(result.category.id, 'cat-moradia');
  assert.notEqual(result.category.id, 'cat-aluguel-business');
});

test('preserva a descrição original -- a normalização do alias nunca reescreve description/amount fora desta função', () => {
  // resolveFinancialCategory nunca recebe nem devolve a description bruta da
  // transação para alteração -- ela é so um dos SINAIS de entrada usados
  // para encontrar a categoria; o teste confirma que o retorno não contém
  // nenhum campo de descrição reescrita.
  const result = resolveFinancialCategory({
    categories: PERSONAL_CATEGORIES,
    transactionType: 'expense',
    description: 'no mercado',
    normalizedInput: 'gastei 50 no mercado',
  });
  assert.ok(!('description' in result), 'resolveFinancialCategory nunca deveria devolver/alterar a description');
});
