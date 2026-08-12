import assert from 'node:assert/strict';
import test from 'node:test';
import {
  centsToAmount,
  computeBalanceDelta,
  digitsToCents,
  formatCentsAsCurrencyInput,
  formatSignedCurrency,
} from './balanceAdjustmentFormUtils.js';

test('digitsToCents extrai apenas dígitos, ignorando "R$", pontos e vírgula', () => {
  assert.equal(digitsToCents('R$ 1.250,00'), 125000);
  assert.equal(digitsToCents('125000'), 125000);
  assert.equal(digitsToCents(''), 0);
  assert.equal(digitsToCents(null), 0);
});

test('digitsToCents nunca deixa o usuário digitar um valor absurdo (corta em 15 dígitos)', () => {
  assert.equal(digitsToCents('9999999999999999999'), 999999999999999);
});

test('centsToAmount converte centavos em número decimal (reais)', () => {
  assert.equal(centsToAmount(125000), 1250);
  assert.equal(centsToAmount(0), 0);
  assert.equal(centsToAmount(50), 0.5);
});

test('formatCentsAsCurrencyInput formata no padrão brasileiro completo', () => {
  assert.equal(formatCentsAsCurrencyInput(125000), 'R$ 1.250,00');
  assert.equal(formatCentsAsCurrencyInput(0), 'R$ 0,00');
});

test('computeBalanceDelta: saldo novo maior que o atual gera ajuste positivo', () => {
  assert.equal(computeBalanceDelta(402.2, 500), 97.8);
});

test('computeBalanceDelta: saldo novo menor que o atual gera ajuste negativo', () => {
  assert.equal(computeBalanceDelta(500, 350), -150);
});

test('computeBalanceDelta: saldo igual gera delta zero', () => {
  assert.equal(computeBalanceDelta(100, 100), 0);
});

test('formatSignedCurrency antepõe "+" apenas para ajuste positivo -- negativo já vem com sinal do formatCurrency', () => {
  const fakeFormatCurrency = (value) => (value < 0 ? `-R$ ${Math.abs(value)}` : `R$ ${value}`);
  assert.equal(formatSignedCurrency(97.8, fakeFormatCurrency), '+R$ 97.8');
  assert.equal(formatSignedCurrency(-150, fakeFormatCurrency), '-R$ 150');
  assert.equal(formatSignedCurrency(0, fakeFormatCurrency), 'R$ 0');
});
