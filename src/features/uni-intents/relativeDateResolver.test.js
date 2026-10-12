import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidIsoDate, resolveRelativeDateExpression } from './relativeDateResolver.js';

// Relogio fixo para todos os testes: 2026-07-29 é uma quarta-feira.
const REFERENCE = '2026-07-29';

test('hoje/ontem/anteontem/amanha resolvem contra a data de referência fixa', () => {
  assert.equal(resolveRelativeDateExpression('hoje', REFERENCE).resolvedDate, '2026-07-29');
  assert.equal(resolveRelativeDateExpression('ontem', REFERENCE).resolvedDate, '2026-07-28');
  assert.equal(resolveRelativeDateExpression('anteontem', REFERENCE).resolvedDate, '2026-07-27');
  assert.equal(resolveRelativeDateExpression('amanhã', REFERENCE).resolvedDate, '2026-07-30');
});

test('data explícita dd/mm/aaaa não depende da referência', () => {
  const result = resolveRelativeDateExpression('paguei em 05/03/2026', null);
  assert.equal(result.resolvedDate, '2026-03-05');
  assert.equal(result.ruleId, 'explicit_date');
});

test('data explícita inválida (ex.: 31/02) é rejeitada', () => {
  const result = resolveRelativeDateExpression('31/02/2026', REFERENCE);
  assert.equal(result.resolvedDate, null);
});

test('fim do mês e começo do mês resolvem para o mês da referência', () => {
  assert.equal(resolveRelativeDateExpression('fim do mês', REFERENCE).resolvedDate, '2026-07-31');
  assert.equal(resolveRelativeDateExpression('começo do mês', REFERENCE).resolvedDate, '2026-07-01');
  assert.equal(resolveRelativeDateExpression('início do mês', REFERENCE).resolvedDate, '2026-07-01');
});

test('fim do mês resolve corretamente em fevereiro (mês curto)', () => {
  assert.equal(resolveRelativeDateExpression('fim do mês', '2026-02-10').resolvedDate, '2026-02-28');
});

test('semana passada e semana que vem deslocam 7 dias', () => {
  assert.equal(resolveRelativeDateExpression('semana passada', REFERENCE).resolvedDate, '2026-07-22');
  assert.equal(resolveRelativeDateExpression('semana que vem', REFERENCE).resolvedDate, '2026-08-05');
});

test('"dia N" resolve para a ocorrência mais recente que não seja futura', () => {
  // Referência é dia 29 -- "dia 5" já passou neste mês.
  assert.equal(resolveRelativeDateExpression('dia 5', REFERENCE).resolvedDate, '2026-07-05');
  // "dia 29" é a própria referência (não é futuro).
  assert.equal(resolveRelativeDateExpression('dia 29', REFERENCE).resolvedDate, '2026-07-29');
  // "dia 30" ainda não aconteceu neste mês -> mês anterior.
  assert.equal(resolveRelativeDateExpression('dia 30', REFERENCE).resolvedDate, '2026-06-30');
});

test('"dia N do mês que vem" resolve para o dia N do mês seguinte', () => {
  assert.equal(resolveRelativeDateExpression('lança o aluguel de 1500 pro dia 10 do mês que vem', REFERENCE).resolvedDate, '2026-08-10');
  assert.equal(resolveRelativeDateExpression('dia 5 do próximo mês', REFERENCE).ruleId, 'day_of_next_month');
  // Virada do ano.
  assert.equal(resolveRelativeDateExpression('dia 3 do mês que vem', '2026-12-20').resolvedDate, '2027-01-03');
  // Agosto tem 31 dias, setembro não: "dia 31" fica sem data.
  assert.equal(resolveRelativeDateExpression('dia 31 do mês que vem', '2026-08-15').resolvedDate, null);
});

test('"dia N" inválido para o mês (ex.: dia 31 em mês de 30 dias) é rejeitado', () => {
  // Junho tem 30 dias -- "dia 31" cairia em julho, então é rejeitado no mês anterior.
  const result = resolveRelativeDateExpression('dia 31', '2026-07-01');
  assert.equal(result.resolvedDate, null);
});

test('nome de dia da semana (bare) resolve para a ocorrência passada mais recente', () => {
  // Referência 2026-07-29 é quarta. "Segunda" mais recente é 2026-07-27.
  assert.equal(resolveRelativeDateExpression('segunda', REFERENCE).resolvedDate, '2026-07-27');
  assert.equal(resolveRelativeDateExpression('segunda-feira', REFERENCE).resolvedDate, '2026-07-27');
  assert.equal(resolveRelativeDateExpression('segunda passada', REFERENCE).resolvedDate, '2026-07-27');
});

test('nome de dia da semana com "que vem"/"próxima" resolve para a ocorrência futura mais próxima', () => {
  assert.equal(resolveRelativeDateExpression('segunda que vem', REFERENCE).resolvedDate, '2026-08-03');
  assert.equal(resolveRelativeDateExpression('próxima segunda', REFERENCE).resolvedDate, '2026-08-03');
});

test('expressão desconhecida ou vazia retorna null sem lançar', () => {
  assert.equal(resolveRelativeDateExpression('igual ao mês passado', REFERENCE).resolvedDate, null);
  assert.equal(resolveRelativeDateExpression('', REFERENCE).resolvedDate, null);
  assert.equal(resolveRelativeDateExpression(null, REFERENCE).resolvedDate, null);
  assert.equal(resolveRelativeDateExpression(undefined, REFERENCE).resolvedDate, null);
});

test('referência inválida ou ausente nunca lança -- apenas retorna null (exceto data explícita)', () => {
  assert.equal(resolveRelativeDateExpression('ontem', null).resolvedDate, null);
  assert.equal(resolveRelativeDateExpression('ontem', 'not-a-date').resolvedDate, null);
  assert.equal(resolveRelativeDateExpression('ontem', undefined).resolvedDate, null);
});

test('isValidIsoDate valida datas reais e rejeita inválidas', () => {
  assert.equal(isValidIsoDate('2026-07-29'), true);
  assert.equal(isValidIsoDate('2026-02-30'), false);
  assert.equal(isValidIsoDate('not-a-date'), false);
  assert.equal(isValidIsoDate(null), false);
});

test('verbo no futuro ou lookAhead: "dia N" e dia da semana vão para a próxima ocorrência', () => {
  // Referência 2026-07-29 (quarta).
  assert.equal(resolveRelativeDateExpression('vou pagar a internet dia 30', REFERENCE).resolvedDate, '2026-07-30');
  assert.equal(resolveRelativeDateExpression('o salário cai dia 5', REFERENCE).resolvedDate, '2026-08-05');
  assert.equal(resolveRelativeDateExpression('o boleto vence dia 29', REFERENCE).resolvedDate, '2026-07-29');
  assert.equal(resolveRelativeDateExpression('vence sexta', REFERENCE).resolvedDate, '2026-07-31');
  // "Dia N" de hoje é hoje; o dia da semana de hoje é o da semana que vem.
  assert.equal(resolveRelativeDateExpression('vence quarta', REFERENCE).resolvedDate, '2026-08-05');
  assert.equal(resolveRelativeDateExpression('dia 15', REFERENCE, { lookAhead: true }).resolvedDate, '2026-08-15');
  assert.equal(resolveRelativeDateExpression('pra sexta', REFERENCE, { lookAhead: true }).resolvedDate, '2026-07-31');
  // "Passada" ganha do lookAhead; sem marcador, segue para o passado.
  assert.equal(resolveRelativeDateExpression('segunda passada', REFERENCE, { lookAhead: true }).resolvedDate, '2026-07-27');
  assert.equal(resolveRelativeDateExpression('paguei dia 5', REFERENCE).resolvedDate, '2026-07-05');
  // Dia que não existe no mês seguinte fica sem data.
  assert.equal(resolveRelativeDateExpression('vence dia 31', '2026-08-31').resolvedDate, '2026-08-31');
  assert.equal(resolveRelativeDateExpression('vence dia 31', '2026-10-31').resolvedDate, '2026-10-31');
  assert.equal(resolveRelativeDateExpression('vence dia 31', '2026-11-15').resolvedDate, '2026-12-31');
  // 30 de janeiro já passou e fevereiro não tem dia 30.
  assert.equal(resolveRelativeDateExpression('vence dia 30', '2026-01-31').resolvedDate, null);
});
