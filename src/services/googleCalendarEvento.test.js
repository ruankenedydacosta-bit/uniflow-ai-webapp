// Épico #98 (#100): item da agenda -> evento do Google Agenda.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  corpoDeInsercao,
  dataLocal,
  ehDiaInteiro,
  idDoEventoGoogle,
  montarEventoGoogle,
  somarDias,
} from '../../supabase/functions/_shared/googleCalendar/eventoGoogle.js';

const ITEM = Object.freeze({
  id: '0f8fad5b-d9cb-469f-a165-70867728950e',
  workspace_id: '11111111-1111-4111-8111-111111111111',
  item_type: 'meeting',
  title: 'Reunião com cliente',
  description: null,
  location: null,
  starts_at: '2026-10-15T17:00:00.000Z',
  ends_at: null,
  is_all_day: false,
  has_explicit_time: true,
  status: 'scheduled',
});

test('pagamento perto da meia-noite cai no dia local certo, de dia inteiro', () => {
  // 23:30 de 09/10 em São Paulo é 02:30 de 10/10 em UTC.
  const evento = montarEventoGoogle({ ...ITEM, item_type: 'payment_due', starts_at: '2026-10-10T02:30:00.000Z' });
  assert.deepEqual(evento.start, { date: '2026-10-09', dateTime: null, timeZone: null });
  assert.deepEqual(evento.end, { date: '2026-10-10', dateTime: null, timeZone: null });
  assert.equal(evento.transparency, 'transparent');

  // Meia-noite local (como o formulário grava o dia inteiro) é 03:00 UTC.
  const recebimento = montarEventoGoogle({ ...ITEM, item_type: 'receivable', starts_at: '2026-10-20T03:00:00.000Z' });
  assert.equal(recebimento.start.date, '2026-10-20');
  assert.equal(recebimento.end.date, '2026-10-21');
});

test('vai como dia inteiro: is_all_day, sem horário explícito e pagamento', () => {
  assert.equal(ehDiaInteiro({ ...ITEM, is_all_day: true }), true);
  assert.equal(ehDiaInteiro({ ...ITEM, has_explicit_time: false }), true);
  assert.equal(ehDiaInteiro({ ...ITEM, item_type: 'payment_due' }), true);
  assert.equal(ehDiaInteiro({ ...ITEM, item_type: 'receivable' }), true);
  assert.equal(ehDiaInteiro(ITEM), false);
});

test('dia inteiro de vários dias usa a data local de ends_at como último dia', () => {
  const evento = montarEventoGoogle({
    ...ITEM,
    is_all_day: true,
    starts_at: '2026-12-24T03:00:00.000Z',
    ends_at: '2026-12-26T03:00:00.000Z',
  });
  assert.equal(evento.start.date, '2026-12-24');
  assert.equal(evento.end.date, '2026-12-27', 'end.date do Google é exclusivo');
});

test('com horário e sem fim vai com 30 minutos, no fuso de São Paulo', () => {
  const evento = montarEventoGoogle(ITEM);
  assert.deepEqual(evento.start, { dateTime: '2026-10-15T17:00:00.000Z', timeZone: 'America/Sao_Paulo', date: null });
  assert.deepEqual(evento.end, { dateTime: '2026-10-15T17:30:00.000Z', timeZone: 'America/Sao_Paulo', date: null });
  assert.equal(evento.transparency, 'opaque');

  const comFim = montarEventoGoogle({ ...ITEM, ends_at: '2026-10-15T19:00:00.000Z' });
  assert.equal(comFim.end.dateTime, '2026-10-15T19:00:00.000Z');
});

test('todo evento leva a marca do item e do espaço, e campo vazio vai como texto vazio', () => {
  const evento = montarEventoGoogle(ITEM);
  assert.deepEqual(evento.extendedProperties, {
    private: { uniflow_item_id: ITEM.id, uniflow_workspace_id: ITEM.workspace_id },
  });
  assert.equal(evento.summary, 'Reunião com cliente');
  assert.equal(evento.description, '', 'PATCH com texto vazio limpa a descrição antiga no Google');
  assert.equal(evento.location, '');
  assert.equal(evento.status, 'confirmed', 'reativa evento cancelado no Google');
});

test('id do evento: derivado do item, só a-v e 0-9, sempre o mesmo', () => {
  const id = idDoEventoGoogle(ITEM.id);
  assert.equal(id, 'uf0f8fad5bd9cb469fa16570867728950e');
  assert.match(id, /^[a-v0-9]{5,1024}$/);
  assert.equal(idDoEventoGoogle(ITEM.id.toUpperCase()), id);
  assert.equal(idDoEventoGoogle('nao-e-uuid'), null);
});

test('insert leva o id e não leva os campos null de start e end', () => {
  const corpo = corpoDeInsercao(montarEventoGoogle(ITEM), 'ufabc');
  assert.equal(corpo.id, 'ufabc');
  assert.deepEqual(corpo.start, { dateTime: '2026-10-15T17:00:00.000Z', timeZone: 'America/Sao_Paulo' });
  const diaInteiro = corpoDeInsercao(montarEventoGoogle({ ...ITEM, is_all_day: true }), 'ufabc');
  assert.deepEqual(diaInteiro.start, { date: '2026-10-15' });
});

test('datas: fuso e virada de mês', () => {
  assert.equal(dataLocal('2026-11-01T02:59:00.000Z'), '2026-10-31');
  assert.equal(dataLocal('2026-11-01T03:00:00.000Z'), '2026-11-01');
  assert.equal(dataLocal('inválida'), null);
  assert.equal(somarDias('2026-12-31', 1), '2027-01-01');
  assert.equal(somarDias('2028-02-28', 1), '2028-02-29');
});
