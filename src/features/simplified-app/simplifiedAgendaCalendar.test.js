import assert from 'node:assert/strict';
import test from 'node:test';
import {
  WEEKDAY_LABELS,
  WEEKDAY_HEADER_LABELS,
  buildMonthGrid,
  buildMonthRange,
  compareAgendaItemsByRecentActivity,
  formatAgendaItemTime,
  formatDayHeading,
  formatReminderPromptWhen,
  formatMonthLabel,
  getWeekdayIndex,
  groupAgendaItemsByDay,
  shiftMonth,
  toDateKey,
} from './simplifiedAgendaCalendar.js';

const NOW_2026_08_08 = new Date(2026, 7, 8, 14, 30, 0, 0);

test('WEEKDAY_HEADER_LABELS = SEG..DOM (grade comeca segunda-feira, padrao br)', () => {
  assert.deepEqual(WEEKDAY_HEADER_LABELS, ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM']);
  assert.equal(WEEKDAY_LABELS.length, 7);
});

test('buildMonthGrid: 42 celulas, primeira celula e segunda-feira, ultima domingo', () => {
  const grid = buildMonthGrid(2026, 7, NOW_2026_08_08); // agosto/2026
  assert.equal(grid.length, 42);
  assert.equal(grid[0].weekdayIndex, 0); // SEG
  assert.equal(grid[grid.length - 1].weekdayIndex, 6); // DOM
});

test('buildMonthGrid: agosto 2026 tem dia 1 na SEG (agosto 2026 comeca no sabado, 1 fica suavizado)', () => {
  const grid = buildMonthGrid(2026, 7, NOW_2026_08_08);
  const firstOfMonth = grid.find((c) => c.day === 1);
  assert.ok(firstOfMonth);
  // 01/08/2026 cai num sabado; como a grade comeca na segunda, o dia 1
  // fica na ultima posicao da primeira semana (idx 5, sabado).
  assert.equal(firstOfMonth.weekdayIndex, 5);
  assert.equal(firstOfMonth.inMonth, true);
});

test('buildMonthGrid: celulas fora do mes sao marcadas inMonth=false', () => {
  const grid = buildMonthGrid(2026, 7, NOW_2026_08_08);
  assert.equal(grid.filter((c) => !c.inMonth).length, 11); // 27 jul + 3 set -> 30 jul,31 jul + 6 set = 9? checado abaixo
});

test('buildMonthGrid: hoje tem isToday true somente na data correspondente', () => {
  const grid = buildMonthGrid(2026, 7, NOW_2026_08_08);
  const today = grid.filter((c) => c.isToday);
  assert.equal(today.length, 1);
  assert.equal(today[0].day, 8);
  assert.equal(today[0].inMonth, true);
});

test('formatMonthLabel: "agosto 2026" em minusculo pt-BR', () => {
  assert.equal(formatMonthLabel(2026, 7), 'agosto 2026');
  assert.equal(formatMonthLabel(2026, 0), 'janeiro 2026');
  assert.equal(formatMonthLabel(2025, 11), 'dezembro 2025');
});

test('shiftMonth: avanca e recua mantendo o ano correto (virada de ano)', () => {
  assert.deepEqual(shiftMonth(2026, 7, 1), { year: 2026, month: 8 });
  assert.deepEqual(shiftMonth(2026, 8, -1), { year: 2026, month: 7 });
  assert.deepEqual(shiftMonth(2026, 11, 1), { year: 2027, month: 0 });
  assert.deepEqual(shiftMonth(2026, 0, -1), { year: 2025, month: 11 });
});

test('buildMonthRange: inicio 00:00 local do dia 1 e fim 23:59:59.999 local do ultimo dia', () => {
  const range = buildMonthRange(2026, 7);
  const starts = new Date(range.startsFrom);
  const ends = new Date(range.startsTo);
  assert.equal(starts.getFullYear(), 2026);
  assert.equal(starts.getMonth(), 7);
  assert.equal(starts.getDate(), 1);
  assert.equal(starts.getHours(), 0);
  assert.equal(starts.getMinutes(), 0);
  assert.equal(ends.getMonth(), 7);
  assert.equal(ends.getDate(), 31);
  assert.equal(ends.getHours(), 23);
  assert.equal(ends.getMinutes(), 59);
  assert.ok(ends > starts);
});

test('groupAgendaItemsByDay: agrupa por dia local a partir de starts_at timestamptz', () => {
  const items = [
    { id: 'a', starts_at: new Date(2026, 7, 8, 10, 0, 0, 0).toISOString(), title: 'Reunião' },
    { id: 'b', starts_at: new Date(2026, 7, 8, 15, 30, 0, 0).toISOString(), title: 'Consulta' },
    { id: 'c', starts_at: new Date(2026, 7, 9, 9, 0, 0, 0).toISOString(), title: 'Tarefa' },
  ];
  const grouped = groupAgendaItemsByDay(items);
  assert.equal(grouped.get('2026-08-08').length, 2);
  assert.equal(grouped.get('2026-08-09').length, 1);
  assert.deepEqual(grouped.get('2026-08-08').map((i) => i.title), ['Consulta', 'Reunião']);
});

test('atividade recente ordena itens do mesmo dia por updated_at, created_at e id estável', () => {
  const startsAt = new Date(2026, 7, 8, 10, 0, 0, 0).toISOString();
  const items = [
    { id: 'a', title: 'A', starts_at: startsAt, created_at: '2026-08-01T10:00:00Z', updated_at: '2026-08-01T10:00:00Z' },
    { id: 'b', title: 'B', starts_at: startsAt, created_at: '2026-08-02T10:00:00Z', updated_at: '2026-08-02T10:00:00Z' },
    { id: 'c', title: 'C', starts_at: startsAt, created_at: '2026-08-03T10:00:00Z', updated_at: '2026-08-03T10:00:00Z' },
  ];

  assert.deepEqual(
    groupAgendaItemsByDay(items).get('2026-08-08').map((item) => item.id),
    ['c', 'b', 'a'],
  );

  const editedA = items.map((item) => (
    item.id === 'a' ? { ...item, updated_at: '2026-08-04T10:00:00Z' } : item
  ));
  assert.deepEqual(
    groupAgendaItemsByDay(editedA).get('2026-08-08').map((item) => item.id),
    ['a', 'c', 'b'],
  );
});

test('ordenação por atividade é independente de horário/dia inteiro e estável em reload', () => {
  const items = [
    { id: 'timed', starts_at: new Date(2026, 7, 8, 14).toISOString(), is_all_day: false, created_at: '2026-08-01T10:00:00Z', updated_at: '2026-08-01T10:00:00Z' },
    { id: 'all-day', starts_at: new Date(2026, 7, 8, 0).toISOString(), is_all_day: true, created_at: '2026-08-02T10:00:00Z', updated_at: '2026-08-02T10:00:00Z' },
  ];
  const firstRender = groupAgendaItemsByDay(items).get('2026-08-08').map((item) => item.id);
  const afterReload = groupAgendaItemsByDay(structuredClone(items)).get('2026-08-08').map((item) => item.id);
  assert.deepEqual(firstRender, ['all-day', 'timed']);
  assert.deepEqual(afterReload, firstRender);

  assert.ok(compareAgendaItemsByRecentActivity(
    { id: 'b', updated_at: null, created_at: null },
    { id: 'a', updated_at: null, created_at: null },
  ) < 0);
});

test('groupAgendaItemsByDay: ignora itens com starts_at invalido (nunca inventa dia)', () => {
  const grouped = groupAgendaItemsByDay([{ id: 'x', starts_at: 'invalido' }, null]);
  assert.equal(grouped.size, 0);
});

test('groupAgendaItemsByDay: array vazio/undefined vira mapa vazio', () => {
  assert.equal(groupAgendaItemsByDay([]).size, 0);
  assert.equal(groupAgendaItemsByDay(undefined).size, 0);
});

test('formatAgendaItemTime: dia inteiro vira "Dia inteiro", senao hora local "HH:mm"', () => {
  const item = { starts_at: new Date(2026, 7, 8, 10, 5, 0, 0).toISOString(), is_all_day: false };
  assert.equal(formatAgendaItemTime(item), '10:05');
  assert.equal(formatAgendaItemTime({ starts_at: item.starts_at, is_all_day: true }), 'Dia inteiro');
});

test('formatAgendaItemTime distingue sem horario de 00:00 explicito', () => {
  const startsAt = new Date(2026, 7, 8, 0, 0, 0, 0).toISOString();
  assert.equal(formatAgendaItemTime({
    starts_at: startsAt, is_all_day: false, has_explicit_time: false,
  }), 'Sem horário');
  assert.equal(formatAgendaItemTime({
    starts_at: startsAt, is_all_day: false, has_explicit_time: true,
  }), '00:00');
});

test('formatAgendaItemTime: starts_at invalido nunca devolve string crua', () => {
  assert.equal(formatAgendaItemTime({ starts_at: 'inválido', is_all_day: false }), 'Horário não informado');
});

// Redesign (#89, handoff 06): dia da semana curto e capitalizado.
test('formatDayHeading: "Sábado, 8 de agosto" pt-BR', () => {
  assert.equal(formatDayHeading(new Date(2026, 7, 8, 14, 0, 0, 0)), 'Sábado, 8 de agosto');
  assert.equal(formatDayHeading(new Date(2026, 9, 23, 14, 0, 0, 0)), 'Sexta, 23 de outubro');
});

test('toDateKey: "YYYY-MM-DD" local', () => {
  assert.equal(toDateKey(new Date(2026, 7, 8, 14, 0, 0, 0)), '2026-08-08');
});

test('getWeekdayIndex: domingo-0 vira SEG-0; sabado vira indice 6', () => {
  assert.equal(getWeekdayIndex(new Date(2026, 7, 2, 12, 0, 0, 0)), 6); // domingo 02/08
  assert.equal(getWeekdayIndex(new Date(2026, 7, 3, 12, 0, 0, 0)), 0); // segunda 03/08
});

// ============================================================================
// Redesign (#89, handoff 06): título do mês, chips de filtro, estado dos
// itens na timeline e a frase da Uni sobre amanhã.
// ============================================================================

test('formatMonthTitle/formatWeekdayHeader: "Outubro de 2026" e "Seg"', async () => {
  const { formatMonthTitle, formatWeekdayHeader } = await import('./simplifiedAgendaCalendar.js');
  assert.equal(formatMonthTitle(2026, 9), 'Outubro de 2026');
  assert.equal(formatMonthTitle(2027, 0), 'Janeiro de 2027');
  assert.equal(formatWeekdayHeader('SEG'), 'Seg');
  assert.equal(formatWeekdayHeader('SÁB'), 'Sáb');
});

test('filterAgendaItemsByKind: Tudo não filtra; os demais agrupam tipos', async () => {
  const { AGENDA_KIND_FILTERS, filterAgendaItemsByKind } = await import('./simplifiedAgendaCalendar.js');
  const items = ['meeting', 'appointment', 'task', 'payment_due', 'receivable', 'reminder', 'other']
    .map((item_type) => ({ item_type }));
  assert.deepEqual(AGENDA_KIND_FILTERS.map((option) => option.label), ['Tudo', 'Compromissos', 'Contas', 'Tarefas', 'Lembretes']);
  assert.equal(filterAgendaItemsByKind(items, 'all').length, 7);
  assert.deepEqual(filterAgendaItemsByKind(items, 'appointments').map((item) => item.item_type), ['meeting', 'appointment', 'other']);
  assert.deepEqual(filterAgendaItemsByKind(items, 'bills').map((item) => item.item_type), ['payment_due', 'receivable']);
  assert.deepEqual(filterAgendaItemsByKind(items, 'tasks').map((item) => item.item_type), ['task']);
  assert.deepEqual(filterAgendaItemsByKind(items, 'reminders').map((item) => item.item_type), ['reminder']);
});

test('resolveAgendaItemTone: tarefa violeta, lembrete verde, o resto azul (igual na Home e na Agenda)', async () => {
  const { resolveAgendaItemTone } = await import('./simplifiedAgendaCalendar.js');
  const { resolveAgendaItemTone: homeTone } = await import('./simplifiedHomeAgenda.js');
  assert.equal(homeTone, resolveAgendaItemTone);
  assert.equal(resolveAgendaItemTone({ item_type: 'payment_due' }), 'blue');
  assert.equal(resolveAgendaItemTone({ item_type: 'task' }), 'violet');
  assert.equal(resolveAgendaItemTone({ item_type: 'reminder' }), 'green');
  assert.equal(resolveAgendaItemTone({ item_type: 'meeting' }), 'blue');
  assert.equal(resolveAgendaItemTone(null), 'blue');
});

test('isAgendaItemDone: dia inteiro ou sem horário só termina no fim do dia; com hora, termina no ends_at', async () => {
  const { isAgendaItemDone, resolveAgendaItemEnd } = await import('./simplifiedAgendaCalendar.js');
  const midnight = new Date(2026, 9, 23, 0, 0).toISOString();
  const now = new Date(2026, 9, 23, 15, 0);
  assert.equal(isAgendaItemDone({ starts_at: midnight, ends_at: null, is_all_day: true, status: 'open' }, { now }), false);
  assert.equal(isAgendaItemDone({ starts_at: midnight, ends_at: null, has_explicit_time: false, status: 'open' }, { now }), false);
  assert.equal(isAgendaItemDone({ starts_at: midnight, ends_at: null, is_all_day: true, status: 'open' }, { now: new Date(2026, 9, 24, 0, 1) }), true);
  assert.equal(isAgendaItemDone({ starts_at: midnight, ends_at: null, status: 'open' }, { now }), true);
  assert.equal(isAgendaItemDone({ starts_at: midnight, status: 'completed' }, { now, markPast: false }), true);
  assert.equal(isAgendaItemDone({ starts_at: midnight, status: 'open' }, { now, markPast: false }), false);
  assert.equal(resolveAgendaItemEnd({ starts_at: 'inválido' }), null);
});

test('resolveAgendaTimelineStatuses: hoje risca o passado e destaca o primeiro pendente; dia passado não tem próximo', async () => {
  const { resolveAgendaTimelineStatuses } = await import('./simplifiedAgendaCalendar.js');
  const now = new Date(2026, 9, 23, 11, 0);
  const items = [
    { starts_at: new Date(2026, 9, 23, 9, 0).toISOString(), status: 'completed' },
    { starts_at: new Date(2026, 9, 23, 10, 0).toISOString(), status: 'open' },
    { starts_at: new Date(2026, 9, 23, 12, 0).toISOString(), status: 'open' },
    { starts_at: new Date(2026, 9, 23, 15, 30).toISOString(), status: 'open' },
  ];
  assert.deepEqual(resolveAgendaTimelineStatuses(items, { now, dayKey: '2026-10-23' }), ['done', 'done', 'next', 'default']);
  // Item de dia inteiro de hoje continua pendente até o fim do dia.
  const allDay = [{ starts_at: new Date(2026, 9, 23, 0, 0).toISOString(), ends_at: null, is_all_day: true, status: 'open' }];
  assert.deepEqual(resolveAgendaTimelineStatuses(allDay, { now, dayKey: '2026-10-23' }), ['next']);
  assert.deepEqual(resolveAgendaTimelineStatuses(items, { now, dayKey: '2026-10-24' }), ['done', 'next', 'default', 'default']);
  assert.deepEqual(resolveAgendaTimelineStatuses(items, { now, dayKey: '2026-10-22' }), ['done', 'default', 'default', 'default']);
});

test('buildTomorrowSummary: conta compromissos e contas de amanhã, ou null fora do mês carregado', async () => {
  const { buildTomorrowSummary } = await import('./simplifiedAgendaCalendar.js');
  const now = new Date(2026, 9, 23, 21, 40);
  const grouped = new Map([
    ['2026-10-24', [{ item_type: 'meeting' }, { item_type: 'appointment' }, { item_type: 'task' }, { item_type: 'reminder' }, { item_type: 'receivable' }]],
  ]);
  // Tarefa, lembrete e recebimento não contam como compromisso nem como conta.
  assert.equal(buildTomorrowSummary(grouped, { now, loadedMonth: { year: 2026, month: 9 } }), 'Amanhã você tem 2 compromissos e nenhuma conta vencendo.');
  grouped.set('2026-10-24', [{ item_type: 'meeting' }, { item_type: 'payment_due' }, { item_type: 'payment_due' }]);
  assert.equal(buildTomorrowSummary(grouped, { now, loadedMonth: { year: 2026, month: 9 } }), 'Amanhã você tem 1 compromisso e 2 contas vencendo.');
  grouped.set('2026-10-24', [{ item_type: 'payment_due' }]);
  assert.equal(buildTomorrowSummary(grouped, { now, loadedMonth: { year: 2026, month: 9 } }), 'Amanhã você não tem compromissos, mas tem 1 conta vencendo.');
  assert.equal(buildTomorrowSummary(new Map(), { now, loadedMonth: { year: 2026, month: 9 } }), 'Amanhã você não tem compromissos nem contas vencendo.');
  assert.equal(buildTomorrowSummary(grouped, { now: new Date(2026, 9, 31, 10), loadedMonth: { year: 2026, month: 9 } }), null);
});

test('formatReminderPromptWhen: dia da semana, data e horário; dia inteiro sem horário', () => {
  const startsAt = new Date(2026, 9, 22, 8, 30, 0, 0).toISOString();
  assert.equal(formatReminderPromptWhen({ starts_at: startsAt }), 'quinta, 22/10 às 08:30');
  assert.equal(formatReminderPromptWhen({ starts_at: startsAt, is_all_day: true }), 'quinta, 22/10');
  assert.equal(formatReminderPromptWhen({ starts_at: startsAt, has_explicit_time: false }), 'quinta, 22/10');
  assert.equal(formatReminderPromptWhen({ starts_at: null }), '');
});
