begin;

-- Lançamento recorrente que gera os próximos (#222). Antes, "Recorrente" só
-- marcava is_recurring no lançamento original e nada mais nascia.
--
-- A série guarda a regra e o modelo do lançamento. As ocorrências são
-- lançamentos comuns, ligados a ela por recurring_series_id: nascem como
-- previstos ('pending') numa janela móvel de 3 meses à frente, e o job
-- diário estende a janela. Ocorrência i (a partir de 0) cai em
-- start_date + i * intervalo, sempre contada da primeira: no mensal, 31/01
-- vira 28/02 e volta a 31/03. O metadata da ocorrência repete o id da série
-- (recurring_series_id): é por ele que a tela sabe que o lançamento é de uma
-- série, sem depender da coluna nova no select do app. As RPCs só confiam na
-- coluna. A geração anda pelo contador
-- occurrences_generated, então excluir uma ocorrência não faz o job
-- recriá-la.
--
-- Alterar ou excluir "esta e as próximas" ou "todas" vai pelas RPCs daqui,
-- porque as ocorrências futuras nem sempre estão carregadas na tela, e a
-- regra da série precisa mudar junto. "Somente esta" segue pelo update e
-- delete comuns do lançamento.

create table if not exists public.recurring_series (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  account_id uuid references public.accounts (id) on delete set null,
  category_id uuid references public.categories (id) on delete set null,
  transaction_type text not null check (transaction_type in ('income', 'expense')),
  description text not null check (pg_catalog.length(pg_catalog.btrim(description)) between 2 and 160),
  amount numeric(14, 2) not null check (amount > 0),
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly', 'yearly')),
  interval_count integer not null default 1 check (interval_count between 1 and 365),
  start_date date not null,
  end_date date,
  auto_confirm boolean not null default false,
  payment_method text,
  notes text,
  occurrences_generated integer not null default 0 check (occurrences_generated >= 0),
  ended_at timestamptz,
  client_operation_id uuid,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_series_end_after_start check (end_date is null or end_date >= start_date)
);

create unique index if not exists recurring_series_client_operation_idx
  on public.recurring_series (workspace_id, client_operation_id)
  where client_operation_id is not null;
create index if not exists recurring_series_active_idx
  on public.recurring_series (workspace_id)
  where ended_at is null;

create trigger recurring_series_set_updated_at
before update on public.recurring_series
for each row execute function public.set_updated_at();

alter table public.recurring_series enable row level security;

-- Leitura para quem é do espaço. Escrita só pelas RPCs abaixo.
create policy recurring_series_select_member
on public.recurring_series
for select
to authenticated
using (public.is_workspace_member(workspace_id));

alter table public.transactions
  add column if not exists recurring_series_id uuid references public.recurring_series (id) on delete set null;

create index if not exists transactions_recurring_series_idx
  on public.transactions (recurring_series_id, transaction_date)
  where recurring_series_id is not null;

-- Só as funções desta migration ligam um lançamento a uma série. O app
-- grava em transactions com grant por coluna, e esta coluna fica sem grant
-- de insert e update para authenticated.

-- Data da ocorrência i, contada da primeira.
create or replace function public.data_da_ocorrencia(
  p_start_date date,
  p_frequency text,
  p_interval integer,
  p_index integer
)
returns date
language sql
immutable
set search_path to ''
as $function$
  select (p_start_date + case p_frequency
    when 'daily' then pg_catalog.make_interval(days => p_index * p_interval)
    when 'weekly' then pg_catalog.make_interval(weeks => p_index * p_interval)
    when 'monthly' then pg_catalog.make_interval(months => p_index * p_interval)
    else pg_catalog.make_interval(years => p_index * p_interval)
  end)::date;
$function$;

-- Gera as ocorrências que faltam até p_ate (inclusive) e devolve quantas
-- nasceram. Para na data de fim da série. Teto de 500 por chamada: série
-- diária com início muito antigo não enche o banco de uma vez.
create or replace function public.gerar_ocorrencias_da_serie(p_series_id uuid, p_ate date)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_series public.recurring_series;
  v_today date := (pg_catalog.now() at time zone 'America/Sao_Paulo')::date;
  v_date date;
  v_count integer := 0;
  v_rule jsonb;
begin
  select * into v_series
  from public.recurring_series as series
  where series.id = p_series_id
  for update;

  if not found or v_series.ended_at is not null then
    return 0;
  end if;

  v_rule := pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'frequency', v_series.frequency,
    'interval', v_series.interval_count,
    'endDate', v_series.end_date
  ));

  loop
    v_date := public.data_da_ocorrencia(
      v_series.start_date, v_series.frequency, v_series.interval_count, v_series.occurrences_generated
    );
    exit when v_date > p_ate;
    exit when v_series.end_date is not null and v_date > v_series.end_date;
    if v_count >= 500 then
      raise exception using errcode = 'P0001', message = 'recurring_series_too_many';
    end if;

    insert into public.transactions (
      workspace_id,
      account_id,
      category_id,
      transaction_type,
      description,
      amount,
      transaction_date,
      status,
      payment_method,
      notes,
      is_recurring,
      recurrence_rule,
      recurring_series_id,
      source_type,
      metadata,
      created_by
    ) values (
      v_series.workspace_id,
      v_series.account_id,
      v_series.category_id,
      v_series.transaction_type,
      v_series.description,
      v_series.amount,
      v_date,
      case when v_date > v_today then 'pending' else 'completed' end,
      v_series.payment_method,
      v_series.notes,
      true,
      v_rule,
      v_series.id,
      'manual',
      pg_catalog.jsonb_build_object('recurring_series_id', v_series.id)
        || case
          when v_series.auto_confirm and v_date > v_today
          then pg_catalog.jsonb_build_object('auto_confirm', true)
          else '{}'::jsonb
        end,
      v_series.created_by
    );

    v_series.occurrences_generated := v_series.occurrences_generated + 1;
    v_count := v_count + 1;
  end loop;

  update public.recurring_series as series
  set occurrences_generated = v_series.occurrences_generated,
      ended_at = case
        when v_series.end_date is not null
          and public.data_da_ocorrencia(
            v_series.start_date, v_series.frequency, v_series.interval_count, v_series.occurrences_generated
          ) > v_series.end_date
        then pg_catalog.now()
        else series.ended_at
      end
  where series.id = v_series.id;

  return v_count;
end;
$function$;

revoke all on function public.data_da_ocorrencia(date, text, integer, integer) from public, anon, authenticated;
revoke all on function public.gerar_ocorrencias_da_serie(uuid, date) from public, anon, authenticated;

-- Espaço em que a tela está, conferido contra o papel de quem chama. Vem da
-- tela, e não do perfil: com duas abas em espaços diferentes, a série cairia
-- no espaço da outra aba.
create or replace function public.espaco_para_lancar(p_workspace_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if (select auth.uid()) is null then
    raise exception using errcode = 'P0001', message = 'financial_action_session_required';
  end if;
  if p_workspace_id is null then
    raise exception using errcode = 'P0001', message = 'financial_action_workspace_required';
  end if;
  if not public.is_workspace_member(p_workspace_id, array['owner', 'admin', 'member']::text[]) then
    raise exception using errcode = 'P0001', message = 'financial_action_workspace_forbidden';
  end if;
  return p_workspace_id;
end;
$function$;

revoke all on function public.espaco_para_lancar(uuid) from public, anon, authenticated;

-- Cria a série e as ocorrências até 3 meses à frente. Usada pela tela e
-- pela Uni; p_client_operation_id torna o retry da mesma confirmação seguro.
create or replace function public.criar_serie_recorrente(
  p_workspace_id uuid,
  p_client_operation_id uuid,
  p_transaction_type text,
  p_account_id uuid,
  p_category_id uuid,
  p_description text,
  p_amount numeric,
  p_frequency text,
  p_interval integer,
  p_start_date date,
  p_end_date date,
  p_auto_confirm boolean,
  p_payment_method text default null,
  p_notes text default null
)
returns table(series_id uuid, first_transaction_id uuid, occurrences integer, pending_occurrences integer, idempotent_replay boolean)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_workspace_id uuid := public.espaco_para_lancar(p_workspace_id);
  v_user_id uuid := (select auth.uid());
  v_today date := (pg_catalog.now() at time zone 'America/Sao_Paulo')::date;
  v_series_id uuid;
  v_description text := pg_catalog.btrim(p_description);
begin
  if p_transaction_type not in ('income', 'expense') then
    raise exception using errcode = 'P0001', message = 'financial_action_type_invalid';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception using errcode = 'P0001', message = 'financial_action_amount_invalid';
  end if;
  if v_description is null or pg_catalog.length(v_description) not between 2 and 160 then
    raise exception using errcode = 'P0001', message = 'financial_action_description_invalid';
  end if;
  if p_start_date is null then
    raise exception using errcode = 'P0001', message = 'financial_action_date_invalid';
  end if;
  if p_frequency not in ('daily', 'weekly', 'monthly', 'yearly')
    or p_interval is null or p_interval not between 1 and 365
    or (p_end_date is not null and p_end_date < p_start_date) then
    raise exception using errcode = 'P0001', message = 'recurring_series_rule_invalid';
  end if;

  if p_client_operation_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_workspace_id::text || ':' || p_client_operation_id::text, 0)
    );
    select series.id into v_series_id
    from public.recurring_series as series
    where series.workspace_id = v_workspace_id
      and series.client_operation_id = p_client_operation_id;
    if found then
      -- A mesma chave com outro pedido não devolve a série antiga como se
      -- fosse o pedido novo.
      if not exists (
        select 1 from public.recurring_series as series
        where series.id = v_series_id
          and series.transaction_type = p_transaction_type
          and series.amount = p_amount
          and series.description = v_description
          and series.frequency = p_frequency
          and series.interval_count = p_interval
          and series.start_date = p_start_date
      ) then
        raise exception using errcode = 'P0001', message = 'financial_action_idempotency_conflict';
      end if;
      return query
      select
        v_series_id,
        (select transaction.id from public.transactions as transaction
          where transaction.recurring_series_id = v_series_id
          order by transaction.transaction_date limit 1),
        (select pg_catalog.count(*)::integer from public.transactions as transaction
          where transaction.recurring_series_id = v_series_id),
        (select pg_catalog.count(*)::integer from public.transactions as transaction
          where transaction.recurring_series_id = v_series_id and transaction.status = 'pending'),
        true;
      return;
    end if;
  end if;

  if p_category_id is not null and not exists (
    select 1
    from public.categories as category
    where category.id = p_category_id
      and category.is_active = true
      and category.category_type = p_transaction_type
      and (
        (category.is_system = true and category.workspace_id is null)
        or category.workspace_id = v_workspace_id
      )
  ) then
    raise exception using errcode = 'P0001', message = 'financial_action_category_invalid';
  end if;

  if p_account_id is not null and not exists (
    select 1
    from public.accounts as account
    where account.id = p_account_id
      and account.workspace_id = v_workspace_id
      and account.is_active = true
  ) then
    raise exception using errcode = 'P0001', message = 'financial_action_account_forbidden';
  end if;

  insert into public.recurring_series (
    workspace_id, account_id, category_id, transaction_type, description, amount,
    frequency, interval_count, start_date, end_date, auto_confirm,
    payment_method, notes, client_operation_id, created_by
  ) values (
    v_workspace_id, p_account_id, p_category_id, p_transaction_type, v_description, p_amount,
    p_frequency, p_interval, p_start_date, p_end_date, coalesce(p_auto_confirm, false),
    nullif(pg_catalog.btrim(p_payment_method), ''), nullif(pg_catalog.btrim(p_notes), ''),
    p_client_operation_id, v_user_id
  )
  returning id into v_series_id;

  -- A primeira nasce mesmo com início além da janela.
  perform public.gerar_ocorrencias_da_serie(
    v_series_id,
    greatest(p_start_date, (v_today + pg_catalog.make_interval(months => 3))::date)
  );

  return query
  select
    v_series_id,
    (select transaction.id from public.transactions as transaction
      where transaction.recurring_series_id = v_series_id
      order by transaction.transaction_date limit 1),
    (select pg_catalog.count(*)::integer from public.transactions as transaction
      where transaction.recurring_series_id = v_series_id),
    (select pg_catalog.count(*)::integer from public.transactions as transaction
      where transaction.recurring_series_id = v_series_id and transaction.status = 'pending'),
    false;
end;
$function$;

-- Série do lançamento, para quem pode lançar no espaço dele.
create or replace function public.serie_do_lancamento(p_transaction_id uuid)
returns table(series_id uuid, transaction_date date, workspace_id uuid)
language plpgsql
security definer
set search_path to ''
as $function$
begin
  -- A série precisa ser do mesmo espaço: recurring_series_id apontando para
  -- a série de outro espaço não pode abrir caminho para mexer nela.
  return query
  select transaction.recurring_series_id, transaction.transaction_date, transaction.workspace_id
  from public.transactions as transaction
  join public.recurring_series as series
    on series.id = transaction.recurring_series_id
    and series.workspace_id = transaction.workspace_id
  where transaction.id = p_transaction_id
    and public.is_workspace_member(transaction.workspace_id, array['owner', 'admin', 'member']::text[]);
  if not found then
    raise exception using errcode = 'P0001', message = 'recurring_series_not_found';
  end if;
end;
$function$;

revoke all on function public.serie_do_lancamento(uuid) from public, anon, authenticated;

-- "Esta e as próximas" ou "todas": muda os lançamentos do alcance e o modelo
-- da série, então as ocorrências que o job criar depois já vêm certas. Data
-- e status ficam: são de cada ocorrência. A confirmação automática muda nos
-- previstos do alcance e na série; com p_auto_confirm nulo, fica como está.
create or replace function public.alterar_lancamentos_da_serie(
  p_transaction_id uuid,
  p_scope text,
  p_account_id uuid,
  p_category_id uuid,
  p_description text,
  p_amount numeric,
  p_auto_confirm boolean,
  p_payment_method text default null,
  p_notes text default null
)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_target record;
  v_type text;
  v_description text := pg_catalog.btrim(p_description);
  v_count integer;
begin
  if p_scope not in ('forward', 'all') then
    raise exception using errcode = 'P0001', message = 'recurring_series_scope_invalid';
  end if;
  select * into v_target from public.serie_do_lancamento(p_transaction_id);

  select series.transaction_type into v_type
  from public.recurring_series as series
  where series.id = v_target.series_id
  for update;

  if p_amount is null or p_amount <= 0 then
    raise exception using errcode = 'P0001', message = 'financial_action_amount_invalid';
  end if;
  if v_description is null or pg_catalog.length(v_description) not between 2 and 160 then
    raise exception using errcode = 'P0001', message = 'financial_action_description_invalid';
  end if;
  if p_category_id is not null and not exists (
    select 1 from public.categories as category
    where category.id = p_category_id
      and category.is_active = true
      and category.category_type = v_type
      and ((category.is_system = true and category.workspace_id is null) or category.workspace_id = v_target.workspace_id)
  ) then
    raise exception using errcode = 'P0001', message = 'financial_action_category_invalid';
  end if;
  if p_account_id is not null and not exists (
    select 1 from public.accounts as account
    where account.id = p_account_id and account.workspace_id = v_target.workspace_id and account.is_active = true
  ) then
    raise exception using errcode = 'P0001', message = 'financial_action_account_forbidden';
  end if;

  update public.transactions as transaction
  set account_id = p_account_id,
      category_id = p_category_id,
      description = v_description,
      amount = p_amount,
      payment_method = nullif(pg_catalog.btrim(p_payment_method), ''),
      notes = nullif(pg_catalog.btrim(p_notes), ''),
      -- Confirmação automática só vale para previsto; nula, não muda.
      metadata = case
        when p_auto_confirm is null or transaction.status <> 'pending' then transaction.metadata
        when p_auto_confirm then coalesce(transaction.metadata, '{}'::jsonb) || pg_catalog.jsonb_build_object('auto_confirm', true)
        else coalesce(transaction.metadata, '{}'::jsonb) - 'auto_confirm'
      end
  where transaction.recurring_series_id = v_target.series_id
    and transaction.workspace_id = v_target.workspace_id
    and (p_scope = 'all' or transaction.transaction_date >= v_target.transaction_date);
  get diagnostics v_count = row_count;

  update public.recurring_series as series
  set account_id = p_account_id,
      category_id = p_category_id,
      description = v_description,
      amount = p_amount,
      payment_method = nullif(pg_catalog.btrim(p_payment_method), ''),
      notes = nullif(pg_catalog.btrim(p_notes), ''),
      auto_confirm = coalesce(p_auto_confirm, series.auto_confirm)
  where series.id = v_target.series_id;

  return v_count;
end;
$function$;

-- "Esta e as próximas" apaga do lançamento em diante e encerra a série no
-- dia anterior; "todas" apaga todas e encerra a série. Mesma regra de quem
-- pode excluir lançamento: dono, admin ou quem criou a série.
create or replace function public.excluir_lancamentos_da_serie(p_transaction_id uuid, p_scope text)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_target record;
  v_count integer;
begin
  if p_scope not in ('forward', 'all') then
    raise exception using errcode = 'P0001', message = 'recurring_series_scope_invalid';
  end if;
  select * into v_target from public.serie_do_lancamento(p_transaction_id);

  if not (
    public.is_workspace_member(v_target.workspace_id, array['owner', 'admin']::text[])
    or exists (
      select 1 from public.recurring_series as series
      where series.id = v_target.series_id and series.created_by = (select auth.uid())
    )
  ) then
    raise exception using errcode = 'P0001', message = 'financial_action_workspace_forbidden';
  end if;

  perform 1 from public.recurring_series as series where series.id = v_target.series_id for update;

  delete from public.transactions as transaction
  where transaction.recurring_series_id = v_target.series_id
    and transaction.workspace_id = v_target.workspace_id
    and (p_scope = 'all' or transaction.transaction_date >= v_target.transaction_date);
  get diagnostics v_count = row_count;

  update public.recurring_series as series
  set ended_at = pg_catalog.now(),
      end_date = case
        when p_scope = 'forward' then greatest(series.start_date, v_target.transaction_date - 1)
        else series.end_date
      end
  where series.id = v_target.series_id;

  return v_count;
end;
$function$;

-- Job diário: estende a janela de todas as séries ativas. Uma série com
-- erro não para as outras.
create or replace function public.estender_series_recorrentes()
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_ate date := ((pg_catalog.now() at time zone 'America/Sao_Paulo')::date + pg_catalog.make_interval(months => 3))::date;
  v_series_id uuid;
  v_total integer := 0;
begin
  for v_series_id in
    select series.id from public.recurring_series as series where series.ended_at is null
  loop
    begin
      v_total := v_total + public.gerar_ocorrencias_da_serie(v_series_id, v_ate);
    exception when others then
      raise warning 'estender_series_recorrentes: série % falhou: %', v_series_id, sqlerrm;
    end;
  end loop;
  return v_total;
end;
$function$;

revoke all on function public.criar_serie_recorrente(uuid, uuid, text, uuid, uuid, text, numeric, text, integer, date, date, boolean, text, text) from public, anon;
grant execute on function public.criar_serie_recorrente(uuid, uuid, text, uuid, uuid, text, numeric, text, integer, date, date, boolean, text, text) to authenticated;
revoke all on function public.alterar_lancamentos_da_serie(uuid, text, uuid, uuid, text, numeric, boolean, text, text) from public, anon;
grant execute on function public.alterar_lancamentos_da_serie(uuid, text, uuid, uuid, text, numeric, boolean, text, text) to authenticated;
revoke all on function public.excluir_lancamentos_da_serie(uuid, text) from public, anon;
grant execute on function public.excluir_lancamentos_da_serie(uuid, text) to authenticated;
revoke all on function public.estender_series_recorrentes() from public, anon, authenticated;
grant execute on function public.estender_series_recorrentes() to service_role;

create extension if not exists pg_cron with schema extensions;

-- 03:05 UTC = 00:05 em Brasília, antes da confirmação automática (03:10),
-- que já vê as ocorrências do dia.
select
  cron.schedule(
    'estender-series-recorrentes',
    '5 3 * * *',
    $$ select public.estender_series_recorrentes(); $$
  );

commit;
