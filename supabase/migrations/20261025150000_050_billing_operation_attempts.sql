begin;

-- Serializa a criacao de customers e subscriptions antes da chamada externa.
-- Um timeout ou encerramento do worker deixa a tentativa em `processing`;
-- novas requisicoes nao repetem um POST potencialmente aceito pela Asaas.
create table public.billing_operation_attempts (
  id uuid primary key default gen_random_uuid(),
  operation text not null check (operation in ('customer', 'subscription')),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  plan_id text references public.plans(id) on delete restrict,
  status text not null default 'processing'
    check (status in ('processing', 'uncertain', 'completed', 'failed')),
  provider_resource_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_operation_attempt_plan_check check (
    (operation = 'customer' and plan_id is null)
    or (operation = 'subscription' and plan_id is not null)
  )
);

create unique index billing_operation_attempts_scope_uidx
  on public.billing_operation_attempts (operation, workspace_id, coalesce(plan_id, ''));

create trigger billing_operation_attempts_set_updated_at
before update on public.billing_operation_attempts
for each row execute function public.set_updated_at();

alter table public.billing_operation_attempts enable row level security;
revoke all on table public.billing_operation_attempts from anon, authenticated;
grant select, insert, update on table public.billing_operation_attempts to service_role;

comment on table public.billing_operation_attempts is
  'Issue 56: durable serialization for Asaas customer/subscription POSTs. Ambiguous attempts remain blocked until reconciliation; never retry blindly.';

commit;
