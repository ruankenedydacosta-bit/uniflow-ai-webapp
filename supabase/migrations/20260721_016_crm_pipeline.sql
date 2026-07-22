begin;

-- CRM: fundacao do pipeline comercial (Subfase 7.5.1). Duas tabelas novas:
-- crm_pipeline_stages (colunas do Kanban) e crm_opportunities (negociacoes,
-- vinculadas a um cliente e a uma etapa). clients e crm_opportunities
-- permanecem deliberadamente desacoplados nesta fase -- ver comentarios
-- especificos abaixo. Nenhuma coluna de outcome/is_closed na etapa: o
-- resultado comercial vive exclusivamente em crm_opportunities.outcome.

create table public.crm_pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  position smallint not null,
  is_default boolean not null default false,
  is_archived boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint crm_pipeline_stages_name_not_blank check (length(btrim(name)) > 0),
  constraint crm_pipeline_stages_position_non_negative check (position >= 0)
);

comment on column public.crm_pipeline_stages.position is
  'Ordenacao da coluna no Kanban. Sem constraint de unicidade proposital -- nesta fase posicao e so ordenacao, nao identidade; reordenacao atomica e duplicidade acidental ficam para o futuro service de configuracao de etapas.';
comment on column public.crm_pipeline_stages.is_default is
  'Marca as 5 etapas semeadas automaticamente (seed), distinguindo de etapas que um usuario venha a criar no futuro (fora do escopo desta fase).';
comment on column public.crm_pipeline_stages.created_by is
  'Nulo para etapas semeadas pelo sistema (seed). Sem default auth.uid() -- nao ha ainda nenhum fluxo de criacao de etapa pelo usuario nesta fase.';

create table public.crm_opportunities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid not null references public.clients(id),
  stage_id uuid not null references public.crm_pipeline_stages(id),
  title text not null,
  estimated_value numeric not null default 0,
  outcome text not null default 'open',
  stage_entered_at timestamptz not null default now(),
  assigned_user_id uuid references auth.users(id) on delete set null,
  position integer not null default 0,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint crm_opportunities_title_not_blank check (length(btrim(title)) > 0),
  constraint crm_opportunities_estimated_value_non_negative check (estimated_value >= 0),
  constraint crm_opportunities_position_non_negative check (position >= 0),
  constraint crm_opportunities_outcome_check check (
    outcome in ('open', 'won', 'lost', 'cancelled')
  )
);

comment on column public.crm_opportunities.client_id is
  'Imutavel apos a criacao (trigger). Sem on delete cascade/set null de proposito -- excluir um cliente com oportunidades vinculadas deve falhar por FK, nunca apagar ou orfanar a negociacao em silencio.';
comment on column public.crm_opportunities.stage_id is
  'Sem on delete cascade/set null pelo mesmo motivo de client_id -- excluir uma etapa com oportunidades vinculadas deve falhar por FK.';
comment on column public.crm_opportunities.outcome is
  'Resultado comercial (open/won/lost/cancelled). Nao significa exclusao logica -- registros com outcome != open continuam armazenados e consultaveis. Nao existe is_archived nesta tabela: seria redundante com outcome.';
comment on column public.crm_opportunities.assigned_user_id is
  'Responsavel pela oportunidade (recurso do CRM Enterprise, sem UI nesta fase). Mesmo padrao de clients.assigned_user_id.';
comment on column public.crm_opportunities.position is
  'Reservado para ordenacao manual/drag-and-drop futuro. Nesta fase os cards sao ordenados por created_at, esta coluna so evita uma migration nova quando essa funcionalidade chegar.';

create index crm_pipeline_stages_workspace_position_idx
  on public.crm_pipeline_stages (workspace_id, position);

create index crm_opportunities_workspace_stage_idx
  on public.crm_opportunities (workspace_id, stage_id);

create index crm_opportunities_client_idx
  on public.crm_opportunities (client_id);

create index crm_opportunities_workspace_outcome_idx
  on public.crm_opportunities (workspace_id, outcome);

-- Nao criamos (workspace_id, is_archived, position) em crm_pipeline_stages:
-- o volume esperado por workspace e pequeno (5 etapas padrao + eventuais
-- etapas customizadas futuras, nunca centenas), entao o indice
-- (workspace_id, position) ja acima ja cobre a ordenacao e um filtro extra
-- de is_archived sobre poucas linhas nao justifica um indice composto
-- adicional agora -- sem beneficio comprovado no tamanho de tabela
-- esperado.

-- updated_at: reaproveita a funcao ja existente (20260710_001), nenhuma nova.
create trigger crm_pipeline_stages_set_updated_at
before update on public.crm_pipeline_stages
for each row execute function public.set_updated_at();

create trigger crm_opportunities_set_updated_at
before update on public.crm_opportunities
for each row execute function public.set_updated_at();

-- Imutabilidade de crm_pipeline_stages (workspace_id, created_by), mesmo
-- padrao de clients_prevent_immutable_field_change (20260721_015).
create or replace function public.prevent_crm_pipeline_stages_immutable_field_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.workspace_id is distinct from old.workspace_id then
    raise exception 'crm_pipeline_stages: workspace_id cannot be changed after creation';
  end if;
  if new.created_by is distinct from old.created_by then
    raise exception 'crm_pipeline_stages: created_by cannot be changed after creation';
  end if;
  return new;
end;
$$;

create trigger crm_pipeline_stages_prevent_immutable_field_change
before update on public.crm_pipeline_stages
for each row execute function public.prevent_crm_pipeline_stages_immutable_field_change();

-- Imutabilidade de crm_opportunities (workspace_id, client_id, created_by).
-- client_id imutavel por decisao aprovada: reatribuir a outro cliente e
-- semanticamente "criar uma nova oportunidade", nao "editar" a existente.
create or replace function public.prevent_crm_opportunities_immutable_field_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.workspace_id is distinct from old.workspace_id then
    raise exception 'crm_opportunities: workspace_id cannot be changed after creation';
  end if;
  if new.client_id is distinct from old.client_id then
    raise exception 'crm_opportunities: client_id cannot be changed after creation';
  end if;
  if new.created_by is distinct from old.created_by then
    raise exception 'crm_opportunities: created_by cannot be changed after creation';
  end if;
  return new;
end;
$$;

create trigger crm_opportunities_prevent_immutable_field_change
before update on public.crm_opportunities
for each row execute function public.prevent_crm_opportunities_immutable_field_change();

-- stage_entered_at: atualizado automaticamente somente quando stage_id
-- muda (nunca ao editar so titulo/valor). Independente dos demais triggers
-- desta tabela -- so escreve em NEW.stage_entered_at, nunca le nem depende
-- do resultado de outro trigger.
create or replace function public.set_crm_opportunity_stage_entered_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.stage_id is distinct from old.stage_id then
    new.stage_entered_at = now();
  end if;
  return new;
end;
$$;

create trigger crm_opportunities_set_stage_entered_at
before update on public.crm_opportunities
for each row execute function public.set_crm_opportunity_stage_entered_at();

-- Integridade entre workspaces + estado de arquivamento, consolidadas numa
-- unica funcao (reduz ambiguidade de qual trigger falhou por qual motivo).
-- Roda em insert e update; distingue os 3 casos:
--   1. insert: cliente e etapa devem pertencer ao mesmo workspace_id da
--      oportunidade, cliente nao pode estar arquivado, etapa nao pode
--      estar arquivada.
--   2. update com mudanca de stage_id (mover de coluna): a nova etapa deve
--      pertencer ao mesmo workspace e nao pode estar arquivada. client_id
--      nunca muda (imutavel, ja bloqueado no trigger anterior), entao a
--      checagem de cliente arquivado so faz sentido no insert.
--   3. update de outros campos (titulo, valor, outcome) sem mudar stage_id:
--      nao reexecuta nenhuma checagem de arquivamento -- uma oportunidade
--      existente nao fica bloqueada so porque o cliente foi arquivado
--      depois.
--
-- Sem security definer: o usuario que chega ate aqui ja passou pela policy
-- de insert/update de crm_opportunities (portanto ja e membro ativo do
-- workspace_id da oportunidade); a policy de select de clients/
-- crm_pipeline_stages libera leitura a qualquer membro ativo do MESMO
-- workspace dessas tabelas. Se client_id/stage_id apontar para outro
-- workspace ao qual o usuario nao pertence, a select abaixo retorna zero
-- linhas (RLS ja esconde) e cai no "not found"; se o usuario pertencer a
-- ambos os workspaces, a comparacao explicita de workspace_id pega o caso.
create or replace function public.validate_crm_opportunity_relationships()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_client_workspace_id uuid;
  v_client_is_archived boolean;
  v_stage_workspace_id uuid;
  v_stage_is_archived boolean;
begin
  select workspace_id, is_archived
    into v_client_workspace_id, v_client_is_archived
    from public.clients
    where id = new.client_id;

  if not found then
    raise exception 'crm_opportunities: client % not found or not accessible', new.client_id;
  end if;

  if v_client_workspace_id is distinct from new.workspace_id then
    raise exception 'crm_opportunities: client belongs to a different workspace';
  end if;

  select workspace_id, is_archived
    into v_stage_workspace_id, v_stage_is_archived
    from public.crm_pipeline_stages
    where id = new.stage_id;

  if not found then
    raise exception 'crm_opportunities: stage % not found or not accessible', new.stage_id;
  end if;

  if v_stage_workspace_id is distinct from new.workspace_id then
    raise exception 'crm_opportunities: stage belongs to a different workspace';
  end if;

  if TG_OP = 'INSERT' then
    if v_client_is_archived then
      raise exception 'crm_opportunities: cannot create an opportunity for an archived client';
    end if;
    if v_stage_is_archived then
      raise exception 'crm_opportunities: cannot create an opportunity in an archived stage';
    end if;
  elsif TG_OP = 'UPDATE' and new.stage_id is distinct from old.stage_id then
    if v_stage_is_archived then
      raise exception 'crm_opportunities: cannot move an opportunity into an archived stage';
    end if;
  end if;

  return new;
end;
$$;

create trigger crm_opportunities_validate_relationships
before insert or update on public.crm_opportunities
for each row execute function public.validate_crm_opportunity_relationships();

alter table public.crm_pipeline_stages enable row level security;
alter table public.crm_opportunities enable row level security;

create policy crm_pipeline_stages_select_active_member
on public.crm_pipeline_stages
for select
to authenticated
using (public.is_workspace_member(workspace_id));

create policy crm_pipeline_stages_insert_active_contributor
on public.crm_pipeline_stages
for insert
to authenticated
with check (
  public.is_workspace_member(
    workspace_id,
    array['owner', 'admin', 'member']::text[]
  )
);

create policy crm_pipeline_stages_update_active_contributor
on public.crm_pipeline_stages
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

create policy crm_pipeline_stages_delete_owner_or_admin
on public.crm_pipeline_stages
for delete
to authenticated
using (
  public.is_workspace_member(
    workspace_id,
    array['owner', 'admin']::text[]
  )
);

create policy crm_opportunities_select_active_member
on public.crm_opportunities
for select
to authenticated
using (public.is_workspace_member(workspace_id));

create policy crm_opportunities_insert_active_contributor
on public.crm_opportunities
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and public.is_workspace_member(
    workspace_id,
    array['owner', 'admin', 'member']::text[]
  )
);

create policy crm_opportunities_update_active_contributor
on public.crm_opportunities
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

create policy crm_opportunities_delete_owner_or_admin
on public.crm_opportunities
for delete
to authenticated
using (
  public.is_workspace_member(
    workspace_id,
    array['owner', 'admin']::text[]
  )
);

-- Seed das 5 etapas padrao em workspaces business NOVOS. Trigger dedicado,
-- nao modifica handle_new_workspace() (20260710_001). security definer
-- necessario: a tabela nao esta com FORCE ROW LEVEL SECURITY, entao uma
-- funcao security definer de propriedade do owner da migration ja bypassa
-- RLS na propria insercao -- por isso o seed funciona independente da
-- ordem relativa entre este trigger e o de handle_new_workspace() (que
-- insere a membership do owner): nenhum dos dois precisa esperar o outro.
create or replace function public.seed_default_crm_pipeline_stages()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.crm_pipeline_stages (workspace_id, name, position, is_default)
  select new.id, stage.name, stage.position, true
  from (
    values
      ('Novo contato', 1::smallint),
      ('Em conversa', 2::smallint),
      ('Proposta enviada', 3::smallint),
      ('Negociação', 4::smallint),
      ('Fechado', 5::smallint)
  ) as stage(name, position)
  where not exists (
    select 1
    from public.crm_pipeline_stages existing
    where existing.workspace_id = new.id
      and lower(btrim(existing.name)) = lower(btrim(stage.name))
  );

  return new;
end;
$$;

create trigger on_business_workspace_created_seed_crm_stages
after insert on public.workspaces
for each row
when (new.workspace_type = 'business')
execute function public.seed_default_crm_pipeline_stages();

-- Backfill idempotente para workspaces business ja existentes. Insere cada
-- etapa padrao individualmente, so quando nao existir uma etapa com o
-- mesmo nome normalizado (lower + btrim) naquele workspace -- seguro tanto
-- para workspaces sem nenhuma etapa quanto para workspaces com algumas (ou
-- todas) as etapas padrao ja presentes. Sem unique de posicao, nao ha risco
-- de a insercao falhar por colisao de posicao com uma etapa preexistente.
insert into public.crm_pipeline_stages (workspace_id, name, position, is_default)
select w.id, stage.name, stage.position, true
from public.workspaces w
cross join (
  values
    ('Novo contato', 1::smallint),
    ('Em conversa', 2::smallint),
    ('Proposta enviada', 3::smallint),
    ('Negociação', 4::smallint),
    ('Fechado', 5::smallint)
) as stage(name, position)
where w.workspace_type = 'business'
  and not exists (
    select 1
    from public.crm_pipeline_stages existing
    where existing.workspace_id = w.id
      and lower(btrim(existing.name)) = lower(btrim(stage.name))
  );

commit;
