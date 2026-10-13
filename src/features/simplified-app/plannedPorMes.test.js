import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getMonthRange,
  plannedQueryDateFrom,
  selectPlannedForMonth,
  summarizePlannedBalance,
} from './simplifiedRecordsData.js';

const HOJE = '2026-06-15';
const parcelas = [
  { id: 'p1', transaction_date: '2026-07-10', transaction_type: 'expense', amount: 100, status: 'pending' },
  { id: 'p2', transaction_date: '2026-08-10', transaction_type: 'expense', amount: 100, status: 'pending' },
  { id: 'p3', transaction_date: '2026-09-10', transaction_type: 'expense', amount: 100, status: 'pending' },
  { id: 'p4', transaction_date: '2026-10-10', transaction_type: 'expense', amount: 100, status: 'pending' },
];
const mes = (m) => getMonthRange(new Date(2026, m - 1, 1));
const ids = (lista) => lista.map((item) => item.id);

test('mês futuro consulta a partir do dia 1, sem acumular o anterior', () => {
  assert.equal(plannedQueryDateFrom(mes(8), HOJE), '2026-08-01');
  assert.equal(plannedQueryDateFrom(mes(9), HOJE), '2026-09-01');
});

test('mês atual consulta sem data inicial para trazer vencidos', () => {
  assert.equal(plannedQueryDateFrom(mes(6), HOJE), undefined);
});

test('4 parcelas: agosto e setembro mostram só a própria', () => {
  // Resultado de uma consulta antiga sem data inicial (julho junto).
  assert.deepEqual(ids(selectPlannedForMonth(parcelas, mes(8), HOJE)), ['p2']);
  assert.deepEqual(ids(selectPlannedForMonth(parcelas, mes(9), HOJE)), ['p3']);
  assert.deepEqual(ids(selectPlannedForMonth(parcelas, mes(7), HOJE)), ['p1']);
  assert.equal(summarizePlannedBalance(selectPlannedForMonth(parcelas, mes(9), HOJE)), -100);
});

test('mês atual mantém vencidos de meses anteriores', () => {
  const vencido = { id: 'v', transaction_date: '2026-05-20', transaction_type: 'expense', amount: 50, status: 'pending' };
  const futuro = { id: 'f', transaction_date: '2026-07-01', transaction_type: 'expense', amount: 50, status: 'pending' };
  assert.deepEqual(ids(selectPlannedForMonth([vencido, futuro], mes(6), HOJE)), ['v']);
});

test('mês passado não recebe previstos de outros meses', () => {
  const vencido = { id: 'v', transaction_date: '2026-03-20', transaction_type: 'expense', amount: 50, status: 'pending' };
  assert.deepEqual(ids(selectPlannedForMonth([vencido], mes(5), HOJE)), []);
});
