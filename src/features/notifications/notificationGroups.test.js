import assert from 'node:assert/strict';
import test from 'node:test';
import {
  groupNotificationsByDay,
  resolveNotificationDayLabel,
} from './notificationGroups.js';

const NOW = new Date(2026, 9, 7, 21, 40);

// Tela 13 v2: três grupos só. A data das antigas fica na própria linha.
test('rótulo do dia: Hoje, Ontem e Anteriores', () => {
  assert.equal(resolveNotificationDayLabel(new Date(2026, 9, 7, 8, 0).toISOString(), NOW), 'Hoje');
  assert.equal(resolveNotificationDayLabel(new Date(2026, 9, 6, 23, 59).toISOString(), NOW), 'Ontem');
  assert.equal(resolveNotificationDayLabel(new Date(2026, 9, 2, 10, 0).toISOString(), NOW), 'Anteriores');
  assert.equal(resolveNotificationDayLabel('inválida', NOW), 'Anteriores');
});

test('agrupa por dia preservando a ordem recebida (mais recente primeiro)', () => {
  const groups = groupNotificationsByDay([
    { id: 'a', created_at: new Date(2026, 9, 7, 21, 40).toISOString() },
    { id: 'b', created_at: new Date(2026, 9, 7, 12, 15).toISOString() },
    { id: 'c', created_at: new Date(2026, 9, 6, 9, 30).toISOString() },
    { id: 'd', created_at: new Date(2026, 9, 1, 9, 30).toISOString() },
    { id: 'e', created_at: new Date(2026, 8, 20, 9, 30).toISOString() },
  ], NOW);
  assert.deepEqual(groups.map((group) => group.label), ['Hoje', 'Ontem', 'Anteriores']);
  assert.deepEqual(groups[2].items.map((item) => item.id), ['d', 'e']);
  assert.deepEqual(groups[0].items.map((item) => item.id), ['a', 'b']);
  assert.deepEqual(groups[1].items.map((item) => item.id), ['c']);
});

test('lista vazia vira zero grupos; sem data cai em Anteriores', () => {
  assert.deepEqual(groupNotificationsByDay([], NOW), []);
  const groups = groupNotificationsByDay([{ id: 'x', created_at: null }], NOW);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, 'Anteriores');
});
