import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = () => readFile(
  new URL('../../../supabase/migrations/20260820110500_045_uni_updates_seed_v1.sql', import.meta.url),
  'utf8',
);

// ============================================================================
// UNIUPD1 -- seed da primeira entrada do changelog (versão 1.0.0), para que
// a Central de Novidades nunca comece vazia.
// ============================================================================

test('seed insere a versão 1.0.0 em public.updates', async () => {
  const sql = await migration();
  assert.match(sql, /insert into public\.updates \(/);
  assert.match(sql, /'1\.0\.0',/);
});

test('seed marca a entrada como active -- aparece no histórico imediatamente', async () => {
  const sql = await migration();
  assert.match(sql, /true,\s*\n\s*'2026-07-01T00:00:00Z'/);
});

test('created_at do seed é anterior a qualquer usuário existente -- nunca "now()" (evita destaque falso para usuários já cadastrados)', async () => {
  const sql = await migration();
  assert.doesNotMatch(sql, /,\s*now\(\)\s*\n?\);/);
});

test('migration começa com begin e termina com commit', async () => {
  const sql = await migration();
  assert.match(sql.trim(), /^begin;/);
  assert.match(sql.trim(), /commit;$/);
});
