import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = () => readFile(
  new URL('../../supabase/migrations/20261012132820_066_acao_financeira_confirmada_data_futura.sql', import.meta.url),
  'utf8',
);

test('migration é atômica', async () => {
  const sql = await migration();
  assert.match(sql.trim(), /^begin;/);
  assert.match(sql.trim(), /commit;$/);
});

test('data futura grava pending e o retry reconhece completed e pending', async () => {
  const sql = await migration();
  assert.match(sql, /p_transaction_date > \(now\(\) at time zone 'America\/Sao_Paulo'\)::date\s+then 'pending'/);
  assert.match(sql, /transaction\.status in \('completed', 'pending'\)/);
  assert.doesNotMatch(sql, /transaction\.status = 'completed'/);
});

test('mantém a assinatura da 039: segue sendo o mesmo create or replace', async () => {
  const sql = await migration();
  assert.match(sql, /create or replace function public\.execute_confirmed_financial_action\(/);
  assert.match(sql, /p_adjustment_target text default null/);
  assert.doesNotMatch(sql, /drop function/i);
});
