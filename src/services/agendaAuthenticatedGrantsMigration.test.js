import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../../supabase/migrations/20260811151023_033_agenda_items_authenticated_grants.sql',
  import.meta.url,
);

test('migration 033 libera CRUD autenticado sem relaxar RLS ou anon', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /revoke all on table public\.agenda_items from anon/i);
  assert.match(
    sql,
    /grant select, insert, update, delete\s+on table public\.agenda_items\s+to authenticated/i,
  );
  assert.doesNotMatch(sql, /disable row level security/i);
  assert.doesNotMatch(sql, /to public/i);
  assert.doesNotMatch(sql, /using\s*\(\s*true\s*\)/i);
  assert.doesNotMatch(sql, /with check\s*\(\s*true\s*\)/i);
});
