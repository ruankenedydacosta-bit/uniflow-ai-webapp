import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = () => readFile(
  new URL('../../supabase/migrations/20260808003000_030_agenda_item_idempotency.sql', import.meta.url),
  'utf8',
);

test('migration adiciona UUID e índice único parcial por workspace', async () => {
  const sql = await migration();
  assert.match(sql, /add column client_operation_id uuid/);
  assert.match(
    sql,
    /create unique index agenda_items_workspace_client_operation_uidx\s+on public\.agenda_items \(workspace_id, client_operation_id\)\s+where client_operation_id is not null/,
  );
});

test('migration torna client_operation_id imutável sem alterar RLS', async () => {
  const sql = await migration();
  assert.match(
    sql,
    /if new\.client_operation_id is distinct from old\.client_operation_id then[\s\S]*?raise exception 'agenda_items: client_operation_id cannot be changed after creation'/,
  );
  assert.doesNotMatch(sql, /create policy|drop policy|alter policy/);
});
