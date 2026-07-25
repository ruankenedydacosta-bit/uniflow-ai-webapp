import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION = readFileSync(
  join(__dirname, '..', '..', '..', 'supabase', 'migrations', '20260725_022_support.sql'),
  'utf8',
);

test('migration é atômica (begin/commit)', () => {
  assert.match(MIGRATION, /^begin;/);
  assert.match(MIGRATION, /\ncommit;\s*$/);
});

test('conversation_type é aditivo: default financial, nunca quebra linhas existentes', () => {
  assert.match(MIGRATION, /add column conversation_type text not null default 'financial'/);
  assert.match(MIGRATION, /check \(conversation_type in \('financial', 'support'\)\)/);
});

test('support_requests tem RLS habilitada', () => {
  assert.match(MIGRATION, /alter table public\.support_requests enable row level security;/);
});

test('usuário só vê as próprias solicitações (select restrito a auth.uid())', () => {
  const policyBlock = MIGRATION.slice(
    MIGRATION.indexOf('create policy support_requests_select_own'),
    MIGRATION.indexOf('create policy support_requests_insert_own'),
  );
  assert.match(policyBlock, /using \(\(select auth\.uid\(\)\) = user_id\)/);
});

test('usuário pode criar a própria solicitação (insert com check auth.uid() = user_id)', () => {
  const policyBlock = MIGRATION.slice(
    MIGRATION.indexOf('create policy support_requests_insert_own'),
    MIGRATION.indexOf('create trigger support_requests_set_updated_at'),
  );
  assert.match(policyBlock, /with check \(\(select auth\.uid\(\)\) = user_id\)/);
});

test('nenhuma policy de update/delete para authenticated -- usuário nunca edita status (fica para service role futuro)', () => {
  assert.doesNotMatch(MIGRATION, /create policy support_requests_update/);
  assert.doesNotMatch(MIGRATION, /create policy support_requests_delete/);
  assert.match(MIGRATION, /grant select on table public\.support_requests to authenticated;/);
  assert.match(MIGRATION, /grant insert \([^)]*\)\s*\n\s*on public\.support_requests to authenticated;/);
});

test('status válidos são exatamente open, in_review, resolved, closed', () => {
  assert.match(MIGRATION, /check \(status in \('open', 'in_review', 'resolved', 'closed'\)\)/);
});

test('categorias cobrem o vocabulário exigido pela fase', () => {
  for (const cat of [
    'acesso_conta', 'financeiro', 'chat_uni', 'voz', 'notificacoes',
    'pessoal_empresa', 'erro_tecnico', 'cobranca_plano', 'privacidade_seguranca', 'outro',
  ]) {
    assert.match(MIGRATION, new RegExp(`'${cat}'`));
  }
});

test('limites de tamanho aplicados no banco (defesa em profundidade, nunca só client-side)', () => {
  assert.match(MIGRATION, /char_length\(subject\) between 1 and 150/);
  assert.match(MIGRATION, /char_length\(description\) between 1 and 4000/);
});

test('conversation_id é apenas uma referência opcional -- nunca copia o histórico da conversa', () => {
  assert.match(MIGRATION, /conversation_id uuid references public\.uni_conversations\(id\) on delete set null/);
  assert.doesNotMatch(MIGRATION, /messages? (jsonb|text\[\])/);
});

test('workspace_id é opcional (nullable) em support_requests, diferente do uni_conversations original', () => {
  const tableBlock = MIGRATION.slice(
    MIGRATION.indexOf('create table public.support_requests'),
    MIGRATION.indexOf('create index support_requests_user_idx'),
  );
  assert.doesNotMatch(tableBlock, /workspace_id uuid not null/);
});
