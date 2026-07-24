import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = () => readFile(
  new URL('../../../supabase/migrations/20260724_020_notifications.sql', import.meta.url),
  'utf8',
);

// ============================================================================
// NOTIF1 -- migration da tabela notifications. Cobertura estrutural do SQL
// (mesmo padrao ja usado por confirmedFinancialActionService.test.js para as
// migrations 008/009): RLS, isolamento por usuario/workspace, grants
// minimos, sem alterar nenhuma migration antiga.
// ============================================================================

test('tabela notifications tem as colunas minimas exigidas pela NOTIF1', async () => {
  const sql = await migration();
  assert.match(sql, /create table public\.notifications \(/);
  for (const column of ['id', 'user_id', 'workspace_id', 'type', 'title', 'message', 'action_url', 'metadata', 'read_at', 'created_at']) {
    assert.match(sql, new RegExp(`\\b${column}\\b`), `coluna ${column} ausente`);
  }
});

test('user_id e obrigatorio e workspace_id e opcional (nulo = notificacao global)', async () => {
  const sql = await migration();
  assert.match(sql, /user_id uuid not null references auth\.users\(id\) on delete cascade,/);
  assert.match(sql, /workspace_id uuid references public\.workspaces\(id\) on delete cascade,/);
  assert.doesNotMatch(sql, /workspace_id uuid not null/);
});

test('type restrito aos 6 tipos suportados via check constraint', async () => {
  const sql = await migration();
  assert.match(
    sql,
    /constraint notifications_type_check check \(\s*\n\s*type in \('financeiro', 'metas', 'agenda', 'crm', 'sistema', 'uni'\)/,
  );
});

test('action_url tem defesa em profundidade no banco -- nunca URL absoluta nem protocol-relative', async () => {
  const sql = await migration();
  assert.match(
    sql,
    /constraint notifications_action_url_internal_check check \(\s*\n\s*action_url is null\s*\n\s*or \(action_url like '\/%' and action_url not like '\/\/%'\)/,
  );
});

test('RLS habilitado e policy de select restrita ao proprio usuario -- isolamento por usuario', async () => {
  const sql = await migration();
  assert.match(sql, /alter table public\.notifications enable row level security;/);
  assert.match(
    sql,
    /create policy notifications_select_own\s*\n\s*on public\.notifications\s*\n\s*for select\s*\n\s*to authenticated\s*\n\s*using \(\(select auth\.uid\(\)\) = user_id\);/,
  );
});

test('policy de update tambem restrita ao proprio usuario (using + with check), sem acesso entre usuarios', async () => {
  const sql = await migration();
  assert.match(
    sql,
    /create policy notifications_update_own\s*\n\s*on public\.notifications\s*\n\s*for update\s*\n\s*to authenticated\s*\n\s*using \(\(select auth\.uid\(\)\) = user_id\)\s*\n\s*with check \(\(select auth\.uid\(\)\) = user_id\);/,
  );
});

test('policy de insert restrita ao proprio usuario -- seeds locais nunca criam notificacao para outra pessoa', async () => {
  const sql = await migration();
  assert.match(
    sql,
    /create policy notifications_insert_own\s*\n\s*on public\.notifications\s*\n\s*for insert\s*\n\s*to authenticated\s*\n\s*with check \(\(select auth\.uid\(\)\) = user_id\);/,
  );
});

test('nao existe policy de delete -- cliente nunca pode apagar notificacoes', async () => {
  const sql = await migration();
  assert.doesNotMatch(sql, /for delete/);
});

test('grants minimos: update do cliente restrito a read_at (titulo/mensagem/tipo nunca editaveis depois de criados)', async () => {
  const sql = await migration();
  assert.match(sql, /grant update \(read_at\)\s*\n\s*on public\.notifications to authenticated;/);
});

test('revoke all antes dos grants -- privilegio minimo, mesmo padrao das migrations anteriores', async () => {
  const sql = await migration();
  const revokeIndex = sql.indexOf('revoke all on table public.notifications from anon, authenticated;');
  const grantIndex = sql.indexOf('grant select on table public.notifications to authenticated;');
  assert.ok(revokeIndex >= 0 && grantIndex > revokeIndex, 'revoke deve vir antes dos grants');
});

test('indices cobrem listagem por usuario (created_at desc) e contagem de nao lidas (indice parcial)', async () => {
  const sql = await migration();
  assert.match(sql, /create index notifications_user_created_idx\s*\n\s*on public\.notifications \(user_id, created_at desc\);/);
  assert.match(
    sql,
    /create index notifications_user_unread_idx\s*\n\s*on public\.notifications \(user_id\)\s*\n\s*where read_at is null;/,
  );
});

test('migration comeca com begin e termina com commit -- atomica, mesmo padrao das demais migrations', async () => {
  const sql = await migration();
  assert.match(sql.trim(), /^begin;/);
  assert.match(sql.trim(), /commit;$/);
});
