import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = () => readFile(
  new URL('../../../supabase/migrations/20260819140000_043_agenda_push_reminders.sql', import.meta.url),
  'utf8',
);

// ============================================================================
// AGPUSH1 -- migration da tabela agenda_push_reminders + infraestrutura do
// worker (segredo de disparo, funcoes de candidatos, pg_cron). Cobertura
// estrutural do SQL, mesmo padrao de pushSubscriptionsMigration.test.js.
// ============================================================================

test('tabela agenda_push_reminders tem as colunas minimas do modelo conceitual pedido', async () => {
  const sql = await migration();
  assert.match(sql, /create table public\.agenda_push_reminders \(/);
  for (const column of [
    'agenda_item_id', 'workspace_id', 'user_id', 'decision_token',
    'prompt_sent_at', 'reminder_offset_minutes', 'reminder_decision_at', 'reminder_sent_at',
  ]) {
    assert.match(sql, new RegExp(`\\b${column}\\b`), `coluna ${column} ausente`);
  }
});

test('agenda_item_id e unico (no maximo uma linha por compromisso) e cai em cascade quando o compromisso e excluido', async () => {
  const sql = await migration();
  assert.match(
    sql,
    /agenda_item_id uuid not null unique references public\.agenda_items\(id\) on delete cascade,/,
  );
});

test('reminder_offset_minutes so aceita 30, 60 ou null -- nunca um valor arbitrario', async () => {
  const sql = await migration();
  assert.match(sql, /constraint agenda_push_reminders_offset_check check \(/);
  assert.match(sql, /reminder_offset_minutes is null or reminder_offset_minutes in \(30, 60\)/);
});

test('RLS habilitado; select e update restritos ao proprio usuario, sem policy de insert/delete para o cliente', async () => {
  const sql = await migration();
  assert.match(sql, /alter table public\.agenda_push_reminders enable row level security;/);
  assert.match(sql, /create policy agenda_push_reminders_select_own/);
  assert.match(sql, /create policy agenda_push_reminders_update_own/);
  assert.doesNotMatch(sql, /create policy agenda_push_reminders_insert/);
  assert.doesNotMatch(sql, /create policy agenda_push_reminders_delete/);
  assert.doesNotMatch(sql, /for insert\s*\non public\.agenda_push_reminders/);
});

test('grant de UPDATE do cliente restrito a reminder_offset_minutes e reminder_decision_at -- nunca prompt_sent_at/reminder_sent_at/decision_token/user_id/workspace_id/agenda_item_id', async () => {
  const sql = await migration();
  assert.match(
    sql,
    /grant update \(reminder_offset_minutes, reminder_decision_at\)\s*\n\s*on table public\.agenda_push_reminders to authenticated;/,
  );
});

test('grant de SELECT do cliente exclui decision_token', async () => {
  const sql = await migration();
  const grantBlock = sql.slice(sql.indexOf('grant select ('), sql.indexOf(') on table public.agenda_push_reminders to authenticated;'));
  assert.doesNotMatch(grantBlock, /decision_token/);
});

test('nenhum grant de INSERT/DELETE ao cliente na tabela -- linhas so nascem pelo worker (service role) e morrem por cascade', async () => {
  const sql = await migration();
  assert.doesNotMatch(sql, /grant insert[\s\S]*?on table public\.agenda_push_reminders/);
  assert.doesNotMatch(sql, /grant delete[\s\S]*?on table public\.agenda_push_reminders/);
});

test('segredo de disparo e gerado pelo proprio Postgres (gen_random_bytes) -- nunca um literal escrito nesta migration', async () => {
  const sql = await migration();
  assert.match(sql, /secret text not null default encode\(gen_random_bytes\(32\), 'hex'\)/);
  assert.doesNotMatch(sql, /secret\s*=\s*'[0-9a-f]{16,}'/);
});

test('schema private nao e acessivel a anon/authenticated', async () => {
  const sql = await migration();
  assert.match(sql, /revoke all on schema private from anon, authenticated;/);
});

test('verify_agenda_dispatch_secret e SECURITY DEFINER, EXECUTE restrito a service_role, e devolve so um boolean', async () => {
  const sql = await migration();
  const fnBlock = sql.slice(
    sql.indexOf('create or replace function public.verify_agenda_dispatch_secret'),
    sql.indexOf('create or replace function public.agenda_push_prompt_candidates'),
  );
  assert.match(fnBlock, /returns boolean/);
  assert.match(fnBlock, /security definer/);
  assert.match(fnBlock, /revoke all on function public\.verify_agenda_dispatch_secret\(text\) from public, anon, authenticated;/);
  assert.match(fnBlock, /grant execute on function public\.verify_agenda_dispatch_secret\(text\) to service_role;/);
});

test('agenda_push_prompt_candidates filtra scheduled, horario explicito, nao all-day e "e amanha" em America/Sao_Paulo', async () => {
  const sql = await migration();
  const fnBlock = sql.slice(
    sql.indexOf('create or replace function public.agenda_push_prompt_candidates'),
    sql.indexOf('create or replace function public.agenda_push_reminder_candidates'),
  );
  assert.match(fnBlock, /ai\.status = 'scheduled'/);
  assert.match(fnBlock, /ai\.has_explicit_time = true/);
  assert.match(fnBlock, /ai\.is_all_day = false/);
  assert.match(fnBlock, /at time zone 'America\/Sao_Paulo'/);
  assert.match(fnBlock, /::date \+ 1/);
  assert.match(fnBlock, /not exists \(\s*\n\s*select 1 from public\.agenda_push_reminders r where r\.agenda_item_id = ai\.id\s*\n\s*\)/);
});

test('funcoes de candidatos so sao executaveis por service_role -- nunca anon/authenticated', async () => {
  const sql = await migration();
  for (const fn of ['agenda_push_prompt_candidates()', 'agenda_push_reminder_candidates()']) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${fn.replace(/[()]/g, '\\$&')} from public, anon, authenticated;`));
    assert.match(sql, new RegExp(`grant execute on function public\\.${fn.replace(/[()]/g, '\\$&')} to service_role;`));
  }
});

test('agenda_push_reminder_candidates le starts_at AO VIVO de agenda_items (nunca um horario absoluto persistido) e exige status scheduled', async () => {
  const sql = await migration();
  const fnBlock = sql.slice(
    sql.indexOf('create or replace function public.agenda_push_reminder_candidates'),
    sql.indexOf('revoke all on function public.agenda_push_reminder_candidates'),
  );
  assert.match(fnBlock, /join public\.agenda_items ai on ai\.id = r\.agenda_item_id/);
  assert.match(fnBlock, /ai\.status = 'scheduled'/);
  assert.match(fnBlock, /r\.reminder_sent_at is null/);
  assert.match(fnBlock, /now\(\) >= \(ai\.starts_at - \(r\.reminder_offset_minutes \|\| ' minutes'\)::interval\)/);
});

test('pg_cron/pg_net habilitados e o job agenda-push-dispatch agendado de 5 em 5 minutos', async () => {
  const sql = await migration();
  assert.match(sql, /create extension if not exists pg_cron with schema extensions;/);
  assert.match(sql, /create extension if not exists pg_net with schema extensions;/);
  assert.match(sql, /cron\.schedule\(\s*\n\s*'agenda-push-dispatch',\s*\n\s*'\*\/5 \* \* \* \*',/);
});

test('a chamada HTTP do cron le o segredo da tabela privada -- nunca um valor literal na URL/headers', async () => {
  const sql = await migration();
  const cronBlock = sql.slice(sql.indexOf('select\n  cron.schedule'));
  assert.match(cronBlock, /\(select secret from private\.agenda_dispatch_secret limit 1\)/);
  assert.match(cronBlock, /url := 'https:\/\/ikulazofzufeblzrhtif\.supabase\.co\/functions\/v1\/agenda-push-dispatch'/);
});

test('migration comeca com begin e termina com commit -- atomica, mesmo padrao das demais migrations', async () => {
  const sql = await migration();
  assert.match(sql.trim(), /^begin;/);
  assert.match(sql.trim(), /commit;$/);
});

test('nao altera notifications/dismissed_at nem nenhuma tabela de outra fase -- aditiva, isolada', async () => {
  const sql = await migration();
  assert.doesNotMatch(sql, /drop table|drop column|drop policy/);
  assert.doesNotMatch(sql, /alter table public\.notifications/);
  assert.doesNotMatch(sql, /alter table public\.push_subscriptions/);
});
