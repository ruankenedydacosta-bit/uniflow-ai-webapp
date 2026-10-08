import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildFutureTransactionAgendaItems,
  buildMonthTransactionRange,
  isProjectedTransactionItem,
} from './agendaTransactionProjection.js';
import { groupAgendaItemsByDay } from './simplifiedAgendaCalendar.js';

const NOW = new Date(2026, 9, 8, 16, 0);

function transaction(overrides = {}) {
  return {
    id: 'tx-1',
    description: 'Aluguel',
    transaction_type: 'expense',
    status: 'completed',
    transaction_date: '2026-10-09',
    created_at: '2026-10-08T19:49:52.848Z',
    updated_at: '2026-10-08T19:49:52.848Z',
    ...overrides,
  };
}

test('despesa com data futura vira conta a pagar no dia da transação, mesmo já concluída', () => {
  const [item] = buildFutureTransactionAgendaItems([transaction()], { now: NOW });

  assert.equal(item.id, 'transaction:tx-1');
  assert.equal(item.item_type, 'payment_due');
  assert.equal(item.title, 'Aluguel');
  assert.equal(item.is_all_day, true);
  assert.equal(item.has_explicit_time, false);
  assert.equal(new Date(item.starts_at).getDate(), 9);
  assert.equal(new Date(item.starts_at).getMonth(), 9);
  assert.equal(isProjectedTransactionItem(item), true);
});

test('receita com data futura vira recebimento', () => {
  const [item] = buildFutureTransactionAgendaItems(
    [transaction({ transaction_type: 'income', description: 'Salário' })],
    { now: NOW },
  );
  assert.equal(item.item_type, 'receivable');
});

test('transação de hoje ou do passado não entra na Agenda', () => {
  const items = buildFutureTransactionAgendaItems([
    transaction({ id: 'hoje', transaction_date: '2026-10-08' }),
    transaction({ id: 'ontem', transaction_date: '2026-10-07' }),
  ], { now: NOW });
  assert.deepEqual(items, []);
});

test('cancelada e falha não entram; transferência e ajuste não entram', () => {
  const items = buildFutureTransactionAgendaItems([
    transaction({ id: 'a', status: 'canceled' }),
    transaction({ id: 'b', status: 'failed' }),
    transaction({ id: 'c', transaction_type: 'transfer' }),
    transaction({ id: 'd', transaction_type: 'adjustment' }),
  ], { now: NOW });
  assert.deepEqual(items, []);
});

test('pendente com data futura entra', () => {
  const items = buildFutureTransactionAgendaItems(
    [transaction({ status: 'pending' })],
    { now: NOW },
  );
  assert.equal(items.length, 1);
});

test('item projetado cai no dia certo do calendário', () => {
  const items = buildFutureTransactionAgendaItems([transaction()], { now: NOW });
  const grouped = groupAgendaItemsByDay(items);
  assert.equal(grouped.get('2026-10-09')?.length, 1);
});

test('intervalo do mês cobre do dia 1 ao último dia', () => {
  assert.deepEqual(buildMonthTransactionRange(2026, 9), {
    dateFrom: '2026-10-01',
    dateTo: '2026-10-31',
  });
  assert.deepEqual(buildMonthTransactionRange(2028, 1), {
    dateFrom: '2028-02-01',
    dateTo: '2028-02-29',
  });
});

test('item comum da agenda nunca é tratado como projeção', () => {
  assert.equal(isProjectedTransactionItem({ id: 'uuid', item_type: 'meeting' }), false);
  assert.equal(isProjectedTransactionItem(null), false);
});
