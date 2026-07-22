import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateCrmMetrics, formatConversionRate } from './crmMetrics.js';

// --- 1. array vazio ------------------------------------------------------------------

test('calculateCrmMetrics com array vazio retorna todos os campos zerados', () => {
  const metrics = calculateCrmMetrics([]);
  assert.deepEqual(metrics, {
    openCount: 0,
    openValue: 0,
    wonCount: 0,
    conversionRate: 0,
    averageWonTicket: 0,
    wonValue: 0,
    lostValue: 0,
  });
});

// --- 2/3. oportunidades abertas: contagem e soma --------------------------------------

test('conta e soma oportunidades abertas', () => {
  const metrics = calculateCrmMetrics([
    { outcome: 'open', estimated_value: 1000 },
    { outcome: 'open', estimated_value: 500 },
  ]);
  assert.equal(metrics.openCount, 2);
  assert.equal(metrics.openValue, 1500);
});

// --- 4/5. oportunidades ganhas: contagem e soma ---------------------------------------

test('conta e soma oportunidades ganhas', () => {
  const metrics = calculateCrmMetrics([
    { outcome: 'won', estimated_value: 2000 },
    { outcome: 'won', estimated_value: 3000 },
  ]);
  assert.equal(metrics.wonCount, 2);
  assert.equal(metrics.wonValue, 5000);
});

// --- 6. valor perdido e somado ---------------------------------------------------------

test('soma o valor perdido', () => {
  const metrics = calculateCrmMetrics([
    { outcome: 'lost', estimated_value: 700 },
    { outcome: 'lost', estimated_value: 300 },
  ]);
  assert.equal(metrics.lostValue, 1000);
});

// --- 7. canceladas nao entram no valor perdido ------------------------------------------

test('oportunidades canceladas nao entram no valor perdido nem em nenhum outro campo', () => {
  const metrics = calculateCrmMetrics([
    { outcome: 'cancelled', estimated_value: 9999 },
    { outcome: 'won', estimated_value: 100 },
  ]);
  assert.equal(metrics.lostValue, 0);
  assert.equal(metrics.wonValue, 100);
  assert.equal(metrics.openValue, 0);
});

// --- 8/9. abertas e canceladas nao entram na taxa de conversao ---------------------------

test('taxa de conversao ignora abertas e canceladas, usa somente won/(won+lost)', () => {
  const metrics = calculateCrmMetrics([
    { outcome: 'open', estimated_value: 100 },
    { outcome: 'cancelled', estimated_value: 100 },
    { outcome: 'won', estimated_value: 100 },
    { outcome: 'lost', estimated_value: 100 },
  ]);
  assert.equal(metrics.conversionRate, 50);
});

// --- 10. formula won / (won + lost) -----------------------------------------------------

test('taxa de conversao usa a formula won / (won + lost) * 100', () => {
  const metrics = calculateCrmMetrics([
    { outcome: 'won', estimated_value: 1 },
    { outcome: 'won', estimated_value: 1 },
    { outcome: 'lost', estimated_value: 1 },
  ]);
  assert.equal(metrics.conversionRate, (2 / 3) * 100);
});

// --- 11. divisao por zero retorna 0 -----------------------------------------------------

test('taxa de conversao retorna 0 quando nao ha won nem lost (sem NaN/Infinity)', () => {
  const metrics = calculateCrmMetrics([{ outcome: 'open', estimated_value: 100 }]);
  assert.equal(metrics.conversionRate, 0);
  assert.equal(Number.isNaN(metrics.conversionRate), false);
  assert.equal(Number.isFinite(metrics.conversionRate), true);
});

// --- 12. ticket medio usa somente ganhas -------------------------------------------------

test('ticket medio ganho usa somente oportunidades ganhas (wonValue / wonCount)', () => {
  const metrics = calculateCrmMetrics([
    { outcome: 'won', estimated_value: 300 },
    { outcome: 'won', estimated_value: 700 },
    { outcome: 'lost', estimated_value: 999999 },
    { outcome: 'open', estimated_value: 999999 },
  ]);
  assert.equal(metrics.averageWonTicket, 500);
});

// --- 13. ticket medio sem ganhas retorna 0 ------------------------------------------------

test('ticket medio ganho retorna 0 quando nao ha oportunidades ganhas', () => {
  const metrics = calculateCrmMetrics([{ outcome: 'lost', estimated_value: 100 }]);
  assert.equal(metrics.averageWonTicket, 0);
});

// --- 14/15. valores numericos e string numerica funcionam ---------------------------------

test('estimated_value numerico e string numerica sao somados corretamente', () => {
  const metrics = calculateCrmMetrics([
    { outcome: 'won', estimated_value: 100 },
    { outcome: 'won', estimated_value: '250.50' },
  ]);
  assert.equal(metrics.wonValue, 350.5);
});

// --- 16/17/18. null, string vazia e valor invalido viram zero -----------------------------

test('null, string vazia e valor invalido em estimated_value viram zero, sem quebrar a soma', () => {
  const metrics = calculateCrmMetrics([
    { outcome: 'open', estimated_value: null },
    { outcome: 'open', estimated_value: '' },
    { outcome: 'open', estimated_value: 'abc' },
    { outcome: 'open', estimated_value: undefined },
    { outcome: 'open', estimated_value: 100 },
  ]);
  assert.equal(metrics.openValue, 100);
  assert.equal(metrics.openCount, 5);
});

// --- 19. resultado nunca contem NaN ---------------------------------------------------------

test('nenhum campo do resultado e NaN, mesmo com entradas hostis', () => {
  const metrics = calculateCrmMetrics([
    { outcome: 'won', estimated_value: NaN },
    { outcome: 'won', estimated_value: Infinity },
    { outcome: 'lost', estimated_value: -Infinity },
    { outcome: 'open', estimated_value: {} },
  ]);
  for (const value of Object.values(metrics)) {
    assert.equal(Number.isNaN(value), false, `campo com NaN: ${value}`);
  }
});

// --- 20. helper nao muta o array original ----------------------------------------------------

test('calculateCrmMetrics nao muta o array nem os objetos de entrada', () => {
  const opportunities = Object.freeze([
    Object.freeze({ outcome: 'won', estimated_value: 100 }),
    Object.freeze({ outcome: 'lost', estimated_value: 200 }),
  ]);

  assert.doesNotThrow(() => calculateCrmMetrics(opportunities));

  const snapshotBefore = JSON.stringify(opportunities);
  calculateCrmMetrics(opportunities);
  assert.equal(JSON.stringify(opportunities), snapshotBefore);
});

test('calculateCrmMetrics trata entrada nao-array como lista vazia, sem lancar', () => {
  assert.deepEqual(calculateCrmMetrics(null), calculateCrmMetrics([]));
  assert.deepEqual(calculateCrmMetrics(undefined), calculateCrmMetrics([]));
  assert.deepEqual(calculateCrmMetrics('not-an-array'), calculateCrmMetrics([]));
});

// --- formatConversionRate: no maximo uma casa decimal, pt-BR ---------------------------------

test('formatConversionRate remove casa decimal quando o valor e inteiro', () => {
  assert.equal(formatConversionRate(0), '0%');
  assert.equal(formatConversionRate(50), '50%');
  assert.equal(formatConversionRate(100), '100%');
});

test('formatConversionRate usa no maximo uma casa decimal, com virgula (pt-BR)', () => {
  assert.equal(formatConversionRate((2 / 3) * 100), '66,7%');
});
