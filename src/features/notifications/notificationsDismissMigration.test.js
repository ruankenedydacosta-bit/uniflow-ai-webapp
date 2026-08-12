import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = () => readFile(
  new URL('../../../supabase/migrations/20260812190000_040_notifications_dismiss.sql', import.meta.url),
  'utf8',
);

// ============================================================================
// NOTIF2 -- dispensar (excluir) uma notificação, e cascade automático de
// notificação de agenda quando o compromisso correspondente é excluído.
// ============================================================================

test('agenda_item_id e uma FK real para agenda_items com on delete cascade -- a exclusao do compromisso remove a notificacao no proprio banco', async () => {
  const sql = await migration();
  assert.match(
    sql,
    /alter table public\.notifications\s*\n\s*add column agenda_item_id uuid references public\.agenda_items\(id\) on delete cascade;/,
  );
});

test('backfill preenche agenda_item_id a partir de metadata para notificacoes de agenda ja existentes, so quando o compromisso referenciado ainda existe (evita violar a FK com orfas)', async () => {
  const sql = await migration();
  assert.match(
    sql,
    /update public\.notifications as n\s*\n\s*set agenda_item_id = \(n\.metadata->>'agenda_item_id'\)::uuid\s*\n\s*where n\.type = 'agenda'/,
  );
  assert.match(sql, /exists \(\s*\n\s*select 1 from public\.agenda_items as ai\s*\n\s*where ai\.id = \(n\.metadata->>'agenda_item_id'\)::uuid\s*\n\s*\)/);
});

test('trigger before insert preenche agenda_item_id sozinho -- nenhum client precisa mudar (continua so escrevendo metadata)', async () => {
  const sql = await migration();
  assert.match(sql, /create or replace function public\.notifications_set_agenda_item_id\(\)/);
  assert.match(sql, /security definer\s*\n\s*set search_path = ''/);
  assert.match(
    sql,
    /create trigger notifications_set_agenda_item_id_trigger\s*\n\s*before insert on public\.notifications\s*\n\s*for each row\s*\n\s*execute function public\.notifications_set_agenda_item_id\(\);/,
  );
});

test('nova policy de delete restrita ao proprio usuario -- dispensar nunca afeta notificacao de outro usuario', async () => {
  const sql = await migration();
  assert.match(
    sql,
    /create policy notifications_delete_own\s*\n\s*on public\.notifications\s*\n\s*for delete\s*\n\s*to authenticated\s*\n\s*using \(\(select auth\.uid\(\)\) = user_id\);/,
  );
  assert.match(sql, /grant delete on table public\.notifications to authenticated;/);
});

test('migration comeca com begin e termina com commit -- atomica, mesmo padrao das demais migrations', async () => {
  const sql = await migration();
  assert.match(sql.trim(), /^begin;/);
  assert.match(sql.trim(), /commit;$/);
});

test('nao altera nem remove nenhuma coluna/policy da migration 020 (aditiva)', async () => {
  const sql = await migration();
  assert.doesNotMatch(sql, /drop table|drop column|drop policy/);
});
