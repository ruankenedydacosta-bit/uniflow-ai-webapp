import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAgendaItemPresentation,
  formatAgendaDateChip,
  formatAgendaTimeChip,
} from './agendaItemPresentation.js';

function localIso(year, month, day, hours = 0, minutes = 0) {
  return new Date(year, month - 1, day, hours, minutes, 0, 0).toISOString();
}

test('card apresenta data pt-BR e horario normalizado sem ler o titulo', () => {
  const item = {
    title: 'Reunião empresarial',
    starts_at: localIso(2026, 8, 11, 10),
    ends_at: null,
    is_all_day: false,
    has_explicit_time: true,
  };
  assert.equal(formatAgendaDateChip(item.starts_at), '11 AGO');
  assert.equal(formatAgendaTimeChip(item), '10:00');
  assert.deepEqual(buildAgendaItemPresentation(item), {
    title: 'Reunião empresarial',
    date: '2026-08-11',
    time: '10:00',
    description: null,
    allDay: false,
    hasExplicitTime: true,
    dateLabel: '11 AGO',
    timeLabel: '10:00',
  });
});

test('card distingue sem horario de meia-noite explicita', () => {
  const startsAt = localIso(2026, 8, 11, 0, 0);
  const withoutTime = {
    title: 'Reunião empresarial', starts_at: startsAt, is_all_day: false, has_explicit_time: false,
  };
  const midnight = { ...withoutTime, has_explicit_time: true };
  assert.equal(formatAgendaTimeChip(withoutTime), 'Sem horário');
  assert.equal(buildAgendaItemPresentation(withoutTime).time, null);
  assert.equal(formatAgendaTimeChip(midnight), '00:00');
  assert.equal(buildAgendaItemPresentation(midnight).time, '00:00');
});

test('dia inteiro tem precedencia mesmo para registro legado com default true', () => {
  const item = {
    title: 'Reunião empresarial',
    starts_at: localIso(2026, 12, 25),
    is_all_day: true,
    has_explicit_time: true,
  };
  const view = buildAgendaItemPresentation(item);
  assert.equal(view.dateLabel, '25 DEZ');
  assert.equal(view.timeLabel, 'Dia inteiro');
  assert.equal(view.time, null);
  assert.equal(view.hasExplicitTime, false);
});

test('registro legado sem coluna continua exibindo o horario historico', () => {
  const item = {
    title: 'Legado', starts_at: localIso(2026, 9, 3, 15, 30), is_all_day: false,
  };
  assert.equal(formatAgendaDateChip(item.starts_at), '03 SET');
  assert.equal(formatAgendaTimeChip(item), '15:30');
});
