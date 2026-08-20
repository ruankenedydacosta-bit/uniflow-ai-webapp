import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = () => readFile(
  new URL('../../../supabase/migrations/20260820105933_044_uni_updates.sql', import.meta.url),
  'utf8',
);

// ============================================================================
// UNIUPD1 -- migration das tabelas updates/user_seen_updates. Cobertura
// estrutural do SQL (mesmo padrão já usado por notificationsMigration.test.js):
// RLS, isolamento por usuário, grants mínimos, sem alterar nenhuma
// migration antiga.
// ============================================================================

test('tabela updates tem as colunas mínimas exigidas pela UNIUPD1', async () => {
  const sql = await migration();
  assert.match(sql, /create table public\.updates \(/);
  for (const column of ['id', 'version', 'title', 'description', 'features', 'created_at', 'active']) {
    assert.match(sql, new RegExp(`\\b${column}\\b`), `coluna ${column} ausente`);
  }
});

test('version segue semver (MAJOR.MINOR.PATCH) via check constraint', async () => {
  const sql = await migration();
  assert.match(
    sql,
    /constraint updates_version_format_check check \(\s*\n\s*version ~ '\^\[0-9\]\+\\\.\[0-9\]\+\\\.\[0-9\]\+\$'/,
  );
});

test('version é única -- nunca duas novidades com o mesmo número', async () => {
  const sql = await migration();
  assert.match(sql, /version text not null unique,/);
});

test('RLS habilitado em updates, policy de select restrita a active = true -- conteúdo inativo nunca aparece', async () => {
  const sql = await migration();
  assert.match(sql, /alter table public\.updates enable row level security;/);
  assert.match(
    sql,
    /create policy updates_select_active\s*\n\s*on public\.updates\s*\n\s*for select\s*\n\s*to authenticated\s*\n\s*using \(active = true\);/,
  );
});

test('nenhuma policy de insert/update/delete em updates -- o cliente NUNCA edita o changelog', async () => {
  const sql = await migration();
  const updatesBlock = sql.slice(sql.indexOf('create table public.updates'), sql.indexOf('create table public.user_seen_updates'));
  assert.doesNotMatch(updatesBlock, /for insert/);
  assert.doesNotMatch(updatesBlock, /for update/);
  assert.doesNotMatch(updatesBlock, /for delete/);
  assert.match(updatesBlock, /grant select on table public\.updates to authenticated;/);
  assert.doesNotMatch(updatesBlock, /grant insert|grant update|grant delete/);
});

test('tabela user_seen_updates tem chave composta (user_id, update_id) -- "visto" é um fato binário por par', async () => {
  const sql = await migration();
  assert.match(sql, /create table public\.user_seen_updates \(/);
  assert.match(sql, /primary key \(user_id, update_id\)/);
});

test('user_id referencia auth.users com cascade -- mesmo padrão de notifications', async () => {
  const sql = await migration();
  assert.match(sql, /user_id uuid not null references auth\.users\(id\) on delete cascade,/);
  assert.match(sql, /update_id uuid not null references public\.updates\(id\) on delete cascade,/);
});

test('RLS habilitado em user_seen_updates, select e insert restritos ao próprio usuário -- isolamento por usuário', async () => {
  const sql = await migration();
  assert.match(sql, /alter table public\.user_seen_updates enable row level security;/);
  assert.match(
    sql,
    /create policy user_seen_updates_select_own\s*\n\s*on public\.user_seen_updates\s*\n\s*for select\s*\n\s*to authenticated\s*\n\s*using \(\(select auth\.uid\(\)\) = user_id\);/,
  );
  assert.match(
    sql,
    /create policy user_seen_updates_insert_own\s*\n\s*on public\.user_seen_updates\s*\n\s*for insert\s*\n\s*to authenticated\s*\n\s*with check \(\(select auth\.uid\(\)\) = user_id\);/,
  );
});

test('nenhuma policy de update/delete em user_seen_updates -- "visto" nunca é desfeito ou editado pelo cliente', async () => {
  const sql = await migration();
  const seenBlock = sql.slice(sql.indexOf('create table public.user_seen_updates'));
  assert.doesNotMatch(seenBlock, /for update/);
  assert.doesNotMatch(seenBlock, /for delete/);
});

test('grants mínimos em ambas as tabelas -- revoke all antes dos grants, privilégio mínimo', async () => {
  const sql = await migration();
  const updatesRevoke = sql.indexOf('revoke all on table public.updates from anon, authenticated;');
  const updatesGrant = sql.indexOf('grant select on table public.updates to authenticated;');
  assert.ok(updatesRevoke >= 0 && updatesGrant > updatesRevoke, 'revoke deve vir antes dos grants em updates');

  const seenRevoke = sql.indexOf('revoke all on table public.user_seen_updates from anon, authenticated;');
  const seenGrantInsert = sql.indexOf('grant insert (user_id, update_id) on table public.user_seen_updates to authenticated;');
  assert.ok(seenRevoke >= 0 && seenGrantInsert > seenRevoke, 'revoke deve vir antes dos grants em user_seen_updates');
});

test('índices cobrem changelog ativo por data (parcial) e busca de "vistos" por usuário', async () => {
  const sql = await migration();
  assert.match(
    sql,
    /create index updates_active_created_idx\s*\n\s*on public\.updates \(created_at desc\)\s*\n\s*where active = true;/,
  );
  assert.match(
    sql,
    /create index user_seen_updates_user_idx\s*\n\s*on public\.user_seen_updates \(user_id\);/,
  );
});

test('migration começa com begin e termina com commit -- atômica, mesmo padrão das demais migrations', async () => {
  const sql = await migration();
  assert.match(sql.trim(), /^begin;/);
  assert.match(sql.trim(), /commit;$/);
});
