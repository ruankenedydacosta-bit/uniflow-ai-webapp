// #121: conferência estática da migration 060 (category_budgets) e do
// serviço. A RLS de verdade foi validada em transação desfeita no fim (ver o
// PR); aqui fica o que não pode regredir.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { MAX_MONTHLY_LIMIT, normalizeMonthlyLimit } from './categoryBudgetService.js';

const raiz = new URL('../../', import.meta.url);
const nomeDaMigration = readdirSync(new URL('supabase/migrations/', raiz))
  .find((nome) => /_060_category_budgets\.sql$/.test(nome));
const migration = nomeDaMigration
  ? readFileSync(new URL(`supabase/migrations/${nomeDaMigration}`, raiz), 'utf8')
  : '';

test('migration 060 existe com versão de 14 dígitos depois da 059', () => {
  assert.ok(nomeDaMigration, 'migration 060 ausente');
  const versao = nomeDaMigration.split('_')[0];
  assert.match(versao, /^\d{14}$/);
  assert.ok(BigInt(versao) > 20261008230000n);
});

test('tabela com RLS, um teto por categoria em cada espaço e valor positivo', () => {
  assert.match(migration, /create table if not exists public\.category_budgets \(/);
  assert.match(migration, /alter table public\.category_budgets enable row level security;/);
  assert.match(migration, /unique \(workspace_id, category_id\)/);
  assert.match(migration, /check \(monthly_limit > 0\)/);
});

test('UPDATE só pode mudar o valor: trocar espaço ou categoria fica sem grant', () => {
  assert.match(migration, /revoke all on table public\.category_budgets from anon, authenticated;/);
  assert.match(migration, /grant update \(monthly_limit\) on public\.category_budgets to authenticated;/);
  assert.doesNotMatch(migration, /grant update \([^)]*(workspace_id|category_id)/);
});

test('INSERT exige membro com escrita e categoria visível no espaço', () => {
  const insert = migration.slice(migration.indexOf('create policy category_budgets_insert_contributor'));
  assert.match(insert, /is_workspace_member\(workspace_id, array\['owner', 'admin', 'member'\]::text\[\]\)/);
  assert.match(insert, /c\.workspace_id is null or c\.workspace_id = category_budgets\.workspace_id/);
});

test('normalizeMonthlyLimit aceita só valor positivo dentro da coluna', () => {
  assert.equal(normalizeMonthlyLimit(400), 400);
  assert.equal(normalizeMonthlyLimit('123.456'), 123.46);
  assert.equal(normalizeMonthlyLimit(0), null);
  assert.equal(normalizeMonthlyLimit(-5), null);
  assert.equal(normalizeMonthlyLimit(''), null);
  assert.equal(normalizeMonthlyLimit(MAX_MONTHLY_LIMIT + 1), null);
});
