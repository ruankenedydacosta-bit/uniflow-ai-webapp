import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SUPPORT_FAQ_CATEGORIES, SUPPORT_SUGGESTED_QUESTIONS } from './supportFaq.js';
import { getKnowledgeEntryById } from '../product-knowledge/productKnowledgeManifest.js';

test('toda categoria da FAQ tem id, label e ao menos uma pergunta', () => {
  for (const category of SUPPORT_FAQ_CATEGORIES) {
    assert.ok(category.id);
    assert.ok(category.label);
    assert.ok(Array.isArray(category.items) && category.items.length > 0);
  }
});

test('toda pergunta da FAQ aponta para um id existente do manifesto oficial (nunca resposta independente)', () => {
  for (const category of SUPPORT_FAQ_CATEGORIES) {
    for (const item of category.items) {
      const entry = getKnowledgeEntryById(item.knowledgeId);
      assert.ok(entry, `knowledgeId inexistente: ${item.knowledgeId} (pergunta: "${item.question}")`);
    }
  }
});

test('nenhuma pergunta da FAQ é duplicada dentro da mesma categoria', () => {
  for (const category of SUPPORT_FAQ_CATEGORIES) {
    const questions = category.items.map((item) => item.question);
    assert.equal(questions.length, new Set(questions).size, `perguntas duplicadas em ${category.id}`);
  }
});

test('categorias da FAQ cobrem as áreas exigidas pela fase (primeiros passos, conta, PF/PJ, financeiro, voz, demonstração etc.)', () => {
  const ids = SUPPORT_FAQ_CATEGORIES.map((c) => c.id);
  for (const expected of [
    'primeiros-passos', 'conta-acesso', 'pessoal-empresa', 'financeiro',
    'objetivos', 'chat-uni', 'voz', 'notificacoes', 'privacidade-seguranca', 'demonstracao',
  ]) {
    assert.ok(ids.includes(expected), `categoria ausente: ${expected}`);
  }
});

test('perguntas sugeridas em destaque não estão vazias e são um conjunto pequeno e controlado', () => {
  assert.ok(SUPPORT_SUGGESTED_QUESTIONS.length > 0);
  assert.ok(SUPPORT_SUGGESTED_QUESTIONS.length <= 8);
});

test('nenhuma categoria/pergunta reflete funcionalidade future/demo como disponível (Open Finance sempre tratado como demo)', () => {
  const openFinanceItem = SUPPORT_FAQ_CATEGORIES
    .flatMap((c) => c.items)
    .find((item) => item.question.toLowerCase().includes('open finance'));
  assert.ok(openFinanceItem);
  const entry = getKnowledgeEntryById(openFinanceItem.knowledgeId);
  assert.notEqual(entry.status, 'available');
});
