import assert from 'node:assert/strict';
import test from 'node:test';
import { CATEGORY_RESOLUTION_STATUS, resolveFinancialCategory } from './categoryResolution.js';
import { CATEGORY_INFERENCE_DECISIONS } from '../uni-category-inference/index.js';

// BLOCO D: a inferencia da IA so e considerada quando a resolucao local
// (exata/alias/aproximacao por texto) nao encontrou NADA -- estes testes
// cobrem exclusivamente esse ponto de integracao dentro de
// resolveFinancialCategory (categoryResolution.js). O disparo real da
// chamada assincrona a OpenAI e testado separadamente (UniChatPage/
// categoryInferenceService); aqui o foco e: dado um resultado JA validado
// da IA, a hierarquia de confianca produz o status certo, sem nunca
// sobrepor um match local real.

const CATEGORIES = [
  { id: 'category-food', name: 'Alimentação', category_type: 'expense', is_active: true },
  { id: 'category-transport', name: 'Transporte', category_type: 'expense', is_active: true },
  { id: 'category-health', name: 'Saúde', category_type: 'expense', is_active: true },
];

function resolve(overrides = {}) {
  return resolveFinancialCategory({
    categories: CATEGORIES,
    transactionType: 'expense',
    requestedName: undefined,
    description: 'iFood',
    normalizedInput: 'gastei 48 no ifood',
    ...overrides,
  });
}

test('confiança alta (>= 0.88) resolve diretamente a categoria existente sugerida pela IA', () => {
  const result = resolve({
    aiInference: {
      decision: CATEGORY_INFERENCE_DECISIONS.EXISTING_CATEGORY,
      categoryId: 'category-food',
      confidence: 0.93,
      suggestedName: null,
      reason: 'iFood é entrega de comida',
    },
  });
  assert.equal(result.status, CATEGORY_RESOLUTION_STATUS.RESOLVED);
  assert.equal(result.category.id, 'category-food');
  assert.equal(result.approximate, false);
});

test('confiança intermediária (>= 0.65 e < 0.88) exige confirmação explícita antes de usar a categoria', () => {
  const result = resolve({
    aiInference: {
      decision: CATEGORY_INFERENCE_DECISIONS.EXISTING_CATEGORY,
      categoryId: 'category-food',
      confidence: 0.7,
      suggestedName: null,
      reason: 'Provável restaurante',
    },
  });
  assert.equal(result.status, CATEGORY_RESOLUTION_STATUS.PENDING_APPROXIMATE);
  assert.equal(result.proposedCategory.id, 'category-food');
  assert.match(result.explanation, /Posso usar essa categoria\?/);
});

test('confirmação explícita (approved=true) resolve a sugestão de confiança intermediária da IA', () => {
  const result = resolve({
    approved: true,
    aiInference: {
      decision: CATEGORY_INFERENCE_DECISIONS.EXISTING_CATEGORY,
      categoryId: 'category-food',
      confidence: 0.7,
      suggestedName: null,
      reason: 'Provável restaurante',
    },
  });
  assert.equal(result.status, CATEGORY_RESOLUTION_STATUS.RESOLVED);
  assert.equal(result.category.id, 'category-food');
});

test('confiança baixa (< 0.65) nunca assume -- cai no fluxo local de categoria não encontrada', () => {
  const result = resolve({
    aiInference: {
      decision: CATEGORY_INFERENCE_DECISIONS.EXISTING_CATEGORY,
      categoryId: 'category-food',
      confidence: 0.4,
      suggestedName: null,
      reason: 'Não tenho certeza',
    },
  });
  assert.equal(result.status, CATEGORY_RESOLUTION_STATUS.NOT_FOUND);
});

test('decisão create_category propõe o nome sugerido pela IA através do fluxo assistido já existente', () => {
  const result = resolve({
    description: 'aula de cerâmica',
    aiInference: {
      decision: CATEGORY_INFERENCE_DECISIONS.CREATE_CATEGORY,
      categoryId: null,
      confidence: 0.75,
      suggestedName: 'Cursos',
      reason: 'Nenhuma categoria cobre aulas',
    },
  });
  assert.equal(result.status, CATEGORY_RESOLUTION_STATUS.NOT_FOUND);
  assert.equal(result.proposedCategoryName, 'Cursos');
});

test('decisão uncertain é tratada como se a IA não tivesse sugerido nada', () => {
  const result = resolve({
    description: 'no Extra',
    normalizedInput: 'gastei 90 no extra',
    aiInference: {
      decision: CATEGORY_INFERENCE_DECISIONS.UNCERTAIN,
      categoryId: null,
      confidence: 0.3,
      suggestedName: null,
      reason: 'Ambíguo',
    },
  });
  assert.equal(result.status, CATEGORY_RESOLUTION_STATUS.NOT_FOUND);
  assert.equal(result.proposedCategoryName, 'Extra');
});

test('categoryId sugerido que não está mais entre as categorias compatíveis (ex.: rejeitado) cai no NOT_FOUND local, nunca quebra', () => {
  const result = resolve({
    excludedCategoryId: 'category-food',
    aiInference: {
      decision: CATEGORY_INFERENCE_DECISIONS.EXISTING_CATEGORY,
      categoryId: 'category-food',
      confidence: 0.95,
      suggestedName: null,
      reason: 'x',
    },
  });
  assert.equal(result.status, CATEGORY_RESOLUTION_STATUS.NOT_FOUND);
});

test('a IA nunca sobrepõe uma correspondência exata local -- match exato sempre vence, aiInference é ignorado', () => {
  const result = resolve({
    requestedName: 'Alimentação',
    normalizedInput: 'gastei 48 no ifood alimentacao',
    aiInference: {
      decision: CATEGORY_INFERENCE_DECISIONS.EXISTING_CATEGORY,
      categoryId: 'category-transport',
      confidence: 0.99,
      suggestedName: null,
      reason: 'sugestão da IA, nunca deveria ganhar de um match exato',
    },
  });
  assert.equal(result.status, CATEGORY_RESOLUTION_STATUS.RESOLVED);
  assert.equal(result.category.id, 'category-food');
});

test('REGRESSÃO: resolução funciona normalmente sem aiInference (Bloco B sem OpenAI)', () => {
  const result = resolve();
  assert.equal(result.status, CATEGORY_RESOLUTION_STATUS.NOT_FOUND);
  assert.equal(result.proposedCategoryName, 'IFood');
});
