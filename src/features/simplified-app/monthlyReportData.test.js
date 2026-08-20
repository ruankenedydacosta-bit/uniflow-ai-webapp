import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMonthlyReportAgenda,
  buildMonthlyReportData,
  buildMonthlyReportTransactions,
  groupReportTransactionsByDay,
} from './monthlyReportData.js';
import { getMonthRange, summarizeMonth } from './simplifiedRecordsData.js';

const NOW = new Date(2026, 7, 19, 12); // 19/08/2026

const CATEGORIES = [
  { id: 'cat-food', name: 'Alimentação' },
  { id: 'cat-transport', name: 'Transporte' },
  { id: 'cat-salary', name: 'Salário' },
];

function tx({
  id,
  type,
  amount,
  categoryId = null,
  date = '2026-08-10',
  status = 'completed',
  description = 'Lançamento',
  createdAt = '2026-08-10T10:00:00Z',
  adjustmentTarget = null,
  adjustmentDelta = null,
}) {
  return {
    id,
    transaction_type: type,
    amount,
    category_id: categoryId,
    transaction_date: date,
    status,
    description,
    created_at: createdAt,
    adjustment_target: adjustmentTarget,
    adjustment_delta: adjustmentDelta,
  };
}

function agendaItem({
  id, title, startsAt, status = 'scheduled', isAllDay = false, hasExplicitTime = true,
}) {
  return {
    id, title, starts_at: startsAt, ends_at: null, status, is_all_day: isAllDay, has_explicit_time: hasExplicitTime,
  };
}

// ============================================================================
// FONTE DE VERDADE -- os totais do relatório saem exatamente das mesmas
// funções de Registros (getMonthRange/summarizeMonth), nunca de uma
// terceira regra de cálculo.
// ============================================================================

test('FONTE DE VERDADE: totais do relatório saem de summarizeMonth (mesma função de Registros)', () => {
  const transactions = [
    tx({
      id: 1, type: 'expense', amount: 92.8, categoryId: 'cat-food', date: '2026-08-05',
    }),
    tx({
      id: 2, type: 'expense', amount: 50, categoryId: 'cat-food', date: '2026-08-19',
    }),
    tx({
      id: 3, type: 'adjustment', amount: 0, date: '2026-08-15', adjustmentTarget: 'expense', adjustmentDelta: 50,
    }),
  ];
  const registros = summarizeMonth(transactions);
  const report = buildMonthlyReportData({ transactions, categories: CATEGORIES, now: NOW });
  assert.equal(report.summary.expense, registros.expense);
  assert.equal(report.summary.income, registros.income);
  assert.match(report.summary.expenseLabel, /192,80/);
});

test('período do relatório vem de getMonthRange -- mesmo mês/label que Registros', () => {
  const report = buildMonthlyReportData({ transactions: [], categories: [], now: NOW });
  assert.equal(report.period.dateFrom, getMonthRange(NOW).dateFrom);
  assert.equal(report.period.dateTo, getMonthRange(NOW).dateTo);
  assert.match(report.period.label, /agosto de 2026/i);
});

test('nenhum campo de saldo/patrimônio é exposto no resultado', () => {
  const report = buildMonthlyReportData({ transactions: [], categories: [], now: NOW });
  assert.equal('balance' in report.summary, false);
  assert.equal('workspaceBalance' in report, false);
  assert.equal('balance' in report, false);
});

test('centavos preservados -- nunca arredondar 192,80 para 193', () => {
  const transactions = [
    tx({
      id: 1, type: 'expense', amount: 192.8, categoryId: 'cat-food',
    }),
  ];
  const report = buildMonthlyReportData({ transactions, categories: CATEGORIES, now: NOW });
  assert.match(report.summary.expenseLabel, /192,80/);
});

// ============================================================================
// Movimentações -- todas (nunca limitadas a 2), ordem de Registros.
// ============================================================================

test('lista TODAS as movimentações do mês -- nunca limitada a 2 (a limitação é só da Home)', () => {
  const transactions = [1, 2, 3, 4, 5, 6].map((n) => tx({
    id: n, type: 'expense', amount: n * 10, date: `2026-08-0${n}`, createdAt: `2026-08-0${n}T10:00:00Z`,
  }));
  const rows = buildMonthlyReportTransactions(transactions, CATEGORIES);
  assert.equal(rows.length, 6);
});

test('ordem é a mesma de filterRecordTransactions (transaction_date desc, nunca só created_at)', () => {
  const transactions = [
    tx({
      id: 'antiga', type: 'expense', amount: 10, date: '2026-08-02', createdAt: '2026-08-10T00:00:00Z',
    }),
    tx({
      id: 'nova', type: 'expense', amount: 20, date: '2026-08-18', createdAt: '2026-08-01T00:00:00Z',
    }),
  ];
  const rows = buildMonthlyReportTransactions(transactions, CATEGORIES);
  assert.deepEqual(rows.map((r) => r.id), ['nova', 'antiga']);
});

test('sinal e rótulo seguem a mesma regra de Registros: income ou ajuste positivo = Entrada', () => {
  const transactions = [
    tx({
      id: 'inc', type: 'income', amount: 100,
    }),
    tx({
      id: 'exp', type: 'expense', amount: 50,
    }),
    tx({
      id: 'adj-pos', type: 'adjustment', amount: 0, adjustmentTarget: 'income', adjustmentDelta: 30,
    }),
    tx({
      id: 'adj-neg', type: 'adjustment', amount: 0, adjustmentTarget: 'expense', adjustmentDelta: -30,
    }),
  ];
  const rows = buildMonthlyReportTransactions(transactions, CATEGORIES);
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(byId.inc.typeLabel, 'Entrada');
  assert.equal(byId.inc.isPositive, true);
  assert.equal(byId.exp.typeLabel, 'Saída');
  assert.equal(byId.exp.isPositive, false);
  assert.equal(byId['adj-pos'].typeLabel, 'Entrada');
  assert.equal(byId['adj-neg'].typeLabel, 'Saída');
});

test('terminologia pública nunca usa income/expense/adjustment -- só Entrada/Saída', () => {
  const transactions = [tx({ id: 1, type: 'income', amount: 100 })];
  const rows = buildMonthlyReportTransactions(transactions, CATEGORIES);
  assert.ok(['Entrada', 'Saída', 'Transferência'].includes(rows[0].typeLabel));
});

test('categoria vem da lista real, com fallback seguro para categoria removida/ausente', () => {
  const transactions = [
    tx({
      id: 1, type: 'expense', amount: 10, categoryId: 'cat-food',
    }),
    tx({
      id: 2, type: 'expense', amount: 10, categoryId: 'removida',
    }),
  ];
  const rows = buildMonthlyReportTransactions(transactions, CATEGORIES);
  assert.equal(rows.find((r) => r.id === 1).categoryName, 'Alimentação');
  assert.equal(rows.find((r) => r.id === 2).categoryName, 'Sem categoria');
});

test('agrupamento por dia preserva a ordem e rotula "DD DE MÊS" maiúsculo', () => {
  const transactions = [
    tx({
      id: 1, type: 'expense', amount: 50, date: '2026-08-19', description: 'Mercado',
    }),
    tx({
      id: 2, type: 'expense', amount: 18, date: '2026-08-18', description: 'Uber',
    }),
  ];
  const rows = buildMonthlyReportTransactions(transactions, CATEGORIES);
  const groups = groupReportTransactionsByDay(rows);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].dateKey, '2026-08-19');
  assert.match(groups[0].label, /19 DE AGOSTO/);
  assert.equal(groups[0].items[0].description, 'Mercado');
});

test('sem movimentações: hasTransactions=false, lista vazia, nenhum valor inventado', () => {
  const report = buildMonthlyReportData({ transactions: [], categories: CATEGORIES, now: NOW });
  assert.equal(report.hasTransactions, false);
  assert.deepEqual(report.transactionsByDay, []);
  assert.equal(report.summary.income, 0);
  assert.equal(report.summary.expense, 0);
});

// ============================================================================
// Agenda -- todos os compromissos do mês, mais próximo primeiro.
// ============================================================================

test('agenda: itens ordenados por starts_at crescente (mais próximo primeiro)', () => {
  const items = [
    agendaItem({ id: 'tarde', title: 'Reunião', startsAt: '2026-08-20T18:00:00Z' }),
    agendaItem({ id: 'manha', title: 'Dentista', startsAt: '2026-08-20T09:00:00Z' }),
  ];
  const rows = buildMonthlyReportAgenda(items);
  assert.deepEqual(rows.map((r) => r.id), ['manha', 'tarde']);
});

test('agenda: status reaproveita o lifecycle existente (scheduled/completed/cancelled), só traduz o rótulo', () => {
  const items = [
    agendaItem({
      id: 1, title: 'A', startsAt: '2026-08-20T09:00:00Z', status: 'scheduled',
    }),
    agendaItem({
      id: 2, title: 'B', startsAt: '2026-08-21T09:00:00Z', status: 'completed',
    }),
    agendaItem({
      id: 3, title: 'C', startsAt: '2026-08-22T09:00:00Z', status: 'cancelled',
    }),
  ];
  const rows = buildMonthlyReportAgenda(items);
  assert.deepEqual(rows.map((r) => r.statusLabel), ['Agendado', 'Concluído', 'Cancelado']);
  assert.deepEqual(rows.map((r) => r.status), ['scheduled', 'completed', 'cancelled']);
});

test('agenda: lembrete aparece só quando configurado (30/60 min), reaproveitando resolveReminderIndicator', () => {
  const items = [
    agendaItem({ id: 'com-lembrete', title: 'Reunião', startsAt: '2026-08-20T09:00:00Z' }),
    agendaItem({ id: 'sem-lembrete', title: 'Dentista', startsAt: '2026-08-21T09:00:00Z' }),
  ];
  const reminderStates = new Map([
    ['com-lembrete', { agenda_item_id: 'com-lembrete', reminder_offset_minutes: 30 }],
  ]);
  const rows = buildMonthlyReportAgenda(items, reminderStates);
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.ok(byId['com-lembrete'].reminderLabel);
  assert.equal(byId['sem-lembrete'].reminderLabel, null);
});

test('agenda: sem compromissos, lista vazia -- hasAgenda=false, nenhum dado fictício', () => {
  const report = buildMonthlyReportData({ agendaItems: [], now: NOW });
  assert.equal(report.hasAgenda, false);
  assert.deepEqual(report.agenda, []);
});

test('data/hora do item de agenda reaproveita buildAgendaItemPresentation -- nunca um novo cálculo de timezone', () => {
  const items = [agendaItem({ id: 1, title: 'Reunião com João', startsAt: new Date(2026, 7, 20, 9, 0).toISOString() })];
  const rows = buildMonthlyReportAgenda(items);
  assert.equal(rows[0].timeLabel, '09:00');
  assert.match(rows[0].dateLabel, /20 AGO/i);
});
