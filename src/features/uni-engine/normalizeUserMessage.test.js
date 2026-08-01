// Testes do normalizador de linguagem do Uni Engine (Fase 1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUserMessage } from './normalizeUserMessage.js';

test('normalização 6: texto vazio retorna estrutura segura e vazia', () => {
  const result = normalizeUserMessage('');
  assert.equal(result.originalText, '');
  assert.equal(result.searchableText, '');
  assert.deepEqual(result.tokens, []);
  assert.equal(result.linguisticSignals.isQuestion, false);
  assert.equal(result.extractedHints.amount, null);
});

test('normalização 7: espaços excedentes são removidos na representação auxiliar', () => {
  const result = normalizeUserMessage('  Gastei   50   reais  ');
  assert.equal(result.trimmedText, 'Gastei   50   reais');
  assert.equal(result.searchableText, 'gastei 50 reais');
  assert.deepEqual(result.tokens, ['gastei', '50', 'reais']);
});

test('normalização 8: acentos são normalizados apenas na representação auxiliar', () => {
  const result = normalizeUserMessage('Gastei R$ 50 no supermercado hoje à noite');
  assert.equal(result.originalText, 'Gastei R$ 50 no supermercado hoje à noite');
  assert.equal(result.searchableText, 'gastei r$ 50 no supermercado hoje a noite');
});

test('normalização 9: pergunta é reconhecida por palavra interrogativa e interrogação', () => {
  const result = normalizeUserMessage('Quanto é meu saldo?');
  assert.equal(result.linguisticSignals.isQuestion, true);
  assert.equal(result.linguisticSignals.hasQuestionMark, true);
  assert.equal(result.linguisticSignals.hasQuestionWord, true);
  const semMarca = normalizeUserMessage('qual é meu saldo');
  assert.equal(semMarca.linguisticSignals.isQuestion, true);
});

test('normalização 10: confirmação explícita é reconhecida (allowlist do pipeline)', () => {
  const result = normalizeUserMessage('Sim, pode confirmar');
  assert.equal(result.linguisticSignals.isConfirmation, true);
  assert.equal(result.classificationEvidence.confirmationReply, 'confirm');
  const naoConfirmacao = normalizeUserMessage('no Nubank');
  assert.equal(naoConfirmacao.linguisticSignals.isConfirmation, false);
});

test('normalização 11: cancelamento explícito é reconhecido', () => {
  const result = normalizeUserMessage('cancelar');
  assert.equal(result.linguisticSignals.isCancellation, true);
  const result2 = normalizeUserMessage('deixa pra lá');
  assert.equal(result2.linguisticSignals.isCancellation, true);
});

test('normalização 12: valor por extenso é extraído reutilizando o parser existente', () => {
  const result = normalizeUserMessage('Gastei cinquenta reais no mercado');
  assert.equal(result.extractedHints.amount, 50);
  assert.equal(result.linguisticSignals.hasAmount, true);
  const mil = normalizeUserMessage('Recebi mil reais de salário');
  assert.equal(mil.extractedHints.amount, 1000);
});

test('normalização 13: gíria financeira é reconhecida (cinquentão = R$ 50)', () => {
  const result = normalizeUserMessage('Gastei cinquentão no mercado');
  assert.equal(result.extractedHints.amount, 50);
  assert.equal(result.linguisticSignals.hasAmount, true);
  assert.equal(result.extractedHints.category, 'Alimentação');
});

test('normalização 14: texto original é sempre preservado intacto', () => {
  const original = '  Gastei 50 reais no Mercado  ';
  const result = normalizeUserMessage(original);
  assert.equal(result.originalText, original);
  assert.equal(result.trimmedText, 'Gastei 50 reais no Mercado');
  assert.equal(result.originalText, original, 'originalText nunca é alterado');
});

test('normalização: continuação é reconhecida reutilizando isContextContinuation', () => {
  const result = normalizeUserMessage('e mais 50 no Nubank');
  assert.equal(result.linguisticSignals.isContinuation, true);
});

test('normalização: sinal de declaração financeira aparece sem ser pergunta', () => {
  const statement = normalizeUserMessage('Recebi mil reais');
  assert.equal(statement.linguisticSignals.isFinancialStatement, true);
  const question = normalizeUserMessage('quanto é meu saldo?');
  assert.equal(question.linguisticSignals.isFinancialStatement, false);
});

test('normalização: bloqueio de segurança detecta ação destrutiva explícita', () => {
  const result = normalizeUserMessage('apaga minha conta');
  assert.equal(result.linguisticSignals.isSafetyBlocked, true);
  const seguro = normalizeUserMessage('gastei 50 no mercado');
  assert.equal(seguro.linguisticSignals.isSafetyBlocked, false);
});
