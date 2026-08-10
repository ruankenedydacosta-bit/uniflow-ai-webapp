import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = () => readFile(
  new URL('../../supabase/migrations/20260810003100_031_agenda_explicit_time.sql', import.meta.url),
  'utf8',
);

test('migration 031 adiciona somente o discriminador backward-compatible', async () => {
  const sql = await migration();
  assert.match(sql, /add column has_explicit_time boolean not null default true/i);
  assert.doesNotMatch(sql, /update\s+public\.agenda_items/i);
  assert.doesNotMatch(sql, /drop\s+(?:column|table|policy)/i);
  assert.doesNotMatch(sql, /create\s+policy|alter\s+policy/i);
});

test('migration documenta precedencia de dia inteiro e ancora tecnica', async () => {
  const sql = await migration();
  assert.match(sql, /ancora tecnica/i);
  assert.match(sql, /is_all_day tem precedencia/i);
  assert.match(sql, /Sem horario/i);
});
