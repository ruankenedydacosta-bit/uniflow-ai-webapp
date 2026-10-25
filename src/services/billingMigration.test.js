import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = () => readFile(
  new URL('../../supabase/migrations/20260730002400_024_billing_asaas_foundation.sql', import.meta.url),
  'utf8',
);
const operationAttemptsMigration = () => readFile(
  new URL('../../supabase/migrations/20261025150000_050_billing_operation_attempts.sql', import.meta.url),
  'utf8',
);

// ============================================================================
// BILLING1 (Bloco Asaas 1) -- migration de fundação da infraestrutura de
// assinaturas via Asaas. Cobertura estrutural do SQL (mesmo padrão já usado
// por notificationsMigration.test.js e confirmedFinancialActionService.test.js):
// colunas aditivas, RLS, isolamento por workspace, grants mínimos, sem
// alterar nenhuma migration antiga. Nenhuma chamada externa, nenhuma
// migration foi aplicada -- só o arquivo SQL é auditado como texto.
// ============================================================================

test('migration começa com begin e termina com commit -- atômica, mesmo padrão das demais migrations', async () => {
  const sql = await migration();
  assert.match(sql.trim(), /^begin;/);
  assert.match(sql.trim(), /commit;$/);
});

test('migration 050 serializa customer/subscription por workspace e plano, com tentativas ambíguas sem retry automático', async () => {
  const sql = await operationAttemptsMigration();
  assert.match(sql.trim(), /^begin;/);
  assert.match(sql.trim(), /commit;$/);
  assert.match(sql, /create table public\.billing_operation_attempts/);
  assert.match(sql, /operation in \('customer', 'subscription'\)/);
  assert.match(sql, /status in \('processing', 'uncertain', 'completed', 'failed'\)/);
  assert.match(sql, /unique index billing_operation_attempts_scope_uidx[\s\S]*operation, workspace_id, coalesce\(plan_id, ''\)/);
  assert.match(sql, /alter table public\.billing_operation_attempts enable row level security/);
  assert.match(sql, /revoke all on table public\.billing_operation_attempts from anon, authenticated/);
  assert.match(sql, /grant select, insert, update on table public\.billing_operation_attempts to service_role/);
});

test('subscriptions ganha as 5 colunas aditivas previstas -- nenhuma delas é "not null" sem default seguro', async () => {
  const sql = await migration();
  const idx = sql.indexOf('alter table public.subscriptions');
  const slice = sql.slice(idx, idx + 500);
  assert.match(slice, /add column asaas_customer_id text,/);
  assert.match(slice, /add column asaas_subscription_id text,/);
  assert.match(slice, /add column payment_method text,/);
  assert.match(slice, /add column cancel_at_period_end boolean not null default false,/);
  assert.match(slice, /add column cancel_effective_at timestamptz;/);
});

test('payment_method é restrito a pix/pix_automatico/credit_card -- nunca boleto', async () => {
  const sql = await migration();
  assert.match(
    sql,
    /constraint subscriptions_payment_method_check\s*\n\s*check \(\s*\n\s*payment_method is null\s*\n\s*or payment_method in \('pix', 'pix_automatico', 'credit_card'\)/,
  );
  assert.doesNotMatch(sql, /'boleto'/);
});

test('status check constraint é AMPLIADO (nunca recriado removendo valores) -- adiciona pending e suspended, preserva trialing/active/past_due/canceled/expired', async () => {
  const sql = await migration();
  assert.match(sql, /drop constraint subscriptions_status_check;/);
  const idx = sql.indexOf('add constraint subscriptions_status_check check (');
  assert.ok(idx > -1);
  const slice = sql.slice(idx, idx + 300);
  for (const status of ['trialing', 'active', 'past_due', 'canceled', 'expired', 'pending', 'suspended']) {
    assert.match(slice, new RegExp(`'${status}'`), `status ${status} ausente do constraint ampliado`);
  }
});

test('drop do constraint antigo vem ANTES do add do novo -- nunca dois constraints com o mesmo nome simultaneamente', async () => {
  const sql = await migration();
  const dropIdx = sql.indexOf('drop constraint subscriptions_status_check;');
  const addIdx = sql.indexOf('add constraint subscriptions_status_check check (');
  assert.ok(dropIdx > -1 && addIdx > -1 && dropIdx < addIdx);
});

test('tabela billing_customers tem as colunas mínimas exigidas e isolamento por workspace', async () => {
  const sql = await migration();
  assert.match(sql, /create table public\.billing_customers \(/);
  for (const column of ['id', 'workspace_id', 'asaas_customer_id', 'cpf_cnpj', 'email', 'created_at', 'updated_at']) {
    const idx = sql.indexOf('create table public.billing_customers (');
    const slice = sql.slice(idx, sql.indexOf(');', idx));
    assert.match(slice, new RegExp(`\\b${column}\\b`), `coluna ${column} ausente em billing_customers`);
  }
  assert.match(sql, /workspace_id uuid not null references public\.workspaces\(id\) on delete cascade,\s*\n\s*asaas_customer_id text not null,/);
});

test('billing_customers: asaas_customer_id é único (índice único), workspace_id tem índice de busca', async () => {
  const sql = await migration();
  assert.match(sql, /create unique index billing_customers_asaas_customer_id_uidx\s*\n\s*on public\.billing_customers \(asaas_customer_id\);/);
  assert.match(sql, /create index billing_customers_workspace_id_idx\s*\n\s*on public\.billing_customers \(workspace_id\);/);
});

test('billing_customers: RLS habilitado, select restrito a membro ativo do workspace, sem nenhum grant de escrita para o cliente', async () => {
  const sql = await migration();
  const idx = sql.indexOf('create table public.billing_customers');
  const nextTableIdx = sql.indexOf('create table public.billing_payments');
  const slice = sql.slice(idx, nextTableIdx);
  assert.match(slice, /alter table public\.billing_customers enable row level security;/);
  assert.match(
    slice,
    /create policy billing_customers_select_active_member\s*\n\s*on public\.billing_customers\s*\n\s*for select\s*\n\s*to authenticated\s*\n\s*using \(public\.is_workspace_member\(workspace_id\)\);/,
  );
  assert.match(slice, /revoke all on table public\.billing_customers from anon, authenticated;/);
  assert.match(slice, /grant select on table public\.billing_customers to authenticated;/);
  assert.doesNotMatch(slice, /grant insert.*billing_customers/);
  assert.doesNotMatch(slice, /grant update.*billing_customers/);
  assert.doesNotMatch(slice, /grant delete.*billing_customers/);
});

test('tabela billing_payments tem as colunas e constraints mínimas, sem boleto em billing_type', async () => {
  const sql = await migration();
  const idx = sql.indexOf('create table public.billing_payments (');
  assert.ok(idx > -1);
  const slice = sql.slice(idx, sql.indexOf('create unique index billing_payments_asaas_payment_id_uidx'));
  for (const column of ['workspace_id', 'asaas_payment_id', 'asaas_subscription_id', 'status', 'billing_type', 'value', 'due_date', 'paid_at', 'invoice_url']) {
    assert.match(slice, new RegExp(`\\b${column}\\b`), `coluna ${column} ausente em billing_payments`);
  }
  assert.match(
    slice,
    /constraint billing_payments_status_check check \(\s*\n\s*status in \('pending', 'confirmed', 'received', 'overdue', 'refunded', 'chargeback', 'canceled'\)/,
  );
  assert.match(
    slice,
    /constraint billing_payments_billing_type_check check \(\s*\n\s*billing_type is null\s*\n\s*or billing_type in \('pix', 'pix_automatico', 'credit_card'\)/,
  );
  assert.doesNotMatch(slice, /'boleto'/);
  assert.match(slice, /constraint billing_payments_value_check check \(value >= 0\)/);
});

test('billing_payments: RLS habilitado, select restrito a membro do workspace, sem grant de escrita para o cliente', async () => {
  const sql = await migration();
  const idx = sql.indexOf('create table public.billing_payments');
  const nextTableIdx = sql.indexOf('create table public.webhook_events');
  const slice = sql.slice(idx, nextTableIdx);
  assert.match(slice, /alter table public\.billing_payments enable row level security;/);
  assert.match(
    slice,
    /create policy billing_payments_select_active_member\s*\n\s*on public\.billing_payments\s*\n\s*for select\s*\n\s*to authenticated\s*\n\s*using \(public\.is_workspace_member\(workspace_id\)\);/,
  );
  assert.match(slice, /revoke all on table public\.billing_payments from anon, authenticated;/);
  assert.match(slice, /grant select on table public\.billing_payments to authenticated;/);
  assert.doesNotMatch(slice, /grant insert.*billing_payments/);
  assert.doesNotMatch(slice, /grant update.*billing_payments/);
});

test('tabela webhook_events existe com as colunas de idempotência/auditoria', async () => {
  const sql = await migration();
  const idx = sql.indexOf('create table public.webhook_events (');
  assert.ok(idx > -1);
  const slice = sql.slice(idx, sql.indexOf(');', idx));
  for (const column of ['asaas_event_id', 'event_type', 'payload', 'processed_at', 'processing_error', 'received_at']) {
    assert.match(slice, new RegExp(`\\b${column}\\b`), `coluna ${column} ausente em webhook_events`);
  }
  assert.match(sql, /create unique index webhook_events_asaas_event_id_uidx\s*\n\s*on public\.webhook_events \(asaas_event_id\);/);
});

test('webhook_events: RLS habilitado, mas SEM NENHUMA policy nem grant para anon/authenticated -- acesso só via service role', async () => {
  const sql = await migration();
  const idx = sql.indexOf('create table public.webhook_events');
  const slice = sql.slice(idx);
  assert.match(slice, /alter table public\.webhook_events enable row level security;/);
  assert.doesNotMatch(slice, /create policy webhook_events/);
  assert.match(slice, /revoke all on table public\.webhook_events from anon, authenticated;/);
  assert.doesNotMatch(slice, /grant select on table public\.webhook_events/);
  assert.doesNotMatch(slice, /grant insert.*webhook_events/);
  assert.doesNotMatch(slice, /grant update.*webhook_events/);
});

test('nenhuma migration antiga é referenciada para edição -- só alter table/create table novos, nenhum "drop table"', async () => {
  const sql = await migration();
  assert.doesNotMatch(sql, /drop table/i);
  assert.doesNotMatch(sql, /alter table public\.plans/i, 'plans não deve ser alterada -- "Plano Pessoal" reaproveita a linha "pro" já existente');
});

test('comentários de coluna documentam a decisão comercial (cancelamento não corta acesso imediato)', async () => {
  const sql = await migration();
  assert.match(
    sql,
    /comment on column public\.subscriptions\.cancel_at_period_end is\s*\n\s*'BILLING1: cancelamento agendado/,
  );
});
