begin;

-- Projetos: nucleo de dados (Fase 13, Subfase 13.3). Uma unica tabela cobre
-- o MVP aprovado (lista funcional com CRUD real). Tarefas, subtarefas,
-- Kanban, Calendario, Timeline, comentarios, anexos e integracoes externas
-- sao explicitamente fora de escopo -- nenhuma coluna relacionada a isso
-- existe aqui. Progresso e manual nesta fase, sem derivacao de tarefas.

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'planned',
  priority text not null default 'medium',
  progress integer not null default 0,
  starts_at date,
  due_at date,
  client_id uuid references public.clients(id) on delete set null,
  assigned_user_id uuid references auth.users(id) on delete set null,
  financial_impact numeric(18, 2),
  next_milestone text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint projects_name_not_blank check (length(btrim(name)) > 0),
  constraint projects_status_check check (
    status in ('planned', 'active', 'on_hold', 'completed', 'cancelled')
  ),
  constraint projects_priority_check check (
    priority in ('low', 'medium', 'high', 'urgent')
  ),
  constraint projects_progress_check check (progress between 0 and 100),
  constraint projects_due_at_check check (
    due_at is null or starts_at is null or due_at >= starts_at
  ),
  constraint projects_financial_impact_check check (
    financial_impact is null or financial_impact >= 0
  )
);

comment on table public.projects is
  'MVP de Projetos (Fase 13): lista funcional com CRUD real, isolada por workspace. Fora do escopo desta fase e desta tabela: tarefas, subtarefas, Kanban, Calendario, Timeline, comentarios, anexos e integracoes externas -- nenhuma coluna antecipatoria foi criada para elas.';
comment on column public.projects.status is
  'planned (default) / active / on_hold / completed / cancelled. Editavel livremente, sem regra de transicao fechada nesta fase.';
comment on column public.projects.priority is
  'low / medium (default) / high / urgent.';
comment on column public.projects.progress is
  'Percentual manual (0-100), definido pelo usuario. Nao derivado de tarefas nesta fase.';
comment on column public.projects.starts_at is
  'Data (sem horario) -- Projetos nao exige granularidade de hora no MVP, diferente de agenda_items.starts_at.';
comment on column public.projects.due_at is
  'Data (sem horario), opcional. Quando starts_at tambem estiver presente, deve ser >= starts_at (constraint projects_due_at_check).';
comment on column public.projects.client_id is
  'Vinculo OPCIONAL de contexto com um cliente do CRM. ON DELETE SET NULL (vinculo fraco, mesmo padrao de agenda_items.client_id) -- o projeto sobrevive e so perde a referencia. Editavel livremente apos a criacao.';
comment on column public.projects.assigned_user_id is
  'Responsavel pelo projeto. Deve ser membro ativo do mesmo workspace -- validado por trigger, nao por constraint. Mesmo padrao de clients.assigned_user_id/agenda_items.assigned_user_id (referencia direta a auth.users, sem tabela funcionarios).';
comment on column public.projects.financial_impact is
  'Valor apenas informativo nesta fase -- sem vinculo com transactions. Moeda implicita do workspace, mesmo tipo numeric(18,2) de transactions.amount.';
comment on column public.projects.next_milestone is
  'Texto livre, sem tabela de milestones nesta fase.';

create index projects_workspace_status_idx
  on public.projects (workspace_id, status);

create index projects_workspace_due_idx
  on public.projects (workspace_id, due_at);

create index projects_client_idx
  on public.projects (client_id);

create index projects_workspace_assigned_idx
  on public.projects (workspace_id, assigned_user_id);

-- updated_at: reaproveita a funcao ja existente (20260710_001), nenhuma nova.
create trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

-- Imutabilidade de workspace_id e created_by, mesmo padrao de
-- prevent_agenda_items_immutable_field_change (20260722_017). client_id
-- deliberadamente NAO entra aqui -- ver comentario da coluna acima.
create or replace function public.prevent_projects_immutable_field_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.workspace_id is distinct from old.workspace_id then
    raise exception 'projects: workspace_id cannot be changed after creation';
  end if;
  if new.created_by is distinct from old.created_by then
    raise exception 'projects: created_by cannot be changed after creation';
  end if;
  return new;
end;
$$;

create trigger projects_prevent_immutable_field_change
before update on public.projects
for each row execute function public.prevent_projects_immutable_field_change();

-- Validacao de assigned_user_id: deve ser membro ativo do mesmo workspace.
-- SEM security definer -- mesma justificativa de
-- validate_agenda_item_assigned_user: a RLS de workspace_members (select
-- liberado para qualquer membro ativo do mesmo workspace) ja permite essa
-- leitura para quem esta autorizado a criar/editar o projeto.
create or replace function public.validate_project_assigned_user()
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

create trigger projects_validate_assigned_user
before insert or update on public.projects
for each row execute function public.validate_project_assigned_user();

-- Validacao de client_id: se informado, deve existir e pertencer ao mesmo
-- workspace do projeto. SEM security definer -- a policy de select de
-- clients ja libera leitura a qualquer membro ativo do mesmo workspace
-- (mesmo raciocinio ja usado em validate_agenda_item_client). client_id e
-- editavel (nao imutavel), entao esta validacao roda em insert e em update.
create or replace function public.validate_project_client()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_client_workspace_id uuid;
begin
  if new.client_id is null then
    return new;
  end if;

  select workspace_id
    into v_client_workspace_id
    from public.clients
    where id = new.client_id;

  if not found then
    raise exception 'projects: client % not found or not accessible', new.client_id;
  end if;

  if v_client_workspace_id is distinct from new.workspace_id then
    raise exception 'projects: client belongs to a different workspace';
  end if;

  return new;
end;
$$;

create trigger projects_validate_client
before insert or update on public.projects
for each row execute function public.validate_project_client();

alter table public.projects enable row level security;

create policy projects_select_active_member
on public.projects
for select
to authenticated
using (public.is_workspace_member(workspace_id));

create policy projects_insert_active_contributor
on public.projects
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and public.is_workspace_member(
    workspace_id,
    array['owner', 'admin', 'member']::text[]
  )
);

create policy projects_update_active_contributor
on public.projects
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

create policy projects_delete_owner_or_admin
on public.projects
for delete
to authenticated
using (
  public.is_workspace_member(
    workspace_id,
    array['owner', 'admin']::text[]
  )
);

commit;
