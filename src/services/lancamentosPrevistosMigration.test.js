import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = () => readFile(
  new URL('../../supabase/migrations/20261012130753_064_lancamentos_futuros_previstos.sql', import.meta.url),
  'utf8',
);

test('migration é atômica', async () => {
  const sql = await migration();
  assert.match(sql.trim(), /^begin;/);
  assert.match(sql.trim(), /commit;$/);
});

test('só vira previsto o realizado manual com data futura no fuso de São Paulo', async () => {
  const sql = await migration();
  assert.match(sql, /set status = 'pending'/);
  assert.match(sql, /status = 'completed'/);
  assert.match(sql, /transaction_date > \(now\(\) at time zone 'America\/Sao_Paulo'\)::date/);
  assert.match(sql, /source_type = 'manual'/);
  assert.match(sql, /external_provider is null/);
  assert.match(sql, /transaction_type in \('income', 'expense', 'transfer'\)/);
});
