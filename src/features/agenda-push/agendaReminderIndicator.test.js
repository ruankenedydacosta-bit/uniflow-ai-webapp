import assert from 'node:assert/strict';
import test from 'node:test';
import {
  indexReminderStatesByItemId,
  REMINDER_OFFSET_LABELS,
  resolveReminderIndicator,
} from './agendaReminderIndicator.js';

// ============================================================================
// AGPUSH2 -- logica pura do indicador de lembrete no card. Sem DOM, sem
// React: da pra testar o comportamento inteiro diretamente.
// ============================================================================

test('30 minutos vira o indicador "30 min antes"', () => {
  assert.deepEqual(
    resolveReminderIndicator({ reminder_offset_minutes: 30 }),
    { offsetMinutes: 30, label: '30 min antes' },
  );
});

test('60 minutos vira o indicador "1h antes"', () => {
  assert.deepEqual(
    resolveReminderIndicator({ reminder_offset_minutes: 60 }),
    { offsetMinutes: 60, label: '1h antes' },
  );
});

test('"Nao precisa" (decisao tomada, sem offset) NAO mostra indicador nenhum no card', () => {
  assert.equal(
    resolveReminderIndicator({
      reminder_offset_minutes: null,
      reminder_decision_at: '2026-08-19T16:00:00.000Z',
    }),
    null,
  );
});

test('compromisso sem linha em agenda_push_reminders nao mostra indicador', () => {
  assert.equal(resolveReminderIndicator(undefined), null);
  assert.equal(resolveReminderIndicator(null), null);
  assert.equal(resolveReminderIndicator({}), null);
});

test('offset desconhecido nunca inventa um rotulo -- a UI so conhece 30 e 60', () => {
  assert.equal(resolveReminderIndicator({ reminder_offset_minutes: 45 }), null);
  assert.equal(resolveReminderIndicator({ reminder_offset_minutes: '30' }), null);
});

test('os rotulos batem exatamente com os textos das actions do push (30 min antes / 1h antes)', () => {
  assert.deepEqual(REMINDER_OFFSET_LABELS, { 30: '30 min antes', 60: '1h antes' });
});

test('indexReminderStatesByItemId permite busca O(1) por compromisso', () => {
  const index = indexReminderStatesByItemId([
    { agenda_item_id: 'a', reminder_offset_minutes: 30 },
    { agenda_item_id: 'b', reminder_offset_minutes: 60 },
  ]);
  assert.equal(index.get('a').reminder_offset_minutes, 30);
  assert.equal(index.get('b').reminder_offset_minutes, 60);
  assert.equal(index.get('inexistente'), undefined);
});

test('indexReminderStatesByItemId ignora linhas sem agenda_item_id utilizavel e nunca lanca', () => {
  const index = indexReminderStatesByItemId([
    null,
    { reminder_offset_minutes: 30 },
    { agenda_item_id: 42 },
    { agenda_item_id: 'ok', reminder_offset_minutes: 60 },
  ]);
  assert.equal(index.size, 1);
  assert.equal(index.get('ok').reminder_offset_minutes, 60);
});

test('indexReminderStatesByItemId aceita lista ausente', () => {
  assert.equal(indexReminderStatesByItemId(undefined).size, 0);
});
