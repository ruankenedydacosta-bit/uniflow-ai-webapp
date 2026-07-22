begin;

-- Agenda: schema base (Fase 8, Subfase 8.1). Uma unica tabela cobre os 7
-- tipos de item aprovados (meeting/appointment/task/payment_due/receivable/
-- reminder/other) -- nao ha necessidade de tabelas separadas por tipo nesta
-- fase. Recorrencia e integracao com Google Calendar sao explicitamente
-- fora de escopo -- nenhuma coluna relacionada a isso existe aqui.

create table public.agenda_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  item_type text not null,
  title text not null,
  description text,
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  is_all_day boolean not null default false,
  status text not null default 'scheduled',
  client_id uuid references public.clients(id) on delete set null,
  assigned_user_id uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint agenda_items_title_not_blank check (length(btrim(title)) > 0),
  constraint agenda_items_item_type_check check (
    item_type in (
      'meeting', 'appointment', 'task', 'payment_due',
      'receivable', 'reminder', 'other'
    )
  ),
  constraint agenda_items_status_check check (
    status in ('scheduled', 'completed', 'cancelled')
  ),
  constraint agenda_items_ends_at_check check (
    ends_at is null or ends_at >= starts_at
  )
);

comment on column public.agenda_items.item_type is
  'Tipo tecnico fechado (meeting/appointment/task/payment_due/receivable/reminder/other). Obrigatorio, sem default -- a UI sempre exige escolha explicita. Rotulos em pt-BR (ex.: "Reuniao", "Tarefa") vivem so na aplicacao, nunca no banco.';
comment on column public.agenda_items.starts_at is
  'Sempre timestamptz (instante absoluto, UTC internamente). Conversao para hora local e feita so no cliente, mesmo padrao ja usado em clients.last_contact_at.';
comment on column public.agenda_items.ends_at is
  'Opcional -- null significa item sem duracao definida (lembrete/tarefa pontual). Quando presente, deve ser >= starts_at (constraint agenda_items_ends_at_check).';
comment on column public.agenda_items.is_all_day is
  'Marca um item como "dia inteiro". O banco NAO normaliza starts_at/ends_at para limites de dia -- e responsabilidade da aplicacao definir os limites corretos ao gravar; nenhuma validacao de horario especifico e imposta aqui (sem beneficio comprovado nesta fase).';
comment on column public.agenda_items.status is
  'scheduled (default) / completed / cancelled. Sem estado de reabertura nem is_archived separado -- redundante com status, mesmo raciocinio ja usado em crm_opportunities.outcome.';
comment on column public.agenda_items.client_id is
  'Vinculo OPCIONAL de contexto com um cliente do CRM. ON DELETE SET NULL (nao bloqueia exclusao do cliente, diferente de crm_opportunities.client_id) porque aqui o vinculo e fraco, nao uma relacao estrutural obrigatoria -- o item de agenda sobrevive e so perde a referencia. Editavel livremente apos a criacao (nao e imutavel): corrigir o cliente vinculado e uma edicao legitima, nao a criacao implicita de um novo registro.';
comment on column public.agenda_items.assigned_user_id is
  'Responsavel pelo item (recurso do CRM Enterprise, sem UI nesta fase). Deve ser membro ativo do mesmo workspace -- validado por trigger, nao por constraint. Mesmo padrao de clients.assigned_user_id.';

create index agenda_items_workspace_starts_idx
  on public.agenda_items (workspace_id, starts_at);

create index agenda_items_workspace_status_idx
  on public.agenda_items (workspace_id, status);

create index agenda_items_client_idx
  on public.agenda_items (client_id);

create index agenda_items_workspace_assigned_idx
  on public.agenda_items (workspace_id, assigned_user_id);

-- updated_at: reaproveita a funcao ja existente (20260710_001), nenhuma nova.
create trigger agenda_items_set_updated_at
before update on public.agenda_items
for each row execute function public.set_updated_at();

-- Imutabilidade de workspace_id e created_by, mesmo padrao de
-- clients_prevent_immutable_field_change (20260721_015). client_id
-- deliberadamente NAO entra aqui -- ver comentario da coluna acima.
create or replace function public.prevent_agenda_items_immutable_field_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.workspace_id is distinct from old.workspace_id then
    raise exception 'agenda_items: workspace_id cannot be changed after creation';
  end if;
  if new.created_by is distinct from old.created_by then
    raise exception 'agenda_items: created_by cannot be changed after creation';
  end if;
  return new;
end;
$$;

create trigger agenda_items_prevent_immutable_field_change
before update on public.agenda_items
for each row execute function public.prevent_agenda_items_immutable_field_change();

-- Validacao de assigned_user_id: deve ser membro ativo do mesmo workspace.
-- SEM security definer -- mesma justificativa de validate_client_assigned_user:
-- a RLS de workspace_members (select liberado para qualquer membro ativo do
-- mesmo workspace) ja permite essa leitura para quem esta autorizado a
-- criar/editar o item.
create or replace function public.validate_agenda_item_assigned_user()
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

create trigger agenda_items_validate_assigned_user
before insert or update on public.agenda_items
for each row execute function public.validate_agenda_item_assigned_user();

-- Validacao de client_id: se informado, deve existir e pertencer ao mesmo
-- workspace do item de agenda. SEM security definer -- a policy de select
-- de clients ja libera leitura a qualquer membro ativo do mesmo workspace
-- (mesmo raciocinio ja usado em validate_crm_opportunity_relationships).
-- client_id e editavel (nao imutavel), entao esta validacao roda em insert
-- e em update.
create or replace function public.validate_agenda_item_client()
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
    raise exception 'agenda_items: client % not found or not accessible', new.client_id;
  end if;

  if v_client_workspace_id is distinct from new.workspace_id then
    raise exception 'agenda_items: client belongs to a different workspace';
  end if;

  return new;
end;
$$;

create trigger agenda_items_validate_client
before insert or update on public.agenda_items
for each row execute function public.validate_agenda_item_client();

alter table public.agenda_items enable row level security;

create policy agenda_items_select_active_member
on public.agenda_items
for select
to authenticated
using (public.is_workspace_member(workspace_id));

create policy agenda_items_insert_active_contributor
on public.agenda_items
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and public.is_workspace_member(
    workspace_id,
    array['owner', 'admin', 'member']::text[]
  )
);

create policy agenda_items_update_active_contributor
on public.agenda_items
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

create policy agenda_items_delete_owner_or_admin
on public.agenda_items
for delete
to authenticated
using (
  public.is_workspace_member(
    workspace_id,
    array['owner', 'admin']::text[]
  )
);

commit;
