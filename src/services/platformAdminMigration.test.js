import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = () => readFile(
  new URL('../../supabase/migrations/20261007220424_056_platform_admin.sql', import.meta.url),
  'utf8',
);

const checkout = () => readFile(
  new URL('../../supabase/functions/billing-create-checkout/index.ts', import.meta.url),
  'utf8',
);

function functionBody(sql, name) {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  assert.notEqual(start, -1, name);
  const end = sql.indexOf('$$;', sql.indexOf('as $$', start));
  return sql.slice(start, end);
}

test('migration é atômica', async () => {
  const sql = await migration();
  assert.match(sql.trim(), /^begin;/);
  assert.match(sql.trim(), /commit;$/);
});

test('platform_admins não tem acesso direto do app', async () => {
  const sql = await migration();
  assert.match(sql, /alter table public\.platform_admins enable row level security;/);
  assert.match(sql, /revoke all on table public\.platform_admins from anon, authenticated;/);
  assert.doesNotMatch(sql, /create policy[^;]*platform_admins/);
  assert.match(sql, /revoke all on table public\.platform_admin_audit from anon, authenticated;/);
});

test('toda função admin_* exige admin antes de qualquer coisa', async () => {
  const sql = await migration();
  for (const name of ['admin_list_users', 'admin_grant_manual_plan', 'admin_revoke_manual_plan']) {
    const body = functionBody(sql, name);
    assert.match(body, /security definer/, name);
    assert.match(body, /set search_path = public/, name);
    const beginIndex = body.indexOf('\nbegin\n');
    const firstStatement = body.slice(beginIndex + 7).trim().split('\n')[0];
    assert.match(firstStatement, /platform_admin_require\(\)/, name);
  }
});

test('o guard confere admin pelo auth.uid() no banco', async () => {
  const sql = await migration();
  assert.match(functionBody(sql, 'is_platform_admin'), /where user_id = auth\.uid\(\)/);
  assert.match(functionBody(sql, 'platform_admin_require'), /hint = 'admin_acesso_negado'/);
});

test('anon nunca executa; o guard interno e a expiração não são chamáveis pelo app', async () => {
  const sql = await migration();
  assert.match(sql, /revoke execute on function public\.platform_admin_require\(\) from public, anon, authenticated;/);
  assert.match(sql, /revoke execute on function public\.platform_expire_manual_plans\(\) from public, anon, authenticated;/);
  for (const signature of ['is_platform_admin()', 'admin_list_users()', 'admin_grant_manual_plan(uuid, text, integer, text)', 'admin_revoke_manual_plan(uuid, text)']) {
    const escaped = signature.replace(/[()]/g, '\\$&');
    assert.match(sql, new RegExp(`revoke execute on function public\\.${escaped} from public, anon;`), signature);
    assert.match(sql, new RegExp(`grant execute on function public\\.${escaped} to authenticated;`), signature);
  }
});

test('plano manual é linha pro ativa com source manual', async () => {
  const sql = await migration();
  assert.match(sql, /add constraint subscriptions_source_check check \(source in \('asaas', 'manual'\)\)/);
  assert.match(sql, /add column if not exists source text not null default 'asaas'/);
  const grant = functionBody(sql, 'admin_grant_manual_plan');
  assert.match(grant, /v_workspace_id, 'pro', 'active', p_tier_id, 'manual'/);
  assert.match(grant, /hint = 'admin_assinatura_paga'/);
  assert.match(grant, /p_months < 1 or p_months > 24/);
  assert.match(grant, /insert into public\.voice_cycles/);
  assert.match(grant, /'grant_manual_plan'/);
});

test('motivo e autor da concessão ficam fora de subscriptions, que o assinante lê', async () => {
  const sql = await migration();
  assert.doesNotMatch(sql, /add column if not exists (granted_by|grant_note)/);
  const grant = functionBody(sql, 'admin_grant_manual_plan');
  assert.match(grant, /'note', v_note/);
  assert.match(functionBody(sql, 'admin_list_users'), /from public\.platform_admin_audit a2/);
});

test('checkout de cartão abandonado é cancelado; o recente é recusado', async () => {
  const sql = await migration();
  const grant = functionBody(sql, 'admin_grant_manual_plan');
  assert.match(grant, /v_subscription\.status = 'pending'\s+and v_subscription\.asaas_subscription_id is null/);
  assert.match(grant, /updated_at > now\(\) - interval '2 hours'/);
  assert.match(grant, /hint = 'admin_checkout_recente'/);
});

test('encerrar e expirar só mexem em plano manual', async () => {
  const sql = await migration();
  const revoke = functionBody(sql, 'admin_revoke_manual_plan');
  assert.match(revoke, /v_subscription\.source <> 'manual'/);
  assert.match(revoke, /set status = 'canceled'/);
  const expire = functionBody(sql, 'platform_expire_manual_plans');
  assert.match(expire, /where source = 'manual'/);
  assert.match(sql, /cron\.schedule\(\s*'platform-expire-manual-plans',\s*'\*\/5 \* \* \* \*'/);
});

test('checkout de cartão nunca reaproveita a linha de um plano manual', async () => {
  const source = await checkout();
  assert.match(source, /existingSubscription\?\.source === 'manual'/);
});
