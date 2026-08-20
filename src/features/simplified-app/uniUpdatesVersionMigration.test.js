import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = () => readFile(
  new URL('../../../supabase/migrations/20260820120000_046_uni_updates_enforce_version_increment.sql', import.meta.url),
  'utf8',
);

// ============================================================================
// UNIUPD2 -- migration que torna o versionamento semântico obrigatório: o
// banco (nunca o cliente) decide a versão de cada nova novidade, via
// trigger BEFORE INSERT. Cobertura estrutural do SQL (mesmo padrão já
// usado por uniUpdatesMigration.test.js).
// ============================================================================

test('uni_updates_next_version calcula PATCH até 9, depois vira MINOR, depois MAJOR (odômetro)', async () => {
  const sql = await migration();
  assert.match(sql, /create or replace function public\.uni_updates_next_version\(current_version text\)/);
  assert.match(sql, /if patch < 9 then\s*\n\s*patch := patch \+ 1;/);
  assert.match(sql, /elsif minor < 9 then\s*\n\s*minor := minor \+ 1;\s*\n\s*patch := 0;/);
  assert.match(sql, /else\s*\n\s*major := major \+ 1;\s*\n\s*minor := 0;\s*\n\s*patch := 0;/);
});

test('uni_updates_next_version faz parse numérico (split_part + cast), nunca comparação de string', async () => {
  const sql = await migration();
  const fnBody = sql.slice(
    sql.indexOf('create or replace function public.uni_updates_next_version'),
    sql.indexOf('comment on function public.uni_updates_next_version'),
  );
  assert.match(fnBody, /split_part\(current_version, '\.', 1\)::int/);
  assert.match(fnBody, /split_part\(current_version, '\.', 2\)::int/);
  assert.match(fnBody, /split_part\(current_version, '\.', 3\)::int/);
});

test('trigger BEFORE INSERT sempre sobrescreve NEW.version -- quem publica nunca escolhe a versão manualmente', async () => {
  const sql = await migration();
  assert.match(sql, /create or replace function public\.uni_updates_set_next_version\(\)\s*\nreturns trigger/);
  assert.match(sql, /new\.version := public\.uni_updates_next_version\(current_max\);/);
  assert.match(
    sql,
    /create trigger updates_set_next_version\s*\n\s*before insert on public\.updates\s*\n\s*for each row\s*\n\s*execute function public\.uni_updates_set_next_version\(\);/,
  );
});

test('primeira novidade publicada (tabela vazia) mantém a versão informada -- não há versão anterior da qual partir', async () => {
  const sql = await migration();
  const fnBody = sql.slice(
    sql.indexOf('create or replace function public.uni_updates_set_next_version'),
    sql.indexOf('comment on function public.uni_updates_set_next_version'),
  );
  assert.match(fnBody, /if current_max is null then\s*\n\s*return new;\s*\n\s*end if;/);
});

test('busca a versão máxima existente ordenando numericamente (major/minor/patch desc), nunca por ordenação de string', async () => {
  const sql = await migration();
  const fnBody = sql.slice(
    sql.indexOf('create or replace function public.uni_updates_set_next_version'),
    sql.indexOf('comment on function public.uni_updates_set_next_version'),
  );
  assert.match(fnBody, /order by\s*\n\s*split_part\(version, '\.', 1\)::int desc,\s*\n\s*split_part\(version, '\.', 2\)::int desc,\s*\n\s*split_part\(version, '\.', 3\)::int desc\s*\n\s*limit 1;/);
});

test('funções fixam search_path -- mesma prática defensiva, evita search_path mutável', async () => {
  const sql = await migration();
  const occurrences = sql.match(/set search_path = public, pg_temp/g) ?? [];
  assert.equal(occurrences.length, 2, 'as duas funções novas devem fixar search_path');
});

test('nenhuma função nova é SECURITY DEFINER -- privilégio mínimo, mesmo contexto do INSERT que já é restrito a migração/service role', async () => {
  const sql = await migration();
  assert.doesNotMatch(sql, /security definer/i);
});

test('migration começa com begin e termina com commit -- mesmo padrão das demais migrations', async () => {
  const sql = await migration();
  assert.match(sql.trim(), /^begin;/);
  assert.match(sql.trim(), /commit;$/);
});
