import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = () => readFile(
  new URL('../../../supabase/migrations/20260819130000_042_push_subscriptions.sql', import.meta.url),
  'utf8',
);

// ============================================================================
// PUSH1 -- migration da tabela push_subscriptions. Cobertura estrutural do
// SQL, mesmo padrão já usado por notificationsMigration.test.js.
// ============================================================================

test('tabela push_subscriptions tem as colunas minimas exigidas pela PUSH1', async () => {
  const sql = await migration();
  assert.match(sql, /create table public\.push_subscriptions \(/);
  for (const column of ['id', 'user_id', 'workspace_id', 'endpoint', 'p256dh', 'auth', 'platform', 'created_at', 'updated_at', 'last_seen_at', 'revoked_at']) {
    assert.match(sql, new RegExp(`\\b${column}\\b`), `coluna ${column} ausente`);
  }
});

test('user_id e obrigatorio e workspace_id e opcional (nulo = nao amarrado a um workspace)', async () => {
  const sql = await migration();
  assert.match(sql, /user_id uuid not null references auth\.users\(id\) on delete cascade,/);
  assert.match(sql, /workspace_id uuid references public\.workspaces\(id\) on delete cascade,/);
  assert.doesNotMatch(sql, /workspace_id uuid not null/);
});

test('endpoint e globalmente unico -- chave de idempotencia via upsert', async () => {
  const sql = await migration();
  assert.match(sql, /constraint push_subscriptions_endpoint_key unique \(endpoint\)/);
});

test('RLS habilitado e as tres policies (select/insert/update) restritas ao proprio usuario', async () => {
  const sql = await migration();
  assert.match(sql, /alter table public\.push_subscriptions enable row level security;/);
  for (const policy of ['push_subscriptions_select_own', 'push_subscriptions_insert_own', 'push_subscriptions_update_own']) {
    assert.match(sql, new RegExp(`create policy ${policy}`));
  }
  const usingMatches = sql.match(/using \(\(select auth\.uid\(\)\) = user_id\)/g) ?? [];
  assert.ok(usingMatches.length >= 2, 'select e update devem restringir por auth.uid() = user_id');
  assert.match(sql, /with check \(\(select auth\.uid\(\)\) = user_id\)/);
});

test('nenhuma policy de DELETE -- desativar e sempre soft-revoke (revoked_at), nunca exclusao fisica', async () => {
  const sql = await migration();
  assert.doesNotMatch(sql, /for delete/);
});

test('grant de UPDATE restrito por coluna -- cliente nunca reescreve user_id, endpoint, created_at ou id via UPDATE', async () => {
  const sql = await migration();
  assert.match(
    sql,
    /grant update \(p256dh, auth, platform, updated_at, last_seen_at, revoked_at\)\s*\n\s*on table public\.push_subscriptions to authenticated;/,
  );
});

test('revoke all antes dos grants -- privilegio minimo, mesmo padrao das migrations anteriores', async () => {
  const sql = await migration();
  const revokeIndex = sql.indexOf('revoke all on table public.push_subscriptions from anon, authenticated;');
  const grantIndex = sql.indexOf('grant select, insert on table public.push_subscriptions to authenticated;');
  assert.ok(revokeIndex >= 0 && grantIndex > revokeIndex, 'revoke deve vir antes dos grants');
});

test('indice cobre a listagem de subscriptions ativas por usuario', async () => {
  const sql = await migration();
  assert.match(
    sql,
    /create index push_subscriptions_user_active_idx\s*\n\s*on public\.push_subscriptions \(user_id\)\s*\n\s*where revoked_at is null;/,
  );
});

test('migration comeca com begin e termina com commit -- atomica, mesmo padrao das demais migrations', async () => {
  const sql = await migration();
  assert.match(sql.trim(), /^begin;/);
  assert.match(sql.trim(), /commit;$/);
});

test('nao altera nenhuma tabela/policy/coluna de outra fase (aditiva, isolada)', async () => {
  const sql = await migration();
  assert.doesNotMatch(sql, /drop table|drop column|drop policy|alter table public\.notifications/);
});
