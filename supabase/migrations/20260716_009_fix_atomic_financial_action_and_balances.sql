begin;

-- A normalizacao participa de um indice de expressao. INSERT e UPDATE de
-- contas feitos pelo role authenticated precisam executar esta funcao pura.
alter function public.normalize_financial_account_identity(text)
  owner to postgres;
alter function public.normalize_financial_account_identity(text)
  security invoker;
alter function public.normalize_financial_account_identity(text)
  set search_path = '';
revoke all on function public.normalize_financial_account_identity(text)
  from public, anon, authenticated;
grant execute on function public.normalize_financial_account_identity(text)
  to authenticated;

-- Substitui somente o corpo da RPC da 008. Um replay e valido apenas enquanto
-- a transacao original continua completed e o payload permanece identico.
create or replace function public.execute_confirmed_financial_action(
  p_client_operation_id uuid,
  p_account_mode text,
  p_account_id uuid,
  p_account_name text,
  p_account_type text,
  p_account_institution_name text,
  p_category_id uuid,
  p_transaction_type text,
  p_description text,
  p_amount numeric,
  p_transaction_date date,
  p_destination_account_id uuid
)
returns table (
  transaction_id uuid,
  account_id uuid,
  account_created boolean,
  account_reactivated boolean,
  idempotent_replay boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_workspace_id uuid;
  v_account_id uuid;
  v_account_created boolean := false;
  v_account_reactivated boolean := false;
  v_account_is_active boolean;
  v_account_identity text;
  v_category_type text;
  v_destination_is_active boolean;
  v_existing_transaction_id uuid;
  v_existing_account_id uuid;
  v_replay_matches boolean;
  v_transaction_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'financial_action_session_required';
  end if;

  select profile.current_workspace_id
    into v_workspace_id
  from public.profiles as profile
  where profile.id = v_user_id;

  if v_workspace_id is null then
    raise exception using errcode = 'P0001', message = 'financial_action_workspace_required';
  end if;

  if not exists (
    select 1
    from public.workspace_members as member
    where member.workspace_id = v_workspace_id
      and member.user_id = v_user_id
      and member.status = 'active'
      and member.role in ('owner', 'admin', 'member')
  ) then
    raise exception using errcode = 'P0001', message = 'financial_action_workspace_forbidden';
  end if;

  if p_client_operation_id is null then
    raise exception using errcode = 'P0001', message = 'financial_action_idempotency_required';
  end if;
  if p_account_mode not in ('existing', 'create', 'reactivate') then
    raise exception using errcode = 'P0001', message = 'financial_action_account_mode_invalid';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception using errcode = 'P0001', message = 'financial_action_amount_invalid';
  end if;
  if p_transaction_type not in ('income', 'expense', 'transfer') then
    raise exception using errcode = 'P0001', message = 'financial_action_type_invalid';
  end if;
  if p_transaction_date is null then
    raise exception using errcode = 'P0001', message = 'financial_action_date_invalid';
  end if;
  if p_description is null
    or pg_catalog.length(pg_catalog.btrim(p_description)) < 2
    or pg_catalog.length(pg_catalog.btrim(p_description)) > 160 then
    raise exception using errcode = 'P0001', message = 'financial_action_description_invalid';
  end if;
  if p_category_id is null then
    raise exception using errcode = 'P0001', message = 'financial_action_category_invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_workspace_id::text || ':' || p_client_operation_id::text,
      0
    )
  );

  select
    transaction.id,
    transaction.account_id,
    transaction.status = 'completed'
      and transaction.source_type = 'manual'
      and transaction.created_by = v_user_id
      and transaction.category_id = p_category_id
      and transaction.transaction_type = p_transaction_type
      and transaction.description = pg_catalog.btrim(p_description)
      and transaction.amount = p_amount
      and transaction.transaction_date = p_transaction_date
      and transaction.destination_account_id is not distinct from p_destination_account_id
      and (
        (
          p_account_mode = 'create'
          and public.normalize_financial_account_identity(account.name)
            = public.normalize_financial_account_identity(p_account_name)
          and account.account_type = p_account_type
          and account.institution_name is not distinct from
            nullif(pg_catalog.btrim(p_account_institution_name), '')
        )
        or (
          p_account_mode in ('existing', 'reactivate')
          and transaction.account_id = p_account_id
        )
      )
    into v_existing_transaction_id, v_existing_account_id, v_replay_matches
  from public.transactions as transaction
  join public.accounts as account
    on account.id = transaction.account_id
    and account.workspace_id = transaction.workspace_id
  where transaction.workspace_id = v_workspace_id
    and transaction.client_operation_id = p_client_operation_id;

  if found then
    if v_replay_matches is not true then
      raise exception using errcode = 'P0001', message = 'financial_action_idempotency_conflict';
    end if;
    return query
    select
      v_existing_transaction_id,
      v_existing_account_id,
      false,
      false,
      true;
    return;
  end if;

  select category.category_type
    into v_category_type
  from public.categories as category
  where category.id = p_category_id
    and category.is_active = true
    and (
      (category.is_system = true and category.workspace_id is null)
      or category.workspace_id = v_workspace_id
    );

  if not found or v_category_type <> p_transaction_type then
    raise exception using errcode = 'P0001', message = 'financial_action_category_invalid';
  end if;

  if p_account_mode = 'existing' then
    if p_account_id is null then
      raise exception using errcode = 'P0001', message = 'financial_action_account_required';
    end if;

    select account.id, account.is_active
      into v_account_id, v_account_is_active
    from public.accounts as account
    where account.id = p_account_id
      and account.workspace_id = v_workspace_id
    for update;

    if not found then
      raise exception using errcode = 'P0001', message = 'financial_action_account_forbidden';
    end if;
    if v_account_is_active = false then
      raise exception using errcode = 'P0001', message = 'financial_action_account_archived';
    end if;
  elsif p_account_mode = 'create' then
    if p_account_name is null or pg_catalog.length(pg_catalog.btrim(p_account_name)) < 2 then
      raise exception using errcode = 'P0001', message = 'financial_action_account_name_invalid';
    end if;
    if p_account_type is null or not exists (
      select 1
      from public.account_types as account_type
      where account_type.code = p_account_type
        and account_type.is_active = true
    ) then
      raise exception using errcode = 'P0001', message = 'financial_action_account_type_invalid';
    end if;

    v_account_identity := public.normalize_financial_account_identity(p_account_name);
    if v_account_identity = '' then
      raise exception using errcode = 'P0001', message = 'financial_action_account_name_invalid';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        v_workspace_id::text || ':account:' || v_account_identity,
        0
      )
    );

    if exists (
      select 1
      from public.accounts as account
      where account.workspace_id = v_workspace_id
        and account.is_active = true
        and public.normalize_financial_account_identity(account.name) = v_account_identity
    ) then
      raise exception using errcode = 'P0001', message = 'financial_action_account_duplicate';
    end if;

    insert into public.accounts (
      workspace_id,
      name,
      account_type,
      institution_name,
      currency_code,
      initial_balance,
      current_balance,
      is_active,
      source_type,
      created_by
    ) values (
      v_workspace_id,
      pg_catalog.btrim(p_account_name),
      p_account_type,
      nullif(pg_catalog.btrim(p_account_institution_name), ''),
      'BRL',
      0,
      0,
      true,
      'manual',
      v_user_id
    )
    returning id into v_account_id;

    v_account_created := true;
  else
    if p_account_id is null then
      raise exception using errcode = 'P0001', message = 'financial_action_account_required';
    end if;

    select
      account.id,
      account.is_active,
      public.normalize_financial_account_identity(account.name)
      into v_account_id, v_account_is_active, v_account_identity
    from public.accounts as account
    where account.id = p_account_id
      and account.workspace_id = v_workspace_id
    for update;

    if not found then
      raise exception using errcode = 'P0001', message = 'financial_action_account_forbidden';
    end if;
    if v_account_is_active = true then
      raise exception using errcode = 'P0001', message = 'financial_action_account_not_archived';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        v_workspace_id::text || ':account:' || v_account_identity,
        0
      )
    );

    if exists (
      select 1
      from public.accounts as account
      where account.workspace_id = v_workspace_id
        and account.id <> v_account_id
        and account.is_active = true
        and public.normalize_financial_account_identity(account.name) = v_account_identity
    ) then
      raise exception using errcode = 'P0001', message = 'financial_action_account_duplicate';
    end if;

    update public.accounts as account
    set is_active = true
    where account.id = v_account_id
      and account.workspace_id = v_workspace_id;

    v_account_reactivated := true;
  end if;

  if p_transaction_type = 'transfer' then
    if p_destination_account_id is null or p_destination_account_id = v_account_id then
      raise exception using errcode = 'P0001', message = 'financial_action_destination_invalid';
    end if;

    select destination.is_active
      into v_destination_is_active
    from public.accounts as destination
    where destination.id = p_destination_account_id
      and destination.workspace_id = v_workspace_id
    for share;

    if not found or v_destination_is_active = false then
      raise exception using errcode = 'P0001', message = 'financial_action_destination_invalid';
    end if;
  elsif p_destination_account_id is not null then
    raise exception using errcode = 'P0001', message = 'financial_action_destination_invalid';
  end if;

  insert into public.transactions (
    workspace_id,
    account_id,
    destination_account_id,
    category_id,
    transaction_type,
    description,
    amount,
    transaction_date,
    status,
    source_type,
    client_operation_id,
    created_by
  ) values (
    v_workspace_id,
    v_account_id,
    p_destination_account_id,
    p_category_id,
    p_transaction_type,
    pg_catalog.btrim(p_description),
    p_amount,
    p_transaction_date,
    'completed',
    'manual',
    p_client_operation_id,
    v_user_id
  )
  returning id into v_transaction_id;

  return query
  select
    v_transaction_id,
    v_account_id,
    v_account_created,
    v_account_reactivated,
    false;
end;
$$;

-- Reafirma os metadados de seguranca da RPC atomica criada pela migration 008.
alter function public.execute_confirmed_financial_action(
  uuid, text, uuid, text, text, text, uuid, text, text, numeric, date, uuid
) owner to postgres;
alter function public.execute_confirmed_financial_action(
  uuid, text, uuid, text, text, text, uuid, text, text, numeric, date, uuid
) security definer;
alter function public.execute_confirmed_financial_action(
  uuid, text, uuid, text, text, text, uuid, text, text, numeric, date, uuid
) set search_path = '';
revoke all on function public.execute_confirmed_financial_action(
  uuid, text, uuid, text, text, text, uuid, text, text, numeric, date, uuid
) from public, anon, authenticated;
grant execute on function public.execute_confirmed_financial_action(
  uuid, text, uuid, text, text, text, uuid, text, text, numeric, date, uuid
) to authenticated;

-- Fonte oficial de saldo por conta. O workspace nunca vem do frontend: ele e
-- derivado do profile autenticado e validado por membership ativa.
create or replace function public.get_derived_account_balances()
returns table (
  account_id uuid,
  initial_balance numeric,
  income_total numeric,
  expense_total numeric,
  transfer_in_total numeric,
  transfer_out_total numeric,
  derived_balance numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_workspace_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'financial_balance_session_required';
  end if;

  select profile.current_workspace_id
    into v_workspace_id
  from public.profiles as profile
  where profile.id = v_user_id;

  if v_workspace_id is null then
    raise exception using errcode = 'P0001', message = 'financial_balance_workspace_required';
  end if;

  if not exists (
    select 1
    from public.workspace_members as member
    where member.workspace_id = v_workspace_id
      and member.user_id = v_user_id
      and member.status = 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'financial_balance_workspace_forbidden';
  end if;

  return query
  with movements as (
    select
      account.id as account_id,
      account.initial_balance,
      coalesce(sum(transaction.amount) filter (
        where transaction.transaction_type = 'income'
          and transaction.account_id = account.id
      ), 0)::numeric as income_total,
      coalesce(sum(transaction.amount) filter (
        where transaction.transaction_type = 'expense'
          and transaction.account_id = account.id
      ), 0)::numeric as expense_total,
      coalesce(sum(transaction.amount) filter (
        where transaction.transaction_type = 'transfer'
          and transaction.destination_account_id = account.id
      ), 0)::numeric as transfer_in_total,
      coalesce(sum(transaction.amount) filter (
        where transaction.transaction_type = 'transfer'
          and transaction.account_id = account.id
      ), 0)::numeric as transfer_out_total
    from public.accounts as account
    left join public.transactions as transaction
      on transaction.workspace_id = v_workspace_id
      and transaction.status = 'completed'
      and (
        transaction.account_id = account.id
        or (
          transaction.transaction_type = 'transfer'
          and transaction.destination_account_id = account.id
        )
      )
    where account.workspace_id = v_workspace_id
    group by account.id, account.initial_balance
  )
  select
    movement.account_id,
    movement.initial_balance,
    movement.income_total,
    movement.expense_total,
    movement.transfer_in_total,
    movement.transfer_out_total,
    (
      movement.initial_balance
      + movement.income_total
      - movement.expense_total
      + movement.transfer_in_total
      - movement.transfer_out_total
    )::numeric as derived_balance
  from movements as movement
  order by movement.account_id;
end;
$$;

create or replace function public.get_derived_workspace_balance()
returns table (derived_balance numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_workspace_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'financial_balance_session_required';
  end if;

  select profile.current_workspace_id
    into v_workspace_id
  from public.profiles as profile
  where profile.id = v_user_id;

  if v_workspace_id is null then
    raise exception using errcode = 'P0001', message = 'financial_balance_workspace_required';
  end if;

  if not exists (
    select 1
    from public.workspace_members as member
    where member.workspace_id = v_workspace_id
      and member.user_id = v_user_id
      and member.status = 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'financial_balance_workspace_forbidden';
  end if;

  return query
  select coalesce(sum(balance.derived_balance), 0)::numeric
  from public.get_derived_account_balances() as balance;
end;
$$;

alter function public.get_derived_account_balances() owner to postgres;
alter function public.get_derived_workspace_balance() owner to postgres;

revoke all on function public.get_derived_account_balances()
  from public, anon, authenticated;
revoke all on function public.get_derived_workspace_balance()
  from public, anon, authenticated;
grant execute on function public.get_derived_account_balances()
  to authenticated;
grant execute on function public.get_derived_workspace_balance()
  to authenticated;

comment on function public.get_derived_account_balances() is
  'Saldo oficial derivado por conta do workspace autenticado usando somente transacoes completed.';
comment on function public.get_derived_workspace_balance() is
  'Saldo oficial consolidado do workspace autenticado, sem parametro de workspace.';
comment on column public.accounts.current_balance is
  'Campo legado/cache sem autoridade contabil. A fonte oficial e o saldo derivado de initial_balance e transacoes completed.';

commit;
