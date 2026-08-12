import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = () => readFile(
  new URL('../../supabase/migrations/20260812170000_036_workspace_balance_includes_accountless_transactions.sql', import.meta.url),
  'utf8',
);

// ============================================================================
// BUG REAL EM PRODUCAO: get_derived_workspace_balance() somava apenas
// get_derived_account_balances() (join estrito por conta real) -- qualquer
// lançamento com account_id null (comum desde que conta ficou opcional para
// receita/despesa, migrations 034/035) nunca batia nesse join e ficava fora
// do saldo total exibido em "Resumo do mês". Confirmado com dados reais em
// produção: 4 lançamentos sem conta somando -R$495,00 ausentes do saldo.
// Esta migration corrige SÓ o agregado do workspace -- get_derived_account_
// balances() (saldo POR conta) não muda.
// ============================================================================

test('migration começa com begin e termina com commit -- atômica', async () => {
  const sql = await migration();
  assert.match(sql.trim(), /^begin;/);
  assert.match(sql.trim(), /commit;$/);
});

test('nunca usa DROP FUNCTION -- migration aditiva, get_derived_account_balances() intocada', async () => {
  const sql = await migration();
  assert.doesNotMatch(sql, /^drop\s+(function|table|column|view|trigger|index)\b/im);
  assert.doesNotMatch(sql, /create or replace function public\.get_derived_account_balances/);
});

test('soma o saldo líquido dos lançamentos sem conta (income - expense + adjustment_delta) ao total por conta', async () => {
  const sql = await migration();
  const fnBody = sql.slice(
    sql.indexOf('create or replace function public.get_derived_workspace_balance'),
    sql.indexOf('alter function public.get_derived_workspace_balance() owner to postgres;'),
  );
  assert.match(fnBody, /coalesce\(sum\(balance\.derived_balance\), 0\)::numeric/);
  assert.match(fnBody, /transaction\.account_id is null/);
  assert.match(fnBody, /transaction\.transaction_type = 'income'/);
  assert.match(fnBody, /transaction\.transaction_type = 'expense'/);
  assert.match(fnBody, /transaction\.transaction_type = 'adjustment'/);
  assert.match(fnBody, /from public\.get_derived_account_balances\(\) as balance;/);
});

test('mantém as mesmas guardas de sessão/workspace/membership da versão anterior', async () => {
  const sql = await migration();
  assert.match(sql, /financial_balance_session_required/);
  assert.match(sql, /financial_balance_workspace_required/);
  assert.match(sql, /financial_balance_workspace_forbidden/);
  assert.match(sql, /profile\.current_workspace_id/);
  assert.match(sql, /member\.status = 'active'/);
});

test('grants/owner preservados: security definer, search_path vazio, execute só para authenticated', async () => {
  const sql = await migration();
  assert.match(sql, /alter function public\.get_derived_workspace_balance\(\) owner to postgres;/);
  assert.match(sql, /alter function public\.get_derived_workspace_balance\(\) security definer;/);
  assert.match(sql, /alter function public\.get_derived_workspace_balance\(\) set search_path = '';/);
  assert.match(sql, /revoke all on function public\.get_derived_workspace_balance\(\)\s*\n\s*from public, anon, authenticated;/);
  assert.match(sql, /grant execute on function public\.get_derived_workspace_balance\(\)\s*\n\s*to authenticated;/);
});
