import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// #160: lembrete mensal do aporte da meta. Cobertura estrutural da migration
// 063 e da Edge Function goal-reminder-push-dispatch (Deno/TS com npm:
// specifier não roda sob `node --test`), mesmo padrão dos outros workers de
// push.

const read = (relativePath) => readFileSync(new URL(`../../../${relativePath}`, import.meta.url), 'utf8');

const SQL = read('supabase/migrations/20261012005953_063_metas_lembrete_mensal.sql');
const SOURCE = read('supabase/functions/goal-reminder-push-dispatch/index.ts');
const CONFIG = read('supabase/config.toml');

function candidatesBody() {
  return SQL.slice(
    SQL.indexOf('create or replace function public.goal_reminder_push_candidates()'),
    SQL.indexOf('revoke all on function public.goal_reminder_push_candidates()'),
  );
}

test('reminder_day é opcional e só aceita os dias 1 a 28, que existem em todo mês', () => {
  assert.match(SQL, /add column if not exists reminder_day smallint;/);
  assert.match(SQL, /check \(reminder_day is null or reminder_day between 1 and 28\)/);
});

test('o cliente consegue gravar reminder_day (grant por coluna, como o resto de financial_goals)', () => {
  assert.match(SQL, /grant insert \(reminder_day\), update \(reminder_day\)\s+on public\.financial_goals to authenticated;/);
});

test('idempotência: no máximo um lembrete por meta por mês', () => {
  assert.match(SQL, /primary key \(goal_id, reference_month\)/);
  assert.match(SQL, /goal_id uuid not null references public\.financial_goals\(id\) on delete cascade/);
  assert.match(SQL, /alter table public\.goal_reminder_push_dispatches enable row level security;/);
  assert.match(SQL, /revoke all on table public\.goal_reminder_push_dispatches from anon, authenticated;/);
});

test('meta pausada, concluída, cancelada, arquivada ou já atingida não gera lembrete', () => {
  const body = candidatesBody();
  assert.match(body, /g\.status = 'active'/);
  assert.match(body, /g\.archived_at is null/);
  assert.match(body, /g\.current_amount < g\.target_amount/);
});

test('o dia e o mês são os de America/Sao_Paulo, não os de UTC', () => {
  const body = candidatesBody();
  assert.match(body, /\(now\(\) at time zone 'America\/Sao_Paulo'\)::date as dia/);
  assert.match(body, /date_trunc\('month', now\(\) at time zone 'America\/Sao_Paulo'\)::date as mes/);
  assert.match(body, /g\.reminder_day = extract\(day from hoje\.dia\)/);
});

test('meta com aporte no mês ou com lembrete já enviado no mês fica de fora', () => {
  const body = candidatesBody();
  assert.match(body, /from public\.goal_contributions c[\s\S]*c\.amount > 0[\s\S]*c\.contribution_date >= hoje\.mes/);
  assert.match(body, /c\.contribution_date < \(hoje\.mes \+ interval '1 month'\)::date/);
  assert.match(body, /from public\.goal_reminder_push_dispatches d[\s\S]*d\.reference_month = hoje\.mes/);
});

test('índice parcial cobre só as metas ativas com lembrete', () => {
  assert.match(SQL, /create index if not exists financial_goals_reminder_day_idx\s+on public\.financial_goals \(reminder_day\)\s+where reminder_day is not null and status = 'active' and archived_at is null;/);
});

test('aporte sem data usa a data local do aparelho, não a de UTC', () => {
  const service = read('src/features/goals/goalService.js');
  assert.match(service, /contribution\.contribution_date \|\| dataLocalDeHoje\(\)/);
  assert.doesNotMatch(service, /toISOString\(\)\.split\('T'\)\[0\]/);
});

test('candidatos e segredo só executam como service_role', () => {
  assert.match(SQL, /revoke all on function public\.goal_reminder_push_candidates\(\) from public, anon, authenticated;/);
  assert.match(SQL, /grant execute on function public\.goal_reminder_push_candidates\(\) to service_role;/);
  assert.match(SQL, /revoke all on function public\.verify_goal_reminder_dispatch_secret\(text\) from public, anon, authenticated;/);
});

test('o cron lê a URL do projeto no Vault e não escreve project-ref na migration', () => {
  assert.match(SQL, /'goal-reminder-push-dispatch',\s+'0 12-22 \* \* \*'/);
  assert.match(SQL, /segredo\.decrypted_secret \|\| '\/functions\/v1\/goal-reminder-push-dispatch'/);
  assert.match(SQL, /where segredo\.name = 'project_url'/);
  assert.doesNotMatch(SQL, /\.supabase\.co/);
});

test('a função confere o segredo próprio e nunca o de outro worker', () => {
  assert.match(SOURCE, /rest\/v1\/rpc\/verify_goal_reminder_dispatch_secret/);
  assert.doesNotMatch(SOURCE, /verify_agenda_dispatch_secret|verify_uni_updates_dispatch_secret/);
  assert.match(SOURCE, /if \(!isAuthorized\) \{/);
});

test('candidatos vêm só de goal_reminder_push_candidates(), nunca do corpo da requisição', () => {
  assert.match(SOURCE, /rest\/v1\/rpc\/goal_reminder_push_candidates/);
  assert.doesNotMatch(SOURCE, /request\.json\(\)/);
});

test('falha ao ler os candidatos responde 502 em vez de uma rodada vazia com 200', () => {
  const fnBody = SOURCE.slice(SOURCE.indexOf('Deno.serve'));
  assert.match(fnBody, /if \(candidates === null\) \{\s+return jsonResponse\(502,/);
});

test('envio que falhou em todos os dispositivos apaga a linha de idempotência e volta na hora seguinte', () => {
  const processBody = SOURCE.slice(SOURCE.indexOf('async function processCandidates'));
  assert.match(processBody, /if \(result\.sent === 0 && result\.failed > 0\) \{\s+await releaseDispatchRow\(/);

  const releaseBody = SOURCE.slice(
    SOURCE.indexOf('async function releaseDispatchRow'),
    SOURCE.indexOf('async function listActiveSubscriptionsForUser'),
  );
  assert.match(releaseBody, /method: 'DELETE'/);
  assert.match(releaseBody, /goal_id: `eq\.\$\{candidate\.goal_id\}`/);
  assert.match(releaseBody, /reference_month: `eq\.\$\{candidate\.reference_month\}`/);
});

test('a linha de idempotência é gravada antes do envio, com ON CONFLICT DO NOTHING', () => {
  const fnBody = SOURCE.slice(
    SOURCE.indexOf('async function claimDispatchRow'),
    SOURCE.indexOf('async function listActiveSubscriptionsForUser'),
  );
  assert.match(fnBody, /on_conflict=goal_id,reference_month/);
  assert.match(fnBody, /resolution=ignore-duplicates,return=representation/);

  const processBody = SOURCE.slice(SOURCE.indexOf('async function processCandidates'));
  assert.ok(
    processBody.indexOf('claimDispatchRow(') < processBody.indexOf('sendToUserSubscriptions('),
    'claimDispatchRow precisa vir antes de sendToUserSubscriptions',
  );
});

test('o push diz a meta e, quando há valor planejado, quanto guardar no mês', () => {
  const fnBody = SOURCE.slice(
    SOURCE.indexOf('function buildGoalReminderPayload'),
    SOURCE.indexOf('async function sendToUserSubscriptions'),
  );
  assert.match(fnBody, /title: `Aporte da meta \$\{candidate\.name\}`,/);
  assert.match(fnBody, /`Guarde \$\{BRL\.format\(monthlyAmount\)\} este mês e registre o aporte na meta\.`/);
  assert.match(fnBody, /'Registre o aporte deste mês na meta\.'/);
  assert.match(fnBody, /const url = '\/app\/metas';/);
});

test('a integração do Supabase deploya a função e ela roda sem JWT (quem autentica é o segredo)', () => {
  assert.match(CONFIG, /\[functions\.goal-reminder-push-dispatch\]\nverify_jwt = false/);
});
