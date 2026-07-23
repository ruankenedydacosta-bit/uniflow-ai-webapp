import assert from 'node:assert/strict';
import test from 'node:test';
import { formatSignedCurrency, formatSignedPercent, directionLabel } from './futureComparisonFormatters.js';

test('formatSignedCurrency: positivo recebe sinal +', () => {
  assert.equal(formatSignedCurrency(500).startsWith('+'), true);
});

test('formatSignedCurrency: negativo mantem apenas o sinal nativo do formatador', () => {
  const result = formatSignedCurrency(-500);
  assert.equal(result.startsWith('+'), false);
  assert.match(result, /-/);
});

test('formatSignedCurrency: valor ausente (null) mostra "Não disponível", nunca R$ 0,00', () => {
  assert.equal(formatSignedCurrency(null), 'Não disponível');
});

test('formatSignedCurrency: undefined tambem mostra "Não disponível"', () => {
  assert.equal(formatSignedCurrency(undefined), 'Não disponível');
});

test('formatSignedCurrency: string nao e aceita silenciosamente', () => {
  assert.equal(formatSignedCurrency('500'), 'Não disponível');
});

test('formatSignedCurrency: NaN/Infinity nunca aparecem no texto', () => {
  assert.equal(formatSignedCurrency(NaN), 'Não disponível');
  assert.equal(formatSignedCurrency(Infinity), 'Não disponível');
  assert.equal(formatSignedCurrency(-Infinity), 'Não disponível');
});

test('formatSignedPercent: positivo recebe sinal +', () => {
  assert.equal(formatSignedPercent(20), '+20.0%');
});

test('formatSignedPercent: negativo mantem o sinal nativo', () => {
  assert.equal(formatSignedPercent(-20), '-20.0%');
});

test('formatSignedPercent: null mostra "Não disponível"', () => {
  assert.equal(formatSignedPercent(null), 'Não disponível');
});

test('formatSignedPercent: NaN/Infinity nunca aparecem no texto', () => {
  assert.equal(formatSignedPercent(NaN), 'Não disponível');
  assert.equal(formatSignedPercent(Infinity), 'Não disponível');
});

test('directionLabel: higher/lower/unchanged mapeiam para texto neutro', () => {
  assert.equal(directionLabel('higher'), 'Resultado simulado maior');
  assert.equal(directionLabel('lower'), 'Resultado simulado menor');
  assert.equal(directionLabel('unchanged'), 'Sem alteração');
});

test('directionLabel: valor desconhecido cai no rotulo neutro, nunca quebra', () => {
  assert.equal(directionLabel('anything-else'), 'Sem alteração');
});
