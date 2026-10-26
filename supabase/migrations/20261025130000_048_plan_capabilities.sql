begin;

-- Fonte persistida e única das capacidades de produto por plano. A migration
-- só acrescenta catálogo e policies; não altera nem migra assinaturas atuais.
create table public.plan_capabilities (
  plan_id text not null references public.plans(id) on delete restrict,
  capability_id text not null,
  created_at timestamptz not null default now(),
  constraint plan_capabilities_capability_id_check
    check (capability_id in ('reports', 'business_features')),
  constraint plan_capabilities_pkey primary key (plan_id, capability_id)
);

insert into public.plan_capabilities (plan_id, capability_id)
values
  ('pro', 'reports'),
  ('business', 'reports'),
  ('business', 'business_features'),
  ('enterprise', 'reports'),
  ('enterprise', 'business_features')
on conflict (plan_id, capability_id) do nothing;

alter table public.plan_capabilities enable row level security;
revoke all on table public.plan_capabilities from public, anon, authenticated;
grant select on table public.plan_capabilities to authenticated;

drop policy if exists plan_capabilities_select_active_plan on public.plan_capabilities;
create policy plan_capabilities_select_active_plan
on public.plan_capabilities
for select
to authenticated
using (
  exists (
    select 1
    from public.plans as plan
    where plan.id = plan_id
      and plan.active = true
  )
);

create or replace function public.workspace_has_plan_capability(
  target_workspace_id uuid,
  target_capability_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with latest_subscription as (
    select
      subscription.workspace_id,
      subscription.plan_id,
      subscription.status,
      subscription.current_period_ends_at
    from public.subscriptions as subscription
    where subscription.workspace_id = target_workspace_id
    order by subscription.created_at desc, subscription.id desc
    limit 1
  )
  select exists (
    select 1
    from latest_subscription as subscription
    join public.plans as plan
      on plan.id = subscription.plan_id
      and plan.active = true
    join public.plan_capabilities as capability
      on capability.plan_id = plan.id
    join public.workspaces as workspace
      on workspace.id = subscription.workspace_id
    where capability.capability_id = target_capability_id
      and (
        subscription.status in ('trialing', 'active', 'past_due')
        or (
          subscription.status = 'canceled'
          and subscription.current_period_ends_at > statement_timestamp()
        )
      )
      and (
        target_capability_id <> 'business_features'
        or workspace.workspace_type = 'business'
      )
      and public.is_workspace_member(target_workspace_id)
  );
$$;

revoke all on function public.workspace_has_plan_capability(uuid, text) from public, anon;
grant execute on function public.workspace_has_plan_capability(uuid, text) to authenticated;

-- Restrictive policies AND the plan entitlement with the existing membership
-- and role policies, so no permissive policy can bypass the Business plan gate.
drop policy if exists clients_require_business_plan on public.clients;
create policy clients_require_business_plan
on public.clients
as restrictive
for all
to authenticated
using (public.workspace_has_plan_capability(workspace_id, 'business_features'))
with check (public.workspace_has_plan_capability(workspace_id, 'business_features'));

drop policy if exists crm_pipeline_stages_require_business_plan on public.crm_pipeline_stages;
create policy crm_pipeline_stages_require_business_plan
on public.crm_pipeline_stages
as restrictive
for all
to authenticated
using (public.workspace_has_plan_capability(workspace_id, 'business_features'))
with check (public.workspace_has_plan_capability(workspace_id, 'business_features'));

drop policy if exists crm_opportunities_require_business_plan on public.crm_opportunities;
create policy crm_opportunities_require_business_plan
on public.crm_opportunities
as restrictive
for all
to authenticated
using (public.workspace_has_plan_capability(workspace_id, 'business_features'))
with check (public.workspace_has_plan_capability(workspace_id, 'business_features'));

drop policy if exists projects_require_business_plan on public.projects;
create policy projects_require_business_plan
on public.projects
as restrictive
for all
to authenticated
using (public.workspace_has_plan_capability(workspace_id, 'business_features'))
with check (public.workspace_has_plan_capability(workspace_id, 'business_features'));

comment on table public.plan_capabilities is
  'Fonte canonica das capacidades de produto por plano. Leitura de assinaturas e gating RLS consultam este catalogo.';
comment on function public.workspace_has_plan_capability(uuid, text) is
  'Retorna uma capacidade apenas para membro ativo do workspace com assinatura elegivel e plano ativo.';

commit;
