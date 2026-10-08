import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = () => readFile(
  new URL('../../supabase/migrations/20261008120000_057_platform_admin_troca_e_bloqueio.sql', import.meta.url),
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

test('toda função admin_* exige admin antes de qualquer coisa', async () => {
  const sql = await migration();
  for (const name of ['admin_list_users', 'admin_grant_manual_plan', 'admin_set_user_plan', 'admin_set_user_blocked']) {
    const body = functionBody(sql, name);
    assert.match(body, /security definer/, name);
    assert.match(body, /set search_path = public/, name);
    const beginIndex = body.indexOf('\nbegin\n');
    const firstStatement = body.slice(beginIndex + 7).trim().split('\n')[0];
    assert.match(firstStatement, /platform_admin_require\(\)/, name);
  }
});

test('anon nunca executa as funções novas', async () => {
  const sql = await migration();
  for (const signature of ['admin_list_users()', 'admin_set_user_plan(uuid, text)', 'admin_set_user_blocked(uuid, boolean, text)']) {
    const escaped = signature.replace(/[()]/g, '\\$&');
    assert.match(sql, new RegExp(`revoke execute on function public\\.${escaped} from public, anon;`), signature);
    assert.match(sql, new RegExp(`grant execute on function public\\.${escaped} to authenticated;`), signature);
  }
});

test('só a linha da Asaas sem vínculo nenhum lá vira plano manual', async () => {
  const grant = functionBody(await migration(), 'admin_grant_manual_plan');
  assert.match(grant, /v_subscription\.asaas_checkout_id is null and v_subscription\.asaas_customer_id is null/);
  assert.match(grant, /hint = 'admin_assinatura_paga'/);
  assert.match(grant, /hint = 'admin_checkout_recente'/);
  assert.match(grant, /'replaced_subscription_id', v_replaced_id/);
});

test('troca pela lista mantém a data de fim e o consumo de voz', async () => {
  const body = functionBody(await migration(), 'admin_set_user_plan');
  assert.match(body, /return public\.admin_grant_manual_plan\(p_user_id, p_tier_id, 1, null\);/);
  assert.match(body, /seconds_granted = public\.voice_cycle_committed_seconds\(v_cycle_id\) \+ v_remaining_seconds/);
  assert.match(body, /'change_manual_tier'/);
});

test('bloqueio usa banned_until, derruba sessões e poupa a si e a equipe', async () => {
  const body = functionBody(await migration(), 'admin_set_user_blocked');
  assert.match(body, /update auth\.users\s+set banned_until = case when p_blocked/);
  assert.match(body, /delete from auth\.sessions where user_id = p_user_id;/);
  assert.match(body, /hint = 'admin_bloquear_a_si'/);
  assert.match(body, /hint = 'admin_bloquear_admin'/);
});

test('auditoria aceita as ações novas', async () => {
  const sql = await migration();
  assert.match(sql, /action in \('grant_manual_plan', 'revoke_manual_plan', 'change_manual_tier', 'block_user', 'unblock_user'\)/);
});
