import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = () => readFile(
  new URL('../../supabase/migrations/20260731_027_balance_adjustments.sql', import.meta.url),
  'utf8',
);

// ============================================================================
// Ajuste de saldo via Uni (intents set_balance/ambiguidade). Migration
// ADITIVA: nunca dropa nada, não muda o contrato público das funções da 009
// (a primeira versão quebrou em produção com 42P13 ao adicionar a coluna OUT
// adjustment_total em get_derived_account_balances). Cobertura estrutural do
// SQL, mesmo padrão de billingMigration.test.js.
// ============================================================================

test('migration começa com begin e termina com commit -- atômica', async () => {
  const sql = await migration();
  assert.match(sql.trim(), /^begin;/);
  assert.match(sql.trim(), /commit;$/);
});

test('nunca usa DROP FUNCTION -- migration aditiva preserva chamadas antigas', async () => {
  const sql = await migration();
  // Statements SQL começam na coluna 0; comentários começam com "--".
  assert.doesNotMatch(sql, /^drop\s+(function|table|column|view|trigger|index)\b/im);
});

test('transactions.adjustment_delta é adicionada como numeric(18,2) sem apagar nada', async () => {
  const sql = await migration();
  assert.match(sql, /alter table public\.transactions\s*\n\s*add column if not exists adjustment_delta numeric\(18,\s*2\);/);
  assert.match(sql, /alter table public\.transactions\s*\n\s*add constraint transactions_adjustment_delta_check check/);
});

test('check de adjustment_delta: adjustment exige delta não-nulo e ≠ 0; outros tipos exigem NULL', async () => {
  const sql = await migration();
  assert.match(sql, /transaction_type = 'adjustment'\s*\n\s*and adjustment_delta is not null\s*\n\s*and adjustment_delta <> 0/);
  assert.match(sql, /transaction_type <> 'adjustment'\s*\n\s*and adjustment_delta is null/);
});

test('grant de insert/update da coluna adjustment_delta para authenticated', async () => {
  const sql = await migration();
  assert.match(sql, /grant insert \(adjustment_delta\) on table public\.transactions to authenticated;/);
  assert.match(sql, /grant update \(adjustment_delta\) on table public\.transactions to authenticated;/);
});

test('RPC atômica: overload de 13 parâmetros preserva o retorno exato da 008/009', async () => {
  const sql = await migration();
  assert.match(sql, /p_adjustment_delta numeric\s*\n\)\s*\nreturns table \(/);
  const returnsBlock = sql.slice(
    sql.indexOf('returns table ('),
    sql.indexOf('returns table (') + 220,
  );
  assert.match(returnsBlock, /transaction_id uuid,\s*\n\s*account_id uuid,\s*\n\s*account_created boolean,\s*\n\s*account_reactivated boolean,\s*\n\s*idempotent_replay boolean/);
});

test('RPC: adjustment valida amount = abs(delta) e rejeita delta em tipos não-adjustment', async () => {
  const sql = await migration();
  assert.match(sql, /p_amount is null or p_amount <= 0 or p_amount <> abs\(p_adjustment_delta\)/);
  assert.match(sql, /if p_adjustment_delta is not null then\s*\n\s*raise exception using errcode = 'P0001', message = 'financial_action_adjustment_delta_invalid'/);
});

test('replay idempotente compara adjustment_delta (is not distinct from)', async () => {
  const sql = await migration();
  assert.match(sql, /transaction\.adjustment_delta is not distinct from p_adjustment_delta/);
});

test('REGRESSÃO 42P13: get_derived_account_balances mantém o contrato EXATO de 7 colunas da 009', async () => {
  const sql = await migration();
  const fnIndex = sql.indexOf('create or replace function public.get_derived_account_balances()');
  assert.ok(fnIndex > -1, 'função não encontrada');
  const fnSlice = sql.slice(fnIndex, fnIndex + 420);
  assert.match(fnSlice, /returns table \(\s*\n\s*account_id uuid,\s*\n\s*initial_balance numeric,\s*\n\s*income_total numeric,\s*\n\s*expense_total numeric,\s*\n\s*transfer_in_total numeric,\s*\n\s*transfer_out_total numeric,\s*\n\s*derived_balance numeric\s*\n\)/);
  // Nenhuma coluna nova no contrato público (nunca adjustment_total como OUT).
  assert.doesNotMatch(fnSlice, /adjustment_total numeric/);
});

test('derived_balance soma adjustment_total como agregado INTERNO do CTE (não como coluna OUT)', async () => {
  const sql = await migration();
  assert.match(sql, /as adjustment_total\s*\n\s*from public\.accounts as account/);
  assert.match(sql, /\+ movement\.adjustment_total\s*\n\s*\)::numeric as derived_balance/);
  // A seleção final (colunas OUT) lista exatamente as 7 colunas da 009.
  assert.match(sql, /select\s*\n\s*movement\.account_id,\s*\n\s*movement\.initial_balance,\s*\n\s*movement\.income_total,\s*\n\s*movement\.expense_total,\s*\n\s*movement\.transfer_in_total,\s*\n\s*movement\.transfer_out_total,\s*\n\s*\(/);
});

test('get_derived_workspace_balance não é recriada na 027 -- agrega da conta e propaga ajustes sem mudança', async () => {
  const sql = await migration();
  assert.doesNotMatch(sql, /create or replace function public\.get_derived_workspace_balance/);
  // Só owner/grants/comentário preservados.
  assert.match(sql, /alter function public\.get_derived_workspace_balance\(\) owner to postgres;/);
  assert.match(sql, /grant execute on function public\.get_derived_workspace_balance\(\)\s*\n\s*to authenticated;/);
});

test('RPC 13-parametros recria owner, security definer, search_path, revoke e grants na mesma transação', async () => {
  const sql = await migration();
  assert.match(sql, /alter function public\.execute_confirmed_financial_action\(\s*\n\s*uuid, text, uuid, text, text, text, uuid, text, text, numeric, date, uuid, numeric\s*\n\) owner to postgres;/);
  assert.match(sql, /alter function public\.execute_confirmed_financial_action\(\s*\n\s*uuid, text, uuid, text, text, text, uuid, text, text, numeric, date, uuid, numeric\s*\n\) security definer;/);
  assert.match(sql, /revoke all on function public\.execute_confirmed_financial_action\(\s*\n\s*uuid, text, uuid, text, text, text, uuid, text, text, numeric, date, uuid, numeric\s*\n\) from public, anon, authenticated;/);
  assert.match(sql, /grant execute on function public\.execute_confirmed_financial_action\(\s*\n\s*uuid, text, uuid, text, text, text, uuid, text, text, numeric, date, uuid, numeric\s*\n\) to authenticated;/);
});

test('comentários das funções e da coluna documentam a mudança', async () => {
  const sql = await migration();
  assert.match(sql, /comment on column public\.transactions\.adjustment_delta is/);
  assert.match(sql, /comment on function public\.get_derived_account_balances\(\) is/);
});
