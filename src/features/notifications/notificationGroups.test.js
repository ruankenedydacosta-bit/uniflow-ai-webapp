import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatNotificationTime,
  groupNotificationsByDay,
  resolveNotificationDayLabel,
} from './notificationGroups.js';

const NOW = new Date(2026, 9, 7, 21, 40);

test('rótulo do dia: Hoje, Ontem e depois a data curta', () => {
  assert.equal(resolveNotificationDayLabel(new Date(2026, 9, 7, 8, 0).toISOString(), NOW), 'Hoje');
  assert.equal(resolveNotificationDayLabel(new Date(2026, 9, 6, 23, 59).toISOString(), NOW), 'Ontem');
  assert.equal(resolveNotificationDayLabel(new Date(2026, 9, 2, 10, 0).toISOString(), NOW), '02/10');
  assert.equal(resolveNotificationDayLabel('inválida', NOW), 'Sem data');
});

test('hora do item sempre em HH:MM, vazia quando a data não existe', () => {
  assert.equal(formatNotificationTime(new Date(2026, 9, 7, 9, 5).toISOString()), '09:05');
  assert.equal(formatNotificationTime(null), '');
  assert.equal(formatNotificationTime('inválida'), '');
});

test('agrupa por dia preservando a ordem recebida (mais recente primeiro)', () => {
  const groups = groupNotificationsByDay([
    { id: 'a', created_at: new Date(2026, 9, 7, 21, 40).toISOString() },
    { id: 'b', created_at: new Date(2026, 9, 7, 12, 15).toISOString() },
    { id: 'c', created_at: new Date(2026, 9, 6, 9, 30).toISOString() },
    { id: 'd', created_at: new Date(2026, 9, 1, 9, 30).toISOString() },
  ], NOW);
  assert.deepEqual(groups.map((group) => group.label), ['Hoje', 'Ontem', '01/10']);
  assert.deepEqual(groups[0].items.map((item) => item.id), ['a', 'b']);
  assert.deepEqual(groups[1].items.map((item) => item.id), ['c']);
});

test('lista vazia vira zero grupos; sem data cai num grupo próprio', () => {
  assert.deepEqual(groupNotificationsByDay([], NOW), []);
  const groups = groupNotificationsByDay([{ id: 'x', created_at: null }], NOW);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, 'Sem data');
});
