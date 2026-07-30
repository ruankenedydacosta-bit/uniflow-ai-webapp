begin;

-- CRM: base de clientes (Fase 7.1). Schema unico para os planos Business
-- (CRM Basico) e Enterprise (CRM completo) -- a diferenca entre planos fica
-- so na aplicacao (services/hooks/UI), nao no schema. `assigned_user_id` e
-- um recurso exclusivo do Enterprise, mas a coluna ja existe desde o dia 1
-- para nao exigir migration nova quando o Enterprise for ligado.

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity_type text not null default 'person',
  lifecycle_stage text not null default 'lead',
  relationship_status text,
  name text not null,
  primary_contact_name text,
  email text,
  phone text,
  document_number text,
  estimated_value numeric not null default 0,
  last_contact_at timestamptz,
  next_action text,
  assigned_user_id uuid references auth.users(id) on delete set null,
  is_archived boolean not null default false,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint clients_name_not_blank check (length(btrim(name)) > 0),
  constraint clients_entity_type_check check (
    entity_type in ('person', 'company')
  ),
  constraint clients_lifecycle_stage_check check (
    lifecycle_stage in ('lead', 'potential', 'active', 'at_risk', 'inactive')
  ),
  constraint clients_relationship_status_check check (
    relationship_status is null or relationship_status in (
      'new', 'in_negotiation', 'waiting_customer',
      'waiting_company', 'in_delivery', 'completed', 'paused'
    )
  ),
  constraint clients_estimated_value_non_negative check (estimated_value >= 0)
);

comment on column public.clients.entity_type is
  'Tipo estrutural do registro: person (pessoa) ou company (empresa). Nao representa o momento comercial -- ver lifecycle_stage.';
comment on column public.clients.lifecycle_stage is
  'Momento comercial do relacionamento: lead, potential, active, at_risk ou inactive. Independente de entity_type.';
comment on column public.clients.relationship_status is
  'Condicao operacional mais especifica (ex.: in_negotiation, waiting_customer), opcional e ortogonal a lifecycle_stage.';
comment on column public.clients.assigned_user_id is
  'Responsavel pelo cliente (recurso do CRM Enterprise). Deve ser membro ativo do mesmo workspace -- validado por trigger, nao por constraint.';

create index clients_workspace_lifecycle_idx
  on public.clients (workspace_id, lifecycle_stage);

create index clients_workspace_assigned_idx
  on public.clients (workspace_id, assigned_user_id);

create index clients_workspace_archived_idx
  on public.clients (workspace_id, is_archived);

-- updated_at: reaproveita a funcao ja existente (20260710_001), nenhuma nova.
create trigger clients_set_updated_at
before update on public.clients
for each row execute function public.set_updated_at();

-- Imutabilidade de workspace_id e created_by apos a criacao (correcao
-- solicitada). CHECK constraints nao alcancam OLD, por isso e um trigger.
create or replace function public.prevent_clients_immutable_field_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.workspace_id is distinct from old.workspace_id then
    raise exception 'workspace_id cannot be changed after creation';
  end if;
  if new.created_by is distinct from old.created_by then
    raise exception 'created_by cannot be changed after creation';
  end if;
  return new;
end;
$$;

create trigger clients_prevent_immutable_field_change
before update on public.clients
for each row execute function public.prevent_clients_immutable_field_change();

-- Validacao de assigned_user_id: deve ser membro ativo do mesmo workspace.
-- SEM security definer -- a RLS de workspace_members (select liberado para
-- qualquer membro ativo do mesmo workspace) ja permite essa leitura para
-- quem esta autorizado a criar/editar o cliente (ver policies abaixo).
create or replace function public.validate_client_assigned_user()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.assigned_user_id is not null and not exists (
    select 1
    from public.workspace_members
    where workspace_id = new.workspace_id
      and user_id = new.assigned_user_id
      and status = 'active'
  ) then
    raise exception 'assigned_user_id must be an active member of the workspace';
  end if;
  return new;
end;
$$;

create trigger clients_validate_assigned_user
before insert or update on public.clients
for each row execute function public.validate_client_assigned_user();

alter table public.clients enable row level security;

create policy clients_select_active_member
on public.clients
for select
to authenticated
using (public.is_workspace_member(workspace_id));

create policy clients_insert_active_contributor
on public.clients
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and public.is_workspace_member(
    workspace_id,
    array['owner', 'admin', 'member']::text[]
  )
);

create policy clients_update_active_contributor
on public.clients
for update
to authenticated
using (
  public.is_workspace_member(
    workspace_id,
    array['owner', 'admin', 'member']::text[]
  )
)
with check (
  public.is_workspace_member(
    workspace_id,
    array['owner', 'admin', 'member']::text[]
  )
);

create policy clients_delete_owner_or_admin
on public.clients
for delete
to authenticated
using (
  public.is_workspace_member(
    workspace_id,
    array['owner', 'admin']::text[]
  )
);

commit;
