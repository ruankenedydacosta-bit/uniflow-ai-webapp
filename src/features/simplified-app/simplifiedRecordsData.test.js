import assert from 'node:assert/strict';
import test from 'node:test';

import {
  describePlannedTransaction,
  filterRecordTransactions,
  isPlannedDue,
  summarizePlannedBalance,
} from './simplifiedRecordsData.js';

const HOJE = new Date(2026, 9, 12, 10);

test('previsto: data futura mostra data e categoria', () => {
  const info = describePlannedTransaction({ transaction_date: '2026-10-15' }, 'Impostos', HOJE);
  assert.equal(info.due, false);
  assert.match(info.text, /^15 .*out.* · Impostos$/);
});

test('previsto: hoje, ontem e atrasado pedem confirmação', () => {
  assert.deepEqual(describePlannedTransaction({ transaction_date: '2026-10-12' }, 'X', HOJE), { due: true, dueText: 'Vence hoje', text: 'Vence hoje · Confirme' });
  assert.deepEqual(describePlannedTransaction({ transaction_date: '2026-10-11' }, 'X', HOJE), { due: true, dueText: 'Venceu ontem', text: 'Venceu ontem · Confirme' });
  assert.deepEqual(describePlannedTransaction({ transaction_date: '2026-10-09' }, 'X', HOJE), { due: true, dueText: 'Venceu há 3 dias', text: 'Venceu há 3 dias · Confirme' });
});

test('isPlannedDue: só hoje ou antes', () => {
  assert.equal(isPlannedDue({ transaction_date: '2026-10-12' }, HOJE), true);
  assert.equal(isPlannedDue({ transaction_date: '2026-10-13' }, HOJE), false);
});

test('saldo previsto: entrada soma, saída subtrai, transferência não conta', () => {
  assert.equal(summarizePlannedBalance([
    { transaction_type: 'income', amount: '4000' },
    { transaction_type: 'expense', amount: '3000' },
    { transaction_type: 'expense', amount: '180' },
    { transaction_type: 'transfer', amount: '500' },
  ]), 820);
});

test('filterRecordTransactions escolhe o status e ordena o previsto do mais próximo', () => {
  const lista = [
    { id: 'a', status: 'pending', transaction_date: '2026-10-25', description: 'Acme' },
    { id: 'b', status: 'pending', transaction_date: '2026-10-15', description: 'Impostos' },
    { id: 'c', status: 'completed', transaction_date: '2026-10-10', description: 'Gasolina' },
  ];
  assert.deepEqual(filterRecordTransactions(lista, { status: 'pending', sort: 'oldest' }).map((t) => t.id), ['b', 'a']);
  assert.deepEqual(filterRecordTransactions(lista).map((t) => t.id), ['c']);
});

import { summarizePlannedTotals } from './simplifiedRecordsData.js';

test('totais previstos separam entradas e saídas e ignoram transferência', () => {
  assert.deepEqual(summarizePlannedTotals([
    { transaction_type: 'income', amount: '4000' },
    { transaction_type: 'expense', amount: '3000' },
    { transaction_type: 'expense', amount: '180' },
    { transaction_type: 'transfer', amount: '500' },
  ]), { income: 4000, expense: 3180 });
});
