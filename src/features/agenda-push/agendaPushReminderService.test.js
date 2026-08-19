import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = () => readFile(new URL('./agendaPushReminderService.js', import.meta.url), 'utf8');

// ============================================================================
// AGPUSH1 -- agendaPushReminderService.js. Sem Supabase real configurado em
// teste, mesmo padrao de cobertura estrutural ja usado por
// pushSubscriptionService.test.js.
// ============================================================================

test('le so as colunas necessarias -- nunca decision_token (fora do GRANT de SELECT do cliente, migration 043)', async () => {
  const content = await source();
  const selectCall = content.slice(content.indexOf(".select('"), content.indexOf("')", content.indexOf(".select('")) + 2);
  assert.doesNotMatch(selectCall, /decision_token/);
  for (const column of ['prompt_sent_at', 'reminder_offset_minutes', 'reminder_decision_at', 'reminder_sent_at']) {
    assert.match(selectCall, new RegExp(column));
  }
});

test('filtra por agenda_item_id -- RLS (agenda_push_reminders_select_own) ja restringe ao proprio usuario, sem necessidade de filtrar user_id aqui', async () => {
  const content = await source();
  assert.match(content, /\.eq\('agenda_item_id', agendaItemId\)/);
});

test('sem agenda_item_id, retorna cedo sem chamar o Supabase', async () => {
  const content = await source();
  assert.match(content, /if \(!agendaItemId\) return createResult\(null\);/);
});

test('sem Supabase configurado, retorna cedo sem lancar', async () => {
  const content = await source();
  assert.match(content, /if \(!supabase\) return createUnavailableResult\(null\);/);
});

test('usa maybeSingle -- ausencia de linha (pergunta nunca enviada) e um resultado valido, nunca um erro', async () => {
  const content = await source();
  assert.match(content, /\.maybeSingle\(\);/);
});

test('retorna { data, error, isConfigured } -- mesmo contrato dos demais services do repositorio', async () => {
  const content = await source();
  assert.match(
    content,
    /function createResult\(data, error = null\) \{\s*\n\s*return \{\s*\n\s*data,\s*\n\s*error,\s*\n\s*isConfigured: isSupabaseConfigured,\s*\n\s*\};/,
  );
});
