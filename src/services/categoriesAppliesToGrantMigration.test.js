import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../../supabase/migrations/20261008175014_057_categories_applies_to_insert_grant.sql',
  import.meta.url,
);

test('migration 057 libera só o INSERT de applies_to, sem relaxar RLS nem abrir a tabela', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const statements = sql.replace(/--.*$/gm, '');

  assert.match(statements, /grant insert \(applies_to\) on public\.categories to authenticated;/i);
  assert.doesNotMatch(statements, /grant (all|update|insert on table)/i);
  assert.doesNotMatch(statements, /to (anon|public)\b/i);
  assert.doesNotMatch(statements, /row level security/i);
  assert.doesNotMatch(statements, /policy/i);
});

test('o app manda applies_to ao criar categoria: sem o grant da 057, o INSERT inteiro é recusado com 42501', async () => {
  const hook = await readFile(new URL('../hooks/useCategories.js', import.meta.url), 'utf8');
  const service = await readFile(new URL('./categoryService.js', import.meta.url), 'utf8');
  assert.match(hook, /\{ \.\.\.values, applies_to: context \}/);
  const createBody = service.slice(
    service.indexOf('export async function createCategory'),
    service.indexOf('export async function updateCategory'),
  );
  assert.match(createBody, /'applies_to',/);
});
