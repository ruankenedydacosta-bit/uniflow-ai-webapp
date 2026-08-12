import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = () => readFile(
  new URL('../../supabase/migrations/20260812150300_034_transactions_account_optional.sql', import.meta.url),
  'utf8',
);
const CORE_SCHEMA = () => readFile(
  new URL('../../supabase/migrations/20260711000200_002_financial_core.sql', import.meta.url),
  'utf8',
);

// ============================================================================
// account_id deixa de ser NOT NULL: lançamento de entrada/despesa passa a
// poder ser salvo sem nenhuma conta associada (só valor + categoria +
// descrição). Transferência e ajuste de saldo continuam exigindo conta, mas
// isso é regra de aplicação (financialIntentAction.js/transactionService.js),
// não mais constraint de banco -- ver comentário da própria migration.
// ============================================================================

test('migration começa com begin e termina com commit -- atômica', async () => {
  const sql = await migration();
  assert.match(sql.trim(), /^begin;/);
  assert.match(sql.trim(), /commit;$/);
});

test('só altera a coluna account_id -- nunca dropa tabela, view, função ou índice', async () => {
  const sql = await migration();
  assert.doesNotMatch(sql, /^drop\s+(table|view|function|index|trigger)\b/im);
  assert.match(sql, /alter table public\.transactions\s*\n\s*alter column account_id drop not null;/);
});

test('a FK composta (account_id, workspace_id) não é tocada -- tolera NULL nativamente no Postgres', async () => {
  const coreSql = await CORE_SCHEMA();
  // A migration original que criou a FK continua intacta (esta migration só
  // referencia/explica o comportamento, nunca recria a constraint).
  assert.match(
    coreSql,
    /constraint transactions_account_workspace_fkey\s*\n\s*foreign key \(account_id, workspace_id\)/,
  );
  const migrationSql = await migration();
  assert.doesNotMatch(migrationSql, /transactions_account_workspace_fkey/);
});

test('RLS de transactions nunca dependeu de account_id -- só workspace_id, então nenhuma policy precisa mudar', async () => {
  const coreSql = await CORE_SCHEMA();
  const start = coreSql.indexOf('create policy transactions_select_active_member');
  const end = coreSql.indexOf('-- Column grants complementam RLS');
  const policiesBlock = coreSql.slice(start, end);
  assert.ok(policiesBlock.length > 0, 'bloco de policies não encontrado');
  assert.doesNotMatch(policiesBlock, /account_id/);
});
