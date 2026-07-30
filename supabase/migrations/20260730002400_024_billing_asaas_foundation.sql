begin;

-- BILLING1 (Bloco Asaas 1): fundacao de infraestrutura para assinaturas via
-- Asaas. Nenhuma chamada externa, nenhuma cobranca real -- apenas schema.
-- Decisoes comerciais congeladas em docs/00-master/PLANO_INTEGRACAO_ASAAS.md
-- (Bloco Asaas 0): plano unico "Plano Pessoal" = plan_id 'pro' (linha ja
-- existente em plans, sem alteracao nesta migration), Pix/Pix
-- Automatico/Cartao (sem boleto), ativacao so apos confirmacao via
-- webhook, cancelamento nao corta acesso imediato (cancel_at_period_end),
-- inadimplencia com tolerancia de 3 dias antes de suspender (novo estado
-- 'suspended').
--
-- Estrategia aditiva (nunca quebra migrations existentes): todas as
-- colunas novas em subscriptions sao nullable ou tem default seguro; o
-- check constraint de status e recriado apenas para ADICIONAR valores
-- novos ('pending', 'suspended'), nunca removendo os ja existentes
-- ('trialing', 'active', 'past_due', 'canceled', 'expired') -- nenhuma
-- linha ja gravada e invalidada por essa ampliacao.

-- Colunas aditivas em subscriptions ------------------------------------
alter table public.subscriptions
  add column asaas_customer_id text,
  add column asaas_subscription_id text,
  add column payment_method text,
  add column cancel_at_period_end boolean not null default false,
  add column cancel_effective_at timestamptz;

alter table public.subscriptions
  add constraint subscriptions_payment_method_check
  check (
    payment_method is null
    or payment_method in ('pix', 'pix_automatico', 'credit_card')
  );

-- Amplia o status check constraint para incluir 'pending' (aguardando
-- confirmacao do webhook) e 'suspended' (inadimplencia apos 3 dias de
-- tolerancia) -- ver matriz de estados em PLANO_INTEGRACAO_ASAAS.md 0.4.
-- 'trialing'/'past_due' permanecem no constraint por compatibilidade (a
-- ampliacao so adiciona valores, nunca remove) -- ver SUBSCRIPTION_STATUS
-- em src/services/billing/billingTypes.js para o mapeamento oficial
-- usado pelo app (OVERDUE aponta para o valor legado 'past_due').
alter table public.subscriptions
  drop constraint subscriptions_status_check;

alter table public.subscriptions
  add constraint subscriptions_status_check check (
    status in (
      'trialing', 'active', 'past_due', 'canceled', 'expired',
      'pending', 'suspended'
    )
  );

create index subscriptions_asaas_customer_id_idx
  on public.subscriptions (asaas_customer_id)
  where asaas_customer_id is not null;

create index subscriptions_asaas_subscription_id_idx
  on public.subscriptions (asaas_subscription_id)
  where asaas_subscription_id is not null;

comment on column public.subscriptions.asaas_customer_id is
  'BILLING1: ID do cliente correspondente na Asaas; nulo ate a primeira cobranca.';
comment on column public.subscriptions.asaas_subscription_id is
  'BILLING1: ID da assinatura recorrente na Asaas; nulo ate a assinatura ser criada.';
comment on column public.subscriptions.payment_method is
  'BILLING1: forma de pagamento escolhida (pix, pix_automatico ou credit_card). Boleto fora do MVP (decisao comercial, Bloco Asaas 0).';
comment on column public.subscriptions.cancel_at_period_end is
  'BILLING1: cancelamento agendado -- true quando o usuario pediu para nao renovar, mas o acesso continua ate current_period_ends_at (cancelamento nunca corta acesso imediatamente, decisao comercial).';
comment on column public.subscriptions.cancel_effective_at is
  'BILLING1: data em que o cancelamento agendado realmente encerra o acesso.';

-- billing_customers --------------------------------------------------------
-- Vinculo workspace <-> cliente Asaas. Escrita 100% backend/service-role,
-- mesmo padrao ja usado por subscriptions -- o cliente nunca cria/altera
-- diretamente.
create table public.billing_customers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  asaas_customer_id text not null,
  cpf_cnpj text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index billing_customers_asaas_customer_id_uidx
  on public.billing_customers (asaas_customer_id);

create index billing_customers_workspace_id_idx
  on public.billing_customers (workspace_id);

create trigger billing_customers_set_updated_at
before update on public.billing_customers
for each row execute function public.set_updated_at();

alter table public.billing_customers enable row level security;

-- Usuario so enxerga o vinculo de billing do proprio workspace -- nunca
-- de outro. Escrita reservada ao backend (service role bypassa RLS).
create policy billing_customers_select_active_member
on public.billing_customers
for select
to authenticated
using (public.is_workspace_member(workspace_id));

revoke all on table public.billing_customers from anon, authenticated;
grant select on table public.billing_customers to authenticated;

comment on table public.billing_customers is
  'BILLING1: vinculo workspace/cliente Asaas. Escrita reservada ao backend (service role) via Edge Functions de billing.';
comment on column public.billing_customers.cpf_cnpj is
  'Documento exigido pela Asaas na criacao do cliente -- nunca logado em texto livre nas Edge Functions.';

-- billing_payments -----------------------------------------------------------
-- Historico de cobrancas espelhado da Asaas -- alimenta a tela "Historico
-- de pagamentos" (hoje sempre vazia) e a conciliacao. Escrita 100%
-- backend/service-role (billing-webhook).
create table public.billing_payments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  asaas_payment_id text not null,
  asaas_subscription_id text,
  status text not null,
  billing_type text,
  value numeric(12, 2) not null,
  due_date date,
  paid_at timestamptz,
  invoice_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_payments_status_check check (
    status in ('pending', 'confirmed', 'received', 'overdue', 'refunded', 'chargeback', 'canceled')
  ),
  constraint billing_payments_billing_type_check check (
    billing_type is null
    or billing_type in ('pix', 'pix_automatico', 'credit_card')
  ),
  constraint billing_payments_value_check check (value >= 0)
);

create unique index billing_payments_asaas_payment_id_uidx
  on public.billing_payments (asaas_payment_id);

create index billing_payments_workspace_status_idx
  on public.billing_payments (workspace_id, status);

create index billing_payments_asaas_subscription_id_idx
  on public.billing_payments (asaas_subscription_id)
  where asaas_subscription_id is not null;

create trigger billing_payments_set_updated_at
before update on public.billing_payments
for each row execute function public.set_updated_at();

alter table public.billing_payments enable row level security;

create policy billing_payments_select_active_member
on public.billing_payments
for select
to authenticated
using (public.is_workspace_member(workspace_id));

revoke all on table public.billing_payments from anon, authenticated;
grant select on table public.billing_payments to authenticated;

comment on table public.billing_payments is
  'BILLING1: historico de cobrancas espelhado da Asaas. Escrita reservada ao backend (service role) via billing-webhook.';

-- webhook_events ---------------------------------------------------------
-- Idempotencia e auditoria de webhook -- toda notificacao recebida da
-- Asaas e gravada aqui ANTES de qualquer processamento, para nunca
-- processar o mesmo evento duas vezes (webhook duplicado e garantido pela
-- propria Asaas, nao uma excecao). Sem NENHUM acesso de cliente -- so a
-- Edge Function billing-webhook (service role) le/escreve esta tabela.
create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  asaas_event_id text not null,
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  processing_error text,
  received_at timestamptz not null default now()
);

create unique index webhook_events_asaas_event_id_uidx
  on public.webhook_events (asaas_event_id);

create index webhook_events_event_type_idx
  on public.webhook_events (event_type);

create index webhook_events_processed_at_idx
  on public.webhook_events (processed_at);

alter table public.webhook_events enable row level security;

-- Nenhuma policy criada de proposito: com RLS habilitado e zero policies,
-- authenticated/anon nunca enxergam nenhuma linha, mesmo que um select
-- fosse concedido -- por isso nem concedemos select. Unico acesso
-- possivel e via service role (Edge Function), que ignora RLS por padrao.
revoke all on table public.webhook_events from anon, authenticated;

comment on table public.webhook_events is
  'BILLING1: idempotencia e auditoria de webhooks da Asaas. Nenhum acesso de cliente -- somente a Edge Function billing-webhook (service role).';

commit;
