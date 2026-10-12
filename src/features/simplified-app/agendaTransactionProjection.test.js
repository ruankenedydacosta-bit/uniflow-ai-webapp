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
    status: 'pending',
    transaction_date: '2026-10-09',
    created_at: localIso(2026, 10, 8),
    updated_at: localIso(2026, 10, 8),
    ...overrides,
  };
}

test('despesa prevista vira conta a pagar no dia da transação', () => {
  const [item] = buildScheduledTransactionAgendaItems([transaction()]);

  assert.equal(item.id, 'transaction:tx-1');
  assert.equal(item.item_type, 'payment_due');
  assert.equal(item.title, 'Aluguel');
  assert.equal(item.is_all_day, true);
  assert.equal(item.has_explicit_time, false);
  assert.equal(item.status, 'scheduled');
  assert.equal(isProjectedTransactionItem(item), true);
});

test('receita prevista vira recebimento', () => {
  const [item] = buildScheduledTransactionAgendaItems([
    transaction({ transaction_type: 'income', description: 'Salário' }),
  ]);
  assert.equal(item.item_type, 'receivable');
});

test('lançamento realizado já aconteceu e não é conta agendada', () => {
  const items = buildScheduledTransactionAgendaItems([
    transaction({ id: 'pago', status: 'completed' }),
    transaction({ id: 'pago-antigo', status: 'completed', transaction_date: '2026-10-01' }),
  ]);
  assert.deepEqual(items, []);
});

test('previsto vencido e não confirmado continua na Agenda', () => {
  const items = buildScheduledTransactionAgendaItems([
    transaction({ transaction_date: '2026-10-01' }),
  ]);
  assert.equal(items.length, 1);
});

test('cancelada, falha, transferência e ajuste ficam fora', () => {
  const items = buildScheduledTransactionAgendaItems([
    transaction({ id: 'a', status: 'canceled' }),
    transaction({ id: 'b', status: 'failed' }),
    transaction({ id: 'c', transaction_type: 'transfer' }),
    transaction({ id: 'd', transaction_type: 'adjustment' }),
  ]);
  assert.deepEqual(items, []);
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

test('no dia com compromissos, a conta abre a timeline como os itens de dia inteiro', () => {
  const [bill] = buildScheduledTransactionAgendaItems([transaction()]);
  const morning = { id: 'm', item_type: 'meeting', title: 'Reunião', starts_at: new Date(2026, 9, 9, 9).toISOString(), status: 'scheduled' };
  const afternoon = { id: 't', item_type: 'meeting', title: 'Visita', starts_at: new Date(2026, 9, 9, 14).toISOString(), status: 'scheduled' };
  const timeline = buildHomeTimeline([afternoon, morning, bill], new Date(2026, 9, 9, 7, 0));
  assert.deepEqual(timeline.items.map((item) => item.title), ['Aluguel', 'Reunião', 'Visita']);
  assert.equal(new Date(bill.starts_at).getHours(), 0);
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
