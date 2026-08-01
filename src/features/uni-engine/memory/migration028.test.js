// Teste estrutural da migration 028 — Memória Inteligente Persistente (Fase 3).
// Mesmo padrão de billingMigration.test.js / notificationsMigration.test.js:
// auditoria do arquivo SQL como texto, sem aplicação remota.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = () => readFile(
  new URL('../../../../supabase/migrations/20260801_028_uni_engine_memory.sql', import.meta.url),
  'utf8',
);

test('m01: migration começa com begin e termina com commit — atômica', async () => {
  const sql = await migration();
  assert.match(sql, /\nbegin;/);
  assert.match(sql.trim(), /commit;$/);
});

test('m02: tabela uni_engine_memory_items tem colunas mínimas do contrato Fase 3', async () => {
  const sql = await migration();
  const idx = sql.indexOf('create table public.uni_engine_memory_items (');
  const slice = sql.slice(idx, sql.indexOf(');', idx));
  for (const column of [
    'id', 'user_id', 'workspace_id', 'conversation_id', 'memory_type',
    'subject_key', 'value_json', 'normalized_value', 'status', 'confidence',
    'evidence_count', 'source', 'first_seen_at', 'last_seen_at', 'confirmed_at',
    'expires_at', 'superseded_by', 'metadata', 'created_at', 'updated_at',
  ]) {
    assert.match(slice, new RegExp(`\\b${column}\\b`), `coluna ${column} ausente`);
  }
  assert.match(slice, /user_id uuid not null references auth\.users\(id\) on delete cascade,/);
  assert.match(slice, /workspace_id uuid not null references public\.workspaces\(id\) on delete cascade,/);
});

test('m03: enums fechados espelham os contratos (tipo, status, source)', async () => {
  const sql = await migration();
  for (const type of [
    'user_preference', 'conversation_preference', 'account_preference',
    'category_preference', 'merchant_category_association',
    'merchant_account_association', 'user_correction', 'recurring_pattern',
    'user_declared_fact', 'episodic_context', 'procedure_preference',
  ]) {
    assert.match(sql, new RegExp(`'${type}'`), `memory_type ${type} ausente`);
  }
  for (const status of ['candidate', 'confirmed', 'active', 'contested', 'superseded', 'expired', 'deleted', 'rejected']) {
    assert.match(sql, new RegExp(`'${status}'`), `status ${status} ausente`);
  }
  for (const source of ['user', 'conversation', 'engine', 'financial', 'system']) {
    assert.match(sql, new RegExp(`'${source}'`), `source ${source} ausente`);
  }
});

test('m04: subject_key bloqueia conteúdo sensível no próprio banco', async () => {
  const sql = await migration();
  assert.match(sql, /constraint uni_engine_memory_items_key_safe_check check \(/);
  assert.match(sql, /!~ '\(token\|secret\|password\|credential\|certificate\|private_key\|audio\|transcript\)'/);
});

test('m05: value/metadata usam o validador JSON seguro da memória financeira', async () => {
  const sql = await migration();
  assert.match(sql, /public\.uni_memory_json_is_safe\(value_json\)/);
  assert.match(sql, /public\.uni_memory_json_is_safe\(metadata\)/);
  assert.match(sql, /jsonb_typeof\(value_json\) = 'object'/);
  assert.match(sql, /octet_length\(value_json::text\) <= 16384/);
});

test('m06: confiança 0..1, evidências limitadas e ordem temporal coerente', async () => {
  const sql = await migration();
  assert.match(sql, /constraint uni_engine_memory_items_confidence_check check \(\s*\n\s*confidence between 0 and 1/);
  assert.match(sql, /constraint uni_engine_memory_items_evidence_count_check check \(\s*\n\s*evidence_count between 0 and 200/);
  assert.match(sql, /constraint uni_engine_memory_items_observation_order_check check \(\s*\n\s*last_seen_at >= first_seen_at/);
});

test('m07: expiração é lógica — status expired exige expires_at; nunca deleta', async () => {
  const sql = await migration();
  assert.match(sql, /constraint uni_engine_memory_items_expired_status_check check \(\s*\n\s*status <> 'expired' or expires_at is not null/);
});

test('m08: superseded exige superseded_by válido e confirmed exige confirmed_at', async () => {
  const sql = await migration();
  assert.match(sql, /constraint uni_engine_memory_items_superseded_status_check check \(/);
  assert.match(sql, /status <> 'superseded' and superseded_by is null/);
  assert.match(sql, /constraint uni_engine_memory_items_confirmed_status_check check \(/);
  assert.match(sql, /status in \('confirmed', 'active'\) and confirmed_at is not null/);
});

test('m09: uma única identidade ativa por (usuário, workspace, tipo, sujeito)', async () => {
  const sql = await migration();
  assert.match(sql, /create unique index uni_engine_memory_items_active_identity_uidx\s*\n\s*on public\.uni_engine_memory_items \(user_id, workspace_id, memory_type, subject_key\)\s*\n\s*where status in \('candidate', 'confirmed', 'active'\);/);
});

test('m10: evidência tem idempotência determinística por (memory_id, evidence_key)', async () => {
  const sql = await migration();
  const idx = sql.indexOf('create table public.uni_engine_memory_evidence (');
  const slice = sql.slice(idx, sql.indexOf(');', idx));
  for (const column of ['memory_id', 'user_id', 'workspace_id', 'evidence_type', 'source_message_id', 'observed_value', 'weight', 'occurred_at', 'evidence_key']) {
    assert.match(slice, new RegExp(`\\b${column}\\b`), `coluna ${column} ausente em evidence`);
  }
  assert.match(slice, /constraint uni_engine_memory_evidence_type_check check \(evidence_type in \(/);
  for (const type of ['explicit_user_statement', 'user_confirmation', 'user_correction', 'repeated_selection', 'accepted_suggestion', 'rejected_suggestion', 'behavior_pattern', 'system_observation']) {
    assert.match(slice, new RegExp(`'${type}'`), `evidence_type ${type} ausente`);
  }
  assert.match(slice, /constraint uni_engine_memory_evidence_weight_check check \(\s*\n\s*weight between -1 and 1/);
  assert.match(sql, /create unique index uni_engine_memory_evidence_key_uidx\s*\n\s*on public\.uni_engine_memory_evidence \(memory_id, evidence_key\);/);
  assert.match(slice, /references public\.uni_engine_memory_items\(id\)\s*\n\s*on delete cascade/);
});

test('m11: frontend só cria memória para o próprio usuário (triggers)', async () => {
  const sql = await migration();
  assert.match(sql, /create or replace function public\.protect_uni_engine_memory_insert\(\)/);
  assert.match(sql, /if new\.user_id <> auth\.uid\(\) then/);
  assert.match(sql, /create or replace function public\.protect_uni_engine_memory_evidence_insert\(\)/);
  assert.match(sql, /new\.user_id <> auth\.uid\(\s*\)\s*\n\s*or not exists \(/);
  assert.match(sql, /create trigger uni_engine_memory_items_protect_frontend\s*\n\s*before insert on public\.uni_engine_memory_items/);
  assert.match(sql, /create trigger uni_engine_memory_evidence_protect_frontend\s*\n\s*before insert on public\.uni_engine_memory_evidence/);
});

test('m12: RLS habilitado nas duas tabelas com isolamento por usuário e membro do workspace', async () => {
  const sql = await migration();
  assert.match(sql, /alter table public\.uni_engine_memory_items enable row level security;/);
  assert.match(sql, /alter table public\.uni_engine_memory_evidence enable row level security;/);
  const count = (sql.match(/user_id = auth\.uid\(\)/g) ?? []).length;
  assert.ok(count >= 4, 'políticas de select/insert/update/delete exigem user_id = auth.uid()');
  assert.match(sql, /public\.is_workspace_member\(workspace_id\)/);
});

test('m13: grants mínimos — anon bloqueado, autenticado só nas colunas permitidas', async () => {
  const sql = await migration();
  assert.match(sql, /revoke all on table public\.uni_engine_memory_items from anon, authenticated;/);
  assert.match(sql, /revoke all on table public\.uni_engine_memory_evidence from anon, authenticated;/);
  assert.match(sql, /grant select on table public\.uni_engine_memory_items to authenticated;/);
  assert.match(sql, /grant select on table public\.uni_engine_memory_evidence to authenticated;/);
  assert.match(sql, /grant insert \(\s*\n\s*user_id, workspace_id, conversation_id, memory_type, subject_key, value_json,/);
  assert.match(sql, /grant update \(\s*\n\s*status, confidence, evidence_count, last_seen_at, confirmed_at, expires_at,/);
  assert.doesNotMatch(sql, /grant insert \(\s*\n\s*id,/);
});

test('m14: migration é aditiva — nenhum drop, nenhuma alteração de tabela existente', async () => {
  const sql = await migration();
  assert.doesNotMatch(sql, /drop table/i);
  assert.doesNotMatch(sql, /drop column/i);
  assert.doesNotMatch(sql, /alter table public\.(uni_financial_memories|transactions|accounts|categories|profiles|workspaces)/);
  assert.doesNotMatch(sql, /alter table public\.uni_financial_memories/, 'não altera a memória financeira existente');
});

test('m15: comentários documentam a decisão (confiança só para ranking nesta fase)', async () => {
  const sql = await migration();
  assert.match(sql, /comment on column public\.uni_engine_memory_items\.confidence is\s*\n\s*'MEMORY3: 0\.\.1; nesta fase define apenas ranking — nunca autoriza execução\.'/);
  assert.match(sql, /comment on table public\.uni_engine_memory_items is\s*\n\s*'MEMORY3: memórias seletivas/);
});
