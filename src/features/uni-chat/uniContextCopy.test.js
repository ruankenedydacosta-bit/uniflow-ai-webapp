import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeWorkspaceType,
  getEmptyStateQuestion,
  getContextVocabularyGuidance,
  buildContextGuidanceLines,
} from './uniContextCopy.js';

test('normalizeWorkspaceType trata "business" como PJ e qualquer outro valor como PF', () => {
  assert.equal(normalizeWorkspaceType('business'), 'business');
  assert.equal(normalizeWorkspaceType('personal'), 'personal');
  assert.equal(normalizeWorkspaceType(undefined), 'personal');
  assert.equal(normalizeWorkspaceType(null), 'personal');
  assert.equal(normalizeWorkspaceType('lixo'), 'personal');
});

test('getEmptyStateQuestion pergunta sobre "sua empresa" em PJ e "seu dinheiro" em PF', () => {
  assert.equal(getEmptyStateQuestion('business'), 'O que vamos organizar hoje na sua empresa?');
  assert.equal(getEmptyStateQuestion('personal'), 'O que vamos organizar hoje no seu dinheiro?');
});

test('getContextVocabularyGuidance não mistura vocabulário entre PF e PJ', () => {
  const business = getContextVocabularyGuidance('business');
  const personal = getContextVocabularyGuidance('personal');

  assert.equal(business.subject, 'sua empresa');
  assert.ok(business.vocabularyHints.includes('fluxo de caixa'));
  assert.ok(business.vocabularyHints.includes('faturamento'));
  assert.ok(!business.vocabularyHints.some((hint) => personal.vocabularyHints.includes(hint)));

  assert.equal(personal.subject, 'você');
  assert.ok(personal.vocabularyHints.includes('seu dinheiro'));
  assert.ok(!personal.vocabularyHints.some((hint) => business.vocabularyHints.includes(hint)));
});

test('buildContextGuidanceLines gera linhas de instrução coerentes com o contexto', () => {
  const businessLines = buildContextGuidanceLines('business').join('\n');
  const personalLines = buildContextGuidanceLines('personal').join('\n');

  assert.match(businessLines, /sua empresa/);
  assert.match(businessLines, /fluxo de caixa/);
  assert.doesNotMatch(businessLines, /seu dinheiro/);

  assert.match(personalLines, /seu dinheiro/);
  assert.doesNotMatch(personalLines, /fluxo de caixa/);
});

test('workspaceType ausente/ inválido cai em PF por segurança (fail-closed para vocabulário empresarial)', () => {
  assert.equal(getEmptyStateQuestion(), 'O que vamos organizar hoje no seu dinheiro?');
  assert.equal(getContextVocabularyGuidance('unknown').subject, 'você');
});
