import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = () => readFile(
  new URL('../../supabase/migrations/20261012132558_065_confirmacao_automatica_previstos.sql', import.meta.url),
  'utf8',
);

test('migration é atômica', async () => {
  const sql = await migration();
  assert.match(sql.trim(), /^begin;/);
  assert.match(sql.trim(), /commit;$/);
});

test('só confirma previsto com auto_confirm cuja data chegou, no fuso de São Paulo', async () => {
  const sql = await migration();
  assert.match(sql, /set status = 'completed'/);
  assert.match(sql, /where status = 'pending'/);
  assert.match(sql, /metadata ->> 'auto_confirm' = 'true'/);
  assert.match(sql, /transaction_date <= \(pg_catalog\.now\(\) at time zone 'America\/Sao_Paulo'\)::date/);
});

test('função só roda pelo job: sem execução para anon e authenticated', async () => {
  const sql = await migration();
  assert.match(sql, /revoke execute on function public\.confirm_due_planned_transactions\(\) from public, anon, authenticated;/);
  assert.match(sql, /grant execute on function public\.confirm_due_planned_transactions\(\) to service_role;/);
  assert.match(sql, /cron\.schedule\(\s*'confirm-due-planned-transactions'/);
});
