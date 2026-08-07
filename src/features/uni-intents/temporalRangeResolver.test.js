import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveTemporalRange } from './temporalRangeResolver.js';

// Data de referência FIXA (nunca Date.now() implícito) -- quarta-feira.
const REF = '2026-08-05';

function iso(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return iso(d);
}

test('hoje / ontem / anteontem / amanhã resolvem como intervalo de 1 dia', () => {
  assert.deepEqual(resolveTemporalRange('hoje', REF).start, REF);
  assert.deepEqual(resolveTemporalRange('hoje', REF).end, REF);
  assert.equal(resolveTemporalRange('ontem', REF).start, addDays(REF, -1));
  assert.equal(resolveTemporalRange('anteontem', REF).start, addDays(REF, -2));
  assert.equal(resolveTemporalRange('amanhã', REF).start, addDays(REF, 1));
  for (const expr of ['hoje', 'ontem', 'anteontem', 'amanhã']) {
    const result = resolveTemporalRange(expr, REF);
    assert.equal(result.status, 'resolved');
    assert.equal(result.granularity, 'day');
    assert.equal(result.start, result.end);
  }
});

test('esta semana / semana passada resolvem como intervalo de segunda a domingo', () => {
  const thisWeek = resolveTemporalRange('esta semana', REF);
  assert.equal(thisWeek.status, 'resolved');
  assert.equal(thisWeek.start, '2026-08-03'); // segunda-feira
  assert.equal(thisWeek.end, '2026-08-09'); // domingo

  const lastWeek = resolveTemporalRange('semana passada', REF);
  assert.equal(lastWeek.start, '2026-07-27');
  assert.equal(lastWeek.end, '2026-08-02');
});

test('este mês / mês passado resolvem como o mês inteiro', () => {
  const thisMonth = resolveTemporalRange('este mês', REF);
  assert.equal(thisMonth.start, '2026-08-01');
  assert.equal(thisMonth.end, '2026-08-31');
  assert.deepEqual(thisMonth.monthKeys, ['2026-08']);

  const lastMonth = resolveTemporalRange('mês passado', REF);
  assert.equal(lastMonth.start, '2026-07-01');
  assert.equal(lastMonth.end, '2026-07-31');
  assert.deepEqual(lastMonth.monthKeys, ['2026-07']);
});

test('este ano / ano passado', () => {
  const thisYear = resolveTemporalRange('este ano', REF);
  assert.equal(thisYear.start, '2026-01-01');
  assert.equal(thisYear.end, REF);

  const lastYear = resolveTemporalRange('ano passado', REF);
  assert.equal(lastYear.start, '2025-01-01');
  assert.equal(lastYear.end, '2025-12-31');
});

test('últimos N dias (7, 30, 90) contam a partir de hoje, inclusive', () => {
  for (const n of [7, 30, 90]) {
    const result = resolveTemporalRange(`últimos ${n} dias`, REF);
    assert.equal(result.status, 'resolved');
    assert.equal(result.end, REF);
    assert.equal(result.start, addDays(REF, -(n - 1)));
    assert.equal(result.granularity, 'day');
  }
});

test('desde janeiro (mês nomeado, sem ano) vai do dia 1 até a data de referência', () => {
  const result = resolveTemporalRange('desde janeiro', REF);
  assert.equal(result.status, 'resolved');
  assert.equal(result.start, '2026-01-01');
  assert.equal(result.end, REF);
});

test('entre março e maio (meses nomeados, sem ano) usa o ano de referência', () => {
  const result = resolveTemporalRange('entre março e maio', REF);
  assert.equal(result.status, 'resolved');
  assert.equal(result.start, '2026-03-01');
  assert.equal(result.end, '2026-05-31');
  assert.deepEqual(result.monthKeys, ['2026-03', '2026-04', '2026-05']);
});

test('primeiro semestre / segundo semestre', () => {
  const first = resolveTemporalRange('primeiro semestre', REF);
  assert.equal(first.start, '2026-01-01');
  assert.equal(first.end, '2026-06-30');

  const second = resolveTemporalRange('segundo semestre', REF);
  assert.equal(second.start, '2026-07-01');
  assert.equal(second.end, '2026-12-31');
});

test('expressões embutidas em frases completas continuam sendo reconhecidas', () => {
  assert.equal(resolveTemporalRange('quanto já gastei este mês', REF).status, 'resolved');
  assert.equal(resolveTemporalRange('quanto gastei nos últimos 7 dias', REF).status, 'resolved');
  assert.equal(resolveTemporalRange('e no mês passado?', REF).status, 'resolved');
  assert.equal(resolveTemporalRange('quanto entrou entre março e maio', REF).start, '2026-03-01');
});

test('expressão desconhecida nunca inventa -- devolve not_recognized', () => {
  assert.equal(resolveTemporalRange('quanto gastei com mercado', REF).status, 'not_recognized');
  assert.equal(resolveTemporalRange('', REF).status, 'not_recognized');
  assert.equal(resolveTemporalRange(null, REF).status, 'not_recognized');
});
