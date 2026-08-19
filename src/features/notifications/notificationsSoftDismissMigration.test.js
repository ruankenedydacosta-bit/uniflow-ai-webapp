import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = () => readFile(
  new URL('../../../supabase/migrations/20260819120000_041_notifications_soft_dismiss.sql', import.meta.url),
  'utf8',
);

// ============================================================================
// NOTIF3 -- troca dismiss de exclusão física (NOTIF2/040) por soft-dismiss
// (dismissed_at). A recriação de notificações de agenda depois de dispensadas
// (bug real encontrado na auditoria) só é corrigida porque a linha continua
// existindo -- ver agendaNotificationSync.js/listAgendaNotificationItemIds.
// ============================================================================

test('adiciona dismissed_at nullable, sem default e sem backfill', async () => {
  const sql = await migration();
  assert.match(sql, /alter table public\.notifications\s*\n\s*add column dismissed_at timestamptz;/);
  assert.doesNotMatch(sql, /update public\.notifications[\s\S]*dismissed_at/);
});

test('reaproveita a policy de UPDATE existente -- so estende o GRANT de coluna, nao cria nova policy', async () => {
  const sql = await migration();
  assert.doesNotMatch(sql, /create policy notifications_update/);
  assert.match(
    sql,
    /grant update \(read_at, dismissed_at\)\s*\n\s*on table public\.notifications to authenticated;/,
  );
});

test('remove a capacidade de DELETE do cliente -- dismiss nunca mais e exclusao fisica', async () => {
  const sql = await migration();
  assert.match(sql, /drop policy notifications_delete_own on public\.notifications;/);
  assert.match(sql, /revoke delete on table public\.notifications from authenticated;/);
});

test('migration comeca com begin e termina com commit -- atomica, mesmo padrao das demais migrations', async () => {
  const sql = await migration();
  assert.match(sql.trim(), /^begin;/);
  assert.match(sql.trim(), /commit;$/);
});

test('nao altera nem remove nenhuma coluna/policy anterior alem da policy de delete que substitui', async () => {
  const sql = await migration();
  assert.doesNotMatch(sql, /drop table|drop column/);
  const dropPolicyMatches = sql.match(/drop policy/g) ?? [];
  assert.equal(dropPolicyMatches.length, 1);
});
