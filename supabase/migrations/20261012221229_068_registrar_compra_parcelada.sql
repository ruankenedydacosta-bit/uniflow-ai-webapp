begin;

-- Compra parcelada confirmada pela Uni (chat e voz), #221. Grava todas as
-- parcelas numa transação só: ou entram todas, ou nenhuma. A primeira
-- parcela leva o client_operation_id (retry da mesma confirmação devolve o
-- grupo já gravado), e todas levam metadata.installment_group_id com o mesmo
-- uuid, a convenção que a tela do Financeiro já usa para editar e excluir o
-- grupo.
--
-- Parcela i cai em p_first_date + (i - 1) meses, sempre contada da primeira:
-- 31/01 vira 28/02 e depois 31/03. O valor é o total dividido em centavos, e
-- a última parcela absorve o arredondamento. Parcela com data depois de hoje
-- (fuso São Paulo) nasce prevista ('pending'), como na migration 066. A
-- função devolve quantas ficaram previstas: o aparelho de quem confirma pode
-- estar noutro fuso, e a Uni repete esse número na resposta.

create or replace function public.registrar_compra_parcelada(
  p_client_operation_id uuid,
  p_account_id uuid,
  p_category_id uuid,
  p_description text,
  p_total_amount numeric,
  p_installments integer,
  p_first_date date
)
returns table(transaction_id uuid, installment_group_id uuid, installments integer, pending_installments integer, idempotent_replay boolean)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_workspace_id uuid;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_description text := pg_catalog.btrim(p_description);
  v_total_cents bigint;
  v_base_cents bigint;
  v_account_is_active boolean;
  v_existing_transaction_id uuid;
  v_replay_matches boolean;
  v_first_transaction_id uuid;
  v_inserted_id uuid;
  v_date date;
  v_amount numeric;
  v_pending integer := 0;
  i integer;
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
  if p_first_date is null then
    raise exception using errcode = 'P0001', message = 'financial_action_date_invalid';
  end if;
  if v_description is null
    or pg_catalog.length(v_description) < 2
    or pg_catalog.length(v_description) > 160 then
    raise exception using errcode = 'P0001', message = 'financial_action_description_invalid';
  end if;
  if p_installments is null or p_installments < 2 or p_installments > 360 then
    raise exception using errcode = 'P0001', message = 'financial_action_installments_invalid';
  end if;
  if p_total_amount is null or p_total_amount <= 0 then
    raise exception using errcode = 'P0001', message = 'financial_action_amount_invalid';
  end if;

  v_total_cents := pg_catalog.round(p_total_amount * 100)::bigint;
  -- Cada parcela precisa de pelo menos um centavo.
  if v_total_cents < p_installments then
    raise exception using errcode = 'P0001', message = 'financial_action_amount_invalid';
  end if;
  v_base_cents := v_total_cents / p_installments;

  if p_category_id is null then
    raise exception using errcode = 'P0001', message = 'financial_action_category_invalid';
  end if;

  -- Serializa retries da mesma confirmação antes de consultar o resultado.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_workspace_id::text || ':' || p_client_operation_id::text,
      0
    )
  );

  select
    transaction.id,
    transaction.status in ('completed', 'pending')
      and transaction.source_type = 'manual'
      and transaction.created_by = v_user_id
      and transaction.transaction_type = 'expense'
      and transaction.category_id = p_category_id
      and transaction.account_id is not distinct from p_account_id
      and transaction.description = v_description
      and transaction.transaction_date = p_first_date
      and transaction.installment_number = 1
      and transaction.installment_total = p_installments
      and transaction.amount = v_base_cents / 100.0
    into v_existing_transaction_id, v_replay_matches
  from public.transactions as transaction
  where transaction.workspace_id = v_workspace_id
    and transaction.client_operation_id = p_client_operation_id;

  if found then
    if v_replay_matches is not true then
      raise exception using errcode = 'P0001', message = 'financial_action_idempotency_conflict';
    end if;
    select pg_catalog.count(*)::integer
      into v_pending
    from public.transactions as transaction
    where transaction.workspace_id = v_workspace_id
      and transaction.metadata ->> 'installment_group_id' = p_client_operation_id::text
      and transaction.status = 'pending';
    return query select v_existing_transaction_id, p_client_operation_id, p_installments, v_pending, true;
    return;
  end if;

  if not exists (
    select 1
    from public.categories as category
    where category.id = p_category_id
      and category.is_active = true
      and category.category_type = 'expense'
      and (
        (category.is_system = true and category.workspace_id is null)
        or category.workspace_id = v_workspace_id
      )
  ) then
    raise exception using errcode = 'P0001', message = 'financial_action_category_invalid';
  end if;

  if p_account_id is not null then
    select account.is_active
      into v_account_is_active
    from public.accounts as account
    where account.id = p_account_id
      and account.workspace_id = v_workspace_id
    for share;

    if not found then
      raise exception using errcode = 'P0001', message = 'financial_action_account_forbidden';
    end if;
    if v_account_is_active = false then
      raise exception using errcode = 'P0001', message = 'financial_action_account_archived';
    end if;
  end if;

  for i in 1..p_installments loop
    v_date := (p_first_date + pg_catalog.make_interval(months => i - 1))::date;
    v_amount := case
      when i = p_installments then (v_total_cents - v_base_cents * (p_installments - 1)) / 100.0
      else v_base_cents / 100.0
    end;

    insert into public.transactions (
      workspace_id,
      account_id,
      category_id,
      transaction_type,
      description,
      amount,
      transaction_date,
      status,
      source_type,
      client_operation_id,
      installment_number,
      installment_total,
      metadata,
      created_by
    ) values (
      v_workspace_id,
      p_account_id,
      p_category_id,
      'expense',
      v_description,
      v_amount,
      v_date,
      case when v_date > v_today then 'pending' else 'completed' end,
      'manual',
      case when i = 1 then p_client_operation_id end,
      i,
      p_installments,
      pg_catalog.jsonb_build_object('installment_group_id', p_client_operation_id),
      v_user_id
    )
    returning id into v_inserted_id;

    if i = 1 then
      v_first_transaction_id := v_inserted_id;
    end if;
    if v_date > v_today then
      v_pending := v_pending + 1;
    end if;
  end loop;

  return query select v_first_transaction_id, p_client_operation_id, p_installments, v_pending, false;
end;
$function$;

revoke all on function public.registrar_compra_parcelada(uuid, uuid, uuid, text, numeric, integer, date)
  from public, anon, authenticated;
grant execute on function public.registrar_compra_parcelada(uuid, uuid, uuid, text, numeric, integer, date)
  to authenticated;

comment on function public.registrar_compra_parcelada(uuid, uuid, uuid, text, numeric, integer, date) is
  'Grava todas as parcelas de uma compra confirmada pela Uni numa transação só, com idempotência pela primeira parcela.';

commit;
