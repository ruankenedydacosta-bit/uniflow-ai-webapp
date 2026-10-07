import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAgendaItemDetail,
  buildHomeAgendaRange,
  buildHomeTimeline,
  resolveAgendaItemTone,
} from './simplifiedHomeAgenda.js';

// 23/10/2026 (quinta) às 21:40, hora local.
const NOW = new Date(2026, 9, 23, 21, 40, 0, 0);

function item(overrides) {
  return {
    id: overrides.id,
    title: overrides.title ?? 'Item',
    item_type: overrides.item_type ?? 'appointment',
    starts_at: overrides.starts_at,
    ends_at: overrides.ends_at ?? null,
    status: overrides.status ?? 'open',
    description: overrides.description ?? null,
    location: overrides.location ?? null,
  };
}

test('buildHomeAgendaRange cobre de hoje 00:00 até amanhã 23:59:59 em hora local', () => {
  const range = buildHomeAgendaRange(NOW);
  assert.equal(new Date(range.startsFrom).getTime(), new Date(2026, 9, 23, 0, 0, 0, 0).getTime());
  assert.equal(new Date(range.startsTo).getTime(), new Date(2026, 9, 24, 23, 59, 59, 999).getTime());
});

test('com itens hoje, a timeline é "Hoje": passado riscado, o próximo em destaque, ordem por horário', () => {
  const timeline = buildHomeTimeline([
    item({ id: 'c', starts_at: new Date(2026, 9, 23, 22, 30).toISOString(), title: 'Depois' }),
    item({ id: 'a', starts_at: new Date(2026, 9, 23, 9, 0).toISOString(), title: 'Manhã' }),
    item({ id: 'b', starts_at: new Date(2026, 9, 23, 22, 0).toISOString(), title: 'Próximo', item_type: 'task' }),
    item({ id: 'd', starts_at: new Date(2026, 9, 24, 8, 30).toISOString(), title: 'Amanhã' }),
  ], NOW);

  assert.equal(timeline.title, 'Hoje');
  assert.deepEqual(timeline.items.map((entry) => entry.id), ['a', 'b', 'c']);
  assert.deepEqual(timeline.items.map((entry) => entry.status), ['done', 'next', 'default']);
  assert.deepEqual(timeline.items.map((entry) => entry.time), ['09:00', '22:00', '22:30']);
  assert.equal(timeline.items[1].tone, 'violet');
});

test('sem nada hoje, mostra "Amanhã" com o primeiro item em destaque e nenhum riscado', () => {
  const timeline = buildHomeTimeline([
    item({ id: 'x', starts_at: new Date(2026, 9, 24, 8, 30).toISOString() }),
    item({ id: 'y', starts_at: new Date(2026, 9, 24, 19, 0).toISOString(), item_type: 'reminder' }),
  ], NOW);

  assert.equal(timeline.title, 'Amanhã');
  assert.deepEqual(timeline.items.map((entry) => entry.status), ['next', 'default']);
  assert.equal(timeline.items[1].tone, 'green');
});

test('sem itens hoje nem amanhã, devolve "Hoje" vazio', () => {
  assert.deepEqual(buildHomeTimeline([], NOW), { title: 'Hoje', items: [] });
  assert.deepEqual(buildHomeTimeline([item({ id: 'z', starts_at: 'inválido' })], NOW).items, []);
});

test('item concluído ou cancelado é riscado mesmo que ainda esteja no futuro', () => {
  const timeline = buildHomeTimeline([
    item({ id: 'a', starts_at: new Date(2026, 9, 23, 23, 0).toISOString(), status: 'completed' }),
    item({ id: 'b', starts_at: new Date(2026, 9, 23, 23, 30).toISOString(), status: 'cancelled' }),
    item({ id: 'c', starts_at: new Date(2026, 9, 23, 23, 45).toISOString() }),
  ], NOW);
  assert.deepEqual(timeline.items.map((entry) => entry.status), ['done', 'done', 'next']);
});

test('item de dia inteiro ou sem horário de hoje fica pendente até o fim do dia', () => {
  const midnight = new Date(2026, 9, 23, 0, 0).toISOString();
  const timeline = buildHomeTimeline([
    item({ id: 'a', starts_at: midnight, title: 'Dia inteiro' }),
    item({ id: 'b', starts_at: midnight, title: 'Sem horário' }),
  ].map((entry, index) => (index === 0
    ? { ...entry, is_all_day: true }
    : { ...entry, has_explicit_time: false })), NOW);
  assert.deepEqual(timeline.items.map((entry) => entry.status), ['next', 'default']);
  assert.deepEqual(timeline.items.map((entry) => entry.time), ['Dia inteiro', 'Sem horário']);
});

test('detalhe junta observação e local com " · ", usando só a primeira linha da observação', () => {
  assert.equal(buildAgendaItemDetail({ description: 'Dra. Paula\nlevar exames', location: 'Av. Paulista' }), 'Dra. Paula · Av. Paulista');
  assert.equal(buildAgendaItemDetail({ description: '', location: 'Av. Paulista' }), 'Av. Paulista');
  assert.equal(buildAgendaItemDetail({}), '');
});

test('tom por tipo: tarefa violeta, lembrete verde, o resto azul', () => {
  assert.equal(resolveAgendaItemTone({ item_type: 'task' }), 'violet');
  assert.equal(resolveAgendaItemTone({ item_type: 'reminder' }), 'green');
  assert.equal(resolveAgendaItemTone({ item_type: 'payment_due' }), 'blue');
  assert.equal(resolveAgendaItemTone(null), 'blue');
});
