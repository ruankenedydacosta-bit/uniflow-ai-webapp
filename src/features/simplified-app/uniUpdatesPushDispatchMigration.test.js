import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = () => readFile(
  new URL('../../../supabase/migrations/20260820121000_047_uni_updates_push_dispatch.sql', import.meta.url),
  'utf8',
);

// ============================================================================
// UNIUPD3 -- Web Push real para a Central de Novidades (worker server-side,
// mesmo padrão de AGPUSH1/migration 043). Cobertura estrutural do SQL.
// ============================================================================

test('uni_update_push_dispatches é a idempotência do envio -- chave composta própria, nunca reaproveita user_seen_updates', async () => {
  const sql = await migration();
  assert.match(sql, /create table public\.uni_update_push_dispatches \(/);
  assert.match(sql, /primary key \(user_id, update_id\)/);
  assert.match(sql, /user_id uuid not null references auth\.users\(id\) on delete cascade,/);
  assert.match(sql, /update_id uuid not null references public\.updates\(id\) on delete cascade,/);
});

test('uni_update_push_dispatches é 100% backend -- RLS habilitado, zero policy, zero grant para authenticated/anon', async () => {
  const sql = await migration();
  const tableBlock = sql.slice(
    sql.indexOf('create table public.uni_update_push_dispatches'),
    sql.indexOf('create schema if not exists private'),
  );
  assert.match(tableBlock, /alter table public\.uni_update_push_dispatches enable row level security;/);
  assert.match(tableBlock, /revoke all on table public\.uni_update_push_dispatches from anon, authenticated;/);
  assert.doesNotMatch(tableBlock, /create policy/);
  assert.doesNotMatch(tableBlock, /grant (select|insert|update|delete)/i);
});

test('segredo de disparo é PRÓPRIO (uni_updates_dispatch_secret) -- nunca lê/escreve de fato em private.agenda_dispatch_secret', async () => {
  const sql = await migration();
  assert.match(sql, /create table private\.uni_updates_dispatch_secret \(/);
  // agenda_dispatch_secret só pode aparecer em comentários explicando a
  // decisão de isolamento -- nunca em SQL executável (from/select/insert).
  assert.doesNotMatch(sql, /(?:from|select \* from|insert into) private\.agenda_dispatch_secret/);
});

test('verify_uni_updates_dispatch_secret é SECURITY DEFINER, search_path vazio, EXECUTE restrito a service_role', async () => {
  const sql = await migration();
  const fnBody = sql.slice(
    sql.indexOf('create or replace function public.verify_uni_updates_dispatch_secret'),
    sql.indexOf('create or replace function public.uni_updates_push_candidates'),
  );
  assert.match(fnBody, /security definer/);
  assert.match(fnBody, /set search_path = '';?\n/);
  assert.match(fnBody, /revoke all on function public\.verify_uni_updates_dispatch_secret\(text\) from public, anon, authenticated;/);
  assert.match(fnBody, /grant execute on function public\.verify_uni_updates_dispatch_secret\(text\) to service_role;/);
  assert.match(fnBody, /select 1 from private\.uni_updates_dispatch_secret where secret = candidate/);
});

test('uni_updates_push_candidates só considera a novidade ATIVA mais recente, mesmo recorte de resolvePendingUpdate', async () => {
  const sql = await migration();
  const fnBody = sql.slice(
    sql.indexOf('create or replace function public.uni_updates_push_candidates'),
    sql.indexOf('revoke all on function public.uni_updates_push_candidates'),
  );
  assert.match(fnBody, /where active = true\s*\n\s*order by created_at desc\s*\n\s*limit 1/);
  assert.match(fnBody, /where u\.created_at < latest\.created_at/);
});

test('uni_updates_push_candidates exclui quem já viu (user_seen_updates) e quem já recebeu o push (uni_update_push_dispatches)', async () => {
  const sql = await migration();
  const fnBody = sql.slice(
    sql.indexOf('create or replace function public.uni_updates_push_candidates'),
    sql.indexOf('revoke all on function public.uni_updates_push_candidates'),
  );
  assert.match(fnBody, /not exists \(\s*\n\s*select 1 from public\.user_seen_updates s/);
  assert.match(fnBody, /not exists \(\s*\n\s*select 1 from public\.uni_update_push_dispatches d/);
});

test('uni_updates_push_candidates é EXECUTE restrito a service_role -- nunca exposto a authenticated/anon (atravessa auth.users de todos)', async () => {
  const sql = await migration();
  assert.match(sql, /revoke all on function public\.uni_updates_push_candidates\(\) from public, anon, authenticated;/);
  assert.match(sql, /grant execute on function public\.uni_updates_push_candidates\(\) to service_role;/);
});

test('todas as funções novas fixam search_path vazio -- mesma convenção dominante do restante das migrations (nunca public, pg_temp)', async () => {
  const sql = await migration();
  const occurrences = sql.match(/set search_path = '';?\n/g) ?? [];
  assert.equal(occurrences.length, 2, 'as duas funções (verify + candidates) devem fixar search_path vazio');
});

test('pg_cron chama uni-updates-push-dispatch a cada 5 minutos com o segredo próprio no header X-Dispatch-Secret', async () => {
  const sql = await migration();
  assert.match(sql, /cron\.schedule\(\s*\n\s*'uni-updates-push-dispatch',\s*\n\s*'\*\/5 \* \* \* \*',/);
  assert.match(sql, /url := 'https:\/\/ikulazofzufeblzrhtif\.supabase\.co\/functions\/v1\/uni-updates-push-dispatch',/);
  assert.match(sql, /'X-Dispatch-Secret', \(select secret from private\.uni_updates_dispatch_secret limit 1\)/);
});

test('migration começa com begin e termina com commit', async () => {
  const sql = await migration();
  assert.match(sql.trim(), /^begin;/);
  assert.match(sql.trim(), /commit;$/);
});
