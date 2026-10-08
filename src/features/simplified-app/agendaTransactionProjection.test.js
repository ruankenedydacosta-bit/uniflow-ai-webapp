import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMonthTransactionRange,
  buildScheduledTransactionAgendaItems,
  isProjectedTransactionItem,
} from './agendaTransactionProjection.js';
import { groupAgendaItemsByDay } from './simplifiedAgendaCalendar.js';
import { buildHomeTimeline } from './simplifiedHomeAgenda.js';

function localIso(year, month, day, hour = 16) {
  return new Date(year, month - 1, day, hour, 49).toISOString();
}

function transaction(overrides = {}) {
  return {
    id: 'tx-1',
    description: 'Aluguel',
    transaction_type: 'expense',
    status: 'completed',
    transaction_date: '2026-10-09',
    created_at: localIso(2026, 10, 8),
    updated_at: localIso(2026, 10, 8),
    ...overrides,
  };
}

test('despesa lançada com data futura vira conta a pagar no dia da transação, mesmo com status concluído', () => {
  const [item] = buildScheduledTransactionAgendaItems([transaction()]);

  assert.equal(item.id, 'transaction:tx-1');
  assert.equal(item.item_type, 'payment_due');
  assert.equal(item.title, 'Aluguel');
  assert.equal(item.is_all_day, true);
  assert.equal(item.has_explicit_time, false);
  assert.equal(item.status, 'scheduled');
  assert.equal(isProjectedTransactionItem(item), true);
});

test('receita lançada com data futura vira recebimento', () => {
  const [item] = buildScheduledTransactionAgendaItems([
    transaction({ transaction_type: 'income', description: 'Salário' }),
  ]);
  assert.equal(item.item_type, 'receivable');
});

test('lançamento com a data do próprio dia ou retroativo não é conta agendada', () => {
  const items = buildScheduledTransactionAgendaItems([
    transaction({ id: 'mesmo-dia', transaction_date: '2026-10-08' }),
    transaction({ id: 'retroativo', transaction_date: '2026-10-01' }),
  ]);
  assert.deepEqual(items, []);
});

test('o critério é a data de registro em hora local, não o UTC', () => {
  // 08/10 às 23h no fuso local pode ser 09/10 em UTC; continua sendo
  // registro do dia 08, então a conta do dia 09 entra.
  const items = buildScheduledTransactionAgendaItems([
    transaction({ created_at: localIso(2026, 10, 8, 23) }),
  ]);
  assert.equal(items.length, 1);
});

test('cancelada, falha, transferência, ajuste e created_at inválido ficam fora', () => {
  const items = buildScheduledTransactionAgendaItems([
    transaction({ id: 'a', status: 'canceled' }),
    transaction({ id: 'b', status: 'failed' }),
    transaction({ id: 'c', transaction_type: 'transfer' }),
    transaction({ id: 'd', transaction_type: 'adjustment' }),
    transaction({ id: 'e', created_at: null }),
    transaction({ id: 'f', created_at: 'data-invalida' }),
  ]);
  assert.deepEqual(items, []);
});

test('pendente lançada com data futura entra', () => {
  const items = buildScheduledTransactionAgendaItems([transaction({ status: 'pending' })]);
  assert.equal(items.length, 1);
});

test('item projetado cai no dia certo do calendário', () => {
  const grouped = groupAgendaItemsByDay(buildScheduledTransactionAgendaItems([transaction()]));
  assert.equal(grouped.get('2026-10-09')?.length, 1);
});

test('na véspera, a Home mostra a conta sob "Amanhã"', () => {
  const items = buildScheduledTransactionAgendaItems([transaction()]);
  const timeline = buildHomeTimeline(items, new Date(2026, 9, 8, 17, 0));
  assert.equal(timeline.title, 'Amanhã');
  assert.equal(timeline.items[0].title, 'Aluguel');
  assert.equal(timeline.items[0].time, 'Dia inteiro');
});

test('no dia do vencimento a conta continua na Home, sob "Hoje", e não aparece como feita', () => {
  const items = buildScheduledTransactionAgendaItems([transaction()]);
  const timeline = buildHomeTimeline(items, new Date(2026, 9, 9, 18, 0));
  assert.equal(timeline.title, 'Hoje');
  assert.equal(timeline.items[0].title, 'Aluguel');
  assert.notEqual(timeline.items[0].status, 'done');
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
