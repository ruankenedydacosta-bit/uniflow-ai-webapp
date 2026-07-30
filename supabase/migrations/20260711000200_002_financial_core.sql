begin;

-- Nucleo financeiro orientado por workspace. Esta migration prepara dados
-- manuais e externos, mas nao implementa conexoes Open Finance.

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  account_type text not null,
  institution_name text,
  currency_code text not null default 'BRL',
  initial_balance numeric(18, 2) not null default 0,
  current_balance numeric(18, 2) not null default 0,
  credit_limit numeric(18, 2),
  closing_day smallint,
  due_day smallint,
  is_active boolean not null default true,
  source_type text not null default 'manual',
  external_provider text,
  external_account_id text,
  last_synced_at timestamptz,
  sync_status text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounts_id_workspace_key unique (id, workspace_id),
  constraint accounts_name_not_blank check (length(btrim(name)) > 0),
  constraint accounts_account_type_check check (
    account_type in (
      'checking',
      'savings',
      'cash',
      'credit_card',
      'investment',
      'digital_wallet',
      'other'
    )
  ),
  constraint accounts_currency_code_check check (
    currency_code ~ '^[A-Z]{3}$'
  ),
  constraint accounts_credit_limit_check check (
    credit_limit is null or credit_limit >= 0
  ),
  constraint accounts_closing_day_check check (
    closing_day is null or closing_day between 1 and 31
  ),
  constraint accounts_due_day_check check (
    due_day is null or due_day between 1 and 31
  ),
  constraint accounts_source_type_check check (
    source_type in (
      'manual',
      'import',
      'open_finance',
      'automation',
      'system'
    )
  ),
  constraint accounts_sync_status_check check (
    sync_status is null
    or sync_status in ('pending', 'synced', 'error', 'disconnected')
  ),
  constraint accounts_metadata_object_check check (
    jsonb_typeof(metadata) = 'object'
  )
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  name text not null,
  category_type text not null,
  parent_category_id uuid references public.categories(id) on delete set null,
  icon text,
  color text,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_name_not_blank check (length(btrim(name)) > 0),
  constraint categories_category_type_check check (
    category_type in ('income', 'expense', 'transfer')
  ),
  constraint categories_system_scope_check check (
    (is_system = true and workspace_id is null and created_by is null)
    or (is_system = false and workspace_id is not null)
  ),
  constraint categories_parent_not_self_check check (
    parent_category_id is null or parent_category_id <> id
  )
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  account_id uuid not null,
  destination_account_id uuid,
  category_id uuid references public.categories(id) on delete set null,
  transaction_type text not null,
  description text not null,
  amount numeric(18, 2) not null,
  transaction_date date not null,
  competence_date date,
  status text not null default 'completed',
  payment_method text,
  notes text,
  is_recurring boolean not null default false,
  recurrence_rule jsonb,
  installment_number integer,
  installment_total integer,
  source_type text not null default 'manual',
  external_provider text,
  external_transaction_id text,
  external_account_id text,
  imported_at timestamptz,
  last_synced_at timestamptz,
  raw_provider_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_account_workspace_fkey
    foreign key (account_id, workspace_id)
    references public.accounts(id, workspace_id)
    on delete restrict,
  constraint transactions_destination_account_workspace_fkey
    foreign key (destination_account_id, workspace_id)
    references public.accounts(id, workspace_id)
    on delete restrict,
  constraint transactions_description_not_blank check (
    length(btrim(description)) > 0
  ),
  constraint transactions_amount_positive_check check (amount > 0),
  constraint transactions_transaction_type_check check (
    transaction_type in ('income', 'expense', 'transfer', 'adjustment')
  ),
  constraint transactions_status_check check (
    status in ('pending', 'completed', 'canceled', 'failed')
  ),
  constraint transactions_source_type_check check (
    source_type in (
      'manual',
      'import',
      'open_finance',
      'automation',
      'ai',
      'system'
    )
  ),
  constraint transactions_transfer_accounts_check check (
    (
      transaction_type = 'transfer'
      and destination_account_id is not null
      and destination_account_id <> account_id
    )
    or (
      transaction_type <> 'transfer'
      and destination_account_id is null
    )
  ),
  constraint transactions_installments_check check (
    (installment_number is null and installment_total is null)
    or (
      installment_number is not null
      and installment_total is not null
      and installment_number between 1 and installment_total
    )
  ),
  constraint transactions_recurrence_check check (
    (is_recurring = true and recurrence_rule is not null)
    or (is_recurring = false and recurrence_rule is null)
  ),
  constraint transactions_recurrence_rule_object_check check (
    recurrence_rule is null or jsonb_typeof(recurrence_rule) = 'object'
  ),
  constraint transactions_raw_provider_data_object_check check (
    raw_provider_data is null or jsonb_typeof(raw_provider_data) = 'object'
  ),
  constraint transactions_metadata_object_check check (
    jsonb_typeof(metadata) = 'object'
  )
);

create index accounts_workspace_id_idx
  on public.accounts (workspace_id);

create index accounts_workspace_active_idx
  on public.accounts (workspace_id, is_active);

create index accounts_source_type_idx
  on public.accounts (source_type);

create unique index accounts_external_identity_uidx
  on public.accounts (
    workspace_id,
    external_provider,
    external_account_id
  )
  where external_provider is not null
    and external_account_id is not null;

create index categories_workspace_type_idx
  on public.categories (workspace_id, category_type);

create index categories_parent_category_id_idx
  on public.categories (parent_category_id)
  where parent_category_id is not null;

create unique index categories_workspace_name_type_uidx
  on public.categories (workspace_id, lower(name), category_type)
  where workspace_id is not null;

create unique index categories_system_name_type_uidx
  on public.categories (lower(name), category_type)
  where workspace_id is null and is_system = true;

create index transactions_workspace_date_idx
  on public.transactions (workspace_id, transaction_date desc);

create index transactions_account_date_idx
  on public.transactions (account_id, transaction_date desc);

create index transactions_destination_account_id_idx
  on public.transactions (destination_account_id)
  where destination_account_id is not null;

create index transactions_category_id_idx
  on public.transactions (category_id)
  where category_id is not null;

create index transactions_workspace_status_idx
  on public.transactions (workspace_id, status);

create index transactions_workspace_source_idx
  on public.transactions (workspace_id, source_type);

create unique index transactions_external_identity_uidx
  on public.transactions (
    workspace_id,
    external_provider,
    external_transaction_id
  )
  where external_provider is not null
    and external_transaction_id is not null;

create index transactions_external_account_idx
  on public.transactions (
    workspace_id,
    external_provider,
    external_account_id
  )
  where external_provider is not null
    and external_account_id is not null;

-- A categoria pai deve viver no mesmo escopo e a arvore nao pode formar ciclo.
create or replace function public.validate_category_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_workspace_id uuid;
  creates_cycle boolean;
begin
  if new.parent_category_id is null then
    return new;
  end if;

  select category.workspace_id
    into parent_workspace_id
  from public.categories as category
  where category.id = new.parent_category_id;

  if not found then
    return new;
  end if;

  if not (parent_workspace_id is not distinct from new.workspace_id) then
    raise exception 'A categoria pai deve pertencer ao mesmo workspace.';
  end if;

  with recursive ancestors as (
    select category.id, category.parent_category_id
    from public.categories as category
    where category.id = new.parent_category_id

    union

    select category.id, category.parent_category_id
    from public.categories as category
    join ancestors
      on category.id = ancestors.parent_category_id
  )
  select exists (
    select 1
    from ancestors
    where ancestors.id = new.id
  ) into creates_cycle;

  if creates_cycle then
    raise exception 'A hierarquia de categorias nao pode ser circular.';
  end if;

  return new;
end;
$$;

-- Categorias de transacao podem ser globais do sistema ou pertencer ao mesmo
-- workspace. A funcao enxerga o catalogo completo apenas para validar escopo.
create or replace function public.validate_transaction_category_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_category public.categories%rowtype;
begin
  if new.category_id is null then
    return new;
  end if;

  select category.*
    into selected_category
  from public.categories as category
  where category.id = new.category_id;

  if not found then
    return new;
  end if;

  if not (
    (selected_category.is_system = true and selected_category.workspace_id is null)
    or selected_category.workspace_id = new.workspace_id
  ) then
    raise exception 'A categoria deve ser global ou pertencer ao workspace da transacao.';
  end if;

  return new;
end;
$$;

create trigger categories_validate_parent
before insert or update of parent_category_id, workspace_id
on public.categories
for each row execute function public.validate_category_parent();

create trigger transactions_validate_category_scope
before insert or update of category_id, workspace_id
on public.transactions
for each row execute function public.validate_transaction_category_scope();

create trigger accounts_set_updated_at
before update on public.accounts
for each row execute function public.set_updated_at();

create trigger categories_set_updated_at
before update on public.categories
for each row execute function public.set_updated_at();

create trigger transactions_set_updated_at
before update on public.transactions
for each row execute function public.set_updated_at();

alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;

create policy accounts_select_active_member
on public.accounts
for select
to authenticated
using (public.is_workspace_member(workspace_id));

create policy accounts_insert_active_contributor
on public.accounts
for insert
to authenticated
with check (
  source_type = 'manual'
  and created_by = (select auth.uid())
  and public.is_workspace_member(
    workspace_id,
    array['owner', 'admin', 'member']::text[]
  )
);

create policy accounts_update_active_contributor
on public.accounts
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

create policy accounts_delete_owner_or_admin
on public.accounts
for delete
to authenticated
using (
  public.is_workspace_member(
    workspace_id,
    array['owner', 'admin']::text[]
  )
);

create policy categories_select_global_or_active_member
on public.categories
for select
to authenticated
using (
  (is_system = true and workspace_id is null)
  or public.is_workspace_member(workspace_id)
);

create policy categories_insert_active_contributor
on public.categories
for insert
to authenticated
with check (
  is_system = false
  and workspace_id is not null
  and created_by = (select auth.uid())
  and public.is_workspace_member(
    workspace_id,
    array['owner', 'admin', 'member']::text[]
  )
);

create policy categories_update_owner_admin_or_creator
on public.categories
for update
to authenticated
using (
  is_system = false
  and workspace_id is not null
  and (
    public.is_workspace_member(
      workspace_id,
      array['owner', 'admin']::text[]
    )
    or (
      created_by = (select auth.uid())
      and public.is_workspace_member(workspace_id, array['member']::text[])
    )
  )
)
with check (
  is_system = false
  and workspace_id is not null
  and (
    public.is_workspace_member(
      workspace_id,
      array['owner', 'admin']::text[]
    )
    or (
      created_by = (select auth.uid())
      and public.is_workspace_member(workspace_id, array['member']::text[])
    )
  )
);

create policy categories_delete_owner_admin_or_creator
on public.categories
for delete
to authenticated
using (
  is_system = false
  and workspace_id is not null
  and (
    public.is_workspace_member(
      workspace_id,
      array['owner', 'admin']::text[]
    )
    or (
      created_by = (select auth.uid())
      and public.is_workspace_member(workspace_id, array['member']::text[])
    )
  )
);

create policy transactions_select_active_member
on public.transactions
for select
to authenticated
using (public.is_workspace_member(workspace_id));

create policy transactions_insert_active_contributor
on public.transactions
for insert
to authenticated
with check (
  source_type = 'manual'
  and created_by = (select auth.uid())
  and public.is_workspace_member(
    workspace_id,
    array['owner', 'admin', 'member']::text[]
  )
);

create policy transactions_update_active_contributor
on public.transactions
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

create policy transactions_delete_owner_admin_or_creator
on public.transactions
for delete
to authenticated
using (
  public.is_workspace_member(
    workspace_id,
    array['owner', 'admin']::text[]
  )
  or (
    created_by = (select auth.uid())
    and public.is_workspace_member(workspace_id)
  )
);

-- Column grants complementam RLS. O frontend cria apenas dados manuais e nao
-- pode forjar origem externa, ownership, timestamps ou payload bruto.
revoke all on table public.accounts from anon, authenticated;
revoke all on table public.categories from anon, authenticated;
revoke all on table public.transactions from anon, authenticated;

grant select on table public.accounts to authenticated;
grant insert (
  workspace_id,
  name,
  account_type,
  institution_name,
  currency_code,
  initial_balance,
  current_balance,
  credit_limit,
  closing_day,
  due_day,
  is_active,
  metadata
) on public.accounts to authenticated;
grant update (
  name,
  account_type,
  institution_name,
  currency_code,
  initial_balance,
  current_balance,
  credit_limit,
  closing_day,
  due_day,
  is_active,
  metadata
) on public.accounts to authenticated;
grant delete on table public.accounts to authenticated;

grant select on table public.categories to authenticated;
grant insert (
  workspace_id,
  name,
  category_type,
  parent_category_id,
  icon,
  color,
  is_active
) on public.categories to authenticated;
grant update (
  name,
  category_type,
  parent_category_id,
  icon,
  color,
  is_active
) on public.categories to authenticated;
grant delete on table public.categories to authenticated;

grant select on table public.transactions to authenticated;
grant insert (
  workspace_id,
  account_id,
  destination_account_id,
  category_id,
  transaction_type,
  description,
  amount,
  transaction_date,
  competence_date,
  status,
  payment_method,
  notes,
  is_recurring,
  recurrence_rule,
  installment_number,
  installment_total,
  metadata
) on public.transactions to authenticated;
grant update (
  account_id,
  destination_account_id,
  category_id,
  transaction_type,
  description,
  amount,
  transaction_date,
  competence_date,
  status,
  payment_method,
  notes,
  is_recurring,
  recurrence_rule,
  installment_number,
  installment_total,
  metadata
) on public.transactions to authenticated;
grant delete on table public.transactions to authenticated;

revoke all on function public.validate_category_parent()
  from public, anon, authenticated;
revoke all on function public.validate_transaction_category_scope()
  from public, anon, authenticated;

comment on table public.accounts is
  'Contas financeiras isoladas por workspace; aceita origem manual ou normalizada por integracoes futuras.';
comment on table public.categories is
  'Categorias globais do sistema ou categorias customizadas isoladas por workspace.';
comment on table public.transactions is
  'Movimentacoes financeiras com valor positivo, sentido definido pelo tipo e origem rastreavel.';

comment on column public.accounts.external_provider is
  'Identificador do provedor normalizado; nunca armazena token, segredo ou credencial bancaria.';
comment on column public.accounts.metadata is
  'Metadados de dominio sem tokens, consentimentos ou segredos de integracao.';
comment on column public.transactions.raw_provider_data is
  'Payload externo opcional ja sanitizado; nunca deve conter token, segredo, certificado ou credencial.';
comment on column public.transactions.external_transaction_id is
  'Identificador externo usado com provider e workspace para deduplicacao.';

-- Open Finance futuro exige backend seguro ou Edge Function, consentimentos
-- com expiracao/revogacao e normalizacao antes da escrita neste dominio. Tokens,
-- certificados e segredos nunca pertencem a accounts, transactions ou metadata.

commit;
