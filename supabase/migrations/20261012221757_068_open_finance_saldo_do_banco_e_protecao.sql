begin;

-- Revisão da infraestrutura do Open Finance (004) contra o app de hoje.
-- Nenhum banco foi conectado ainda; esta migration corrige o que estaria
-- errado no primeiro dia em que um for.
--
-- 1. Saldo: a tela da conta diz "Atualizado pelo banco", mas o saldo vinha de
--    get_derived_account_balances(), que soma saldo inicial + lançamentos. O
--    banco só manda os últimos meses de extrato, então essa soma nunca bate.
--    Conta do Open Finance já sincronizada (last_synced_at preenchido) passa
--    a usar o saldo que o backend grava em accounts.current_balance, na
--    convenção do app: cartão fica negativo quando há fatura a pagar. Antes
--    do primeiro saldo, segue derivado, para não mostrar R$ 0 como se fosse
--    do banco.
-- 2. Proteção: a tela não deixa editar nem excluir conta ou lançamento do
--    Open Finance, mas a RLS deixava. Os triggers abaixo travam no banco o que
--    vem do banco. No lançamento, categoria, observação, competência e
--    metadata continuam editáveis: recategorizar é o trabalho da pessoa e da
--    Uni. Ajuste de saldo numa conta do Open Finance também é recusado: o
--    saldo dela é o do banco.
-- 3. Payload: transactions.raw_provider_data era legível por qualquer membro
--    (grant de SELECT na tabela inteira). O payload do provedor fica em
--    external_transactions.sanitized_provider_data, sem grant para o app. A
--    coluna sai: nenhum código lê ou grava, e nenhuma linha tem valor.

create or replace function public.proteger_conta_do_open_finance()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- O papel vem do JWT da requisição, que continua o mesmo dentro de RPC
  -- security definer: o app (authenticated/anon) é barrado por qualquer
  -- caminho. Edge Function com service_role e job sem JWT passam. A cascata
  -- de FK (excluir o espaço) roda dentro de outro trigger e passa.
  if old.source_type <> 'open_finance'
    or coalesce((select auth.role()), '') not in ('authenticated', 'anon')
    or (tg_op = 'DELETE' and pg_trigger_depth() > 1) then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    raise exception using errcode = 'P0001', message = 'conta_do_open_finance_protegida';
  end if;

  if new.name is distinct from old.name
    or new.account_type is distinct from old.account_type
    or new.institution_name is distinct from old.institution_name
    or new.currency_code is distinct from old.currency_code
    or new.initial_balance is distinct from old.initial_balance
    or new.current_balance is distinct from old.current_balance
    or new.credit_limit is distinct from old.credit_limit
    or new.closing_day is distinct from old.closing_day
    or new.due_day is distinct from old.due_day
    or new.is_active is distinct from old.is_active
    or new.source_type is distinct from old.source_type
    or new.external_provider is distinct from old.external_provider
    or new.external_account_id is distinct from old.external_account_id then
    raise exception using errcode = 'P0001', message = 'conta_do_open_finance_protegida';
  end if;

  return new;
end;
$$;

create or replace function public.proteger_lancamento_do_open_finance()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- O papel vem do JWT da requisição, que continua o mesmo dentro de RPC
  -- security definer: o app (authenticated/anon) é barrado por qualquer
  -- caminho. Edge Function com service_role e job sem JWT passam. A cascata
  -- de FK (excluir o espaço) roda dentro de outro trigger e passa.
  if old.source_type <> 'open_finance'
    or coalesce((select auth.role()), '') not in ('authenticated', 'anon')
    or (tg_op = 'DELETE' and pg_trigger_depth() > 1) then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    raise exception using errcode = 'P0001', message = 'lancamento_do_open_finance_protegido';
  end if;

  if new.account_id is distinct from old.account_id
    or new.destination_account_id is distinct from old.destination_account_id
    or new.transaction_type is distinct from old.transaction_type
    or new.description is distinct from old.description
    or new.amount is distinct from old.amount
    or new.adjustment_delta is distinct from old.adjustment_delta
    or new.transaction_date is distinct from old.transaction_date
    or new.status is distinct from old.status
    or new.payment_method is distinct from old.payment_method
    or new.is_recurring is distinct from old.is_recurring
    or new.recurrence_rule is distinct from old.recurrence_rule
    or new.installment_number is distinct from old.installment_number
    or new.installment_total is distinct from old.installment_total
    or new.source_type is distinct from old.source_type
    or new.external_provider is distinct from old.external_provider
    or new.external_transaction_id is distinct from old.external_transaction_id
    or new.external_account_id is distinct from old.external_account_id
    -- auto_confirm faz o job da 065 confirmar o previsto; quem confirma
    -- lançamento do banco é o banco.
    or new.metadata -> 'auto_confirm' is distinct from old.metadata -> 'auto_confirm' then
    raise exception using errcode = 'P0001', message = 'lancamento_do_open_finance_protegido';
  end if;

  return new;
end;
$$;

create or replace function public.recusar_ajuste_em_conta_do_open_finance()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.transaction_type = 'adjustment'
    and exists (
      select 1
      from public.accounts as account
      where account.id = new.account_id
        and account.source_type = 'open_finance'
    ) then
    raise exception using errcode = 'P0001', message = 'conta_do_open_finance_protegida';
  end if;

  return new;
end;
$$;

drop trigger if exists accounts_proteger_open_finance on public.accounts;
create trigger accounts_proteger_open_finance
before update or delete on public.accounts
for each row execute function public.proteger_conta_do_open_finance();

drop trigger if exists transactions_proteger_open_finance on public.transactions;
create trigger transactions_proteger_open_finance
before update or delete on public.transactions
for each row execute function public.proteger_lancamento_do_open_finance();

drop trigger if exists transactions_recusar_ajuste_open_finance on public.transactions;
create trigger transactions_recusar_ajuste_open_finance
before insert or update of transaction_type, account_id on public.transactions
for each row execute function public.recusar_ajuste_em_conta_do_open_finance();

revoke all on function public.proteger_conta_do_open_finance() from public, anon, authenticated;
revoke all on function public.proteger_lancamento_do_open_finance() from public, anon, authenticated;
revoke all on function public.recusar_ajuste_em_conta_do_open_finance() from public, anon, authenticated;

-- Leva junto transactions_raw_provider_data_object_check.
alter table public.transactions drop column if exists raw_provider_data;

-- Parte da 027 (última definição). Muda só o derived_balance da conta do
-- Open Finance já sincronizada.
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
      account.current_balance,
      (
        account.source_type = 'open_finance'
        and account.last_synced_at is not null
      ) as saldo_do_banco,
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
      ), 0)::numeric as transfer_out_total,
      -- Agregado interno (nao e coluna OUT): soma dos deltas assinados dos
      -- ajustes de saldo da conta. Nao altera o contrato publico da 009.
      coalesce(sum(transaction.adjustment_delta) filter (
        where transaction.transaction_type = 'adjustment'
          and transaction.account_id = account.id
      ), 0)::numeric as adjustment_total
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
    group by
      account.id,
      account.initial_balance,
      account.current_balance,
      account.source_type,
      account.last_synced_at
  )
  select
    movement.account_id,
    movement.initial_balance,
    movement.income_total,
    movement.expense_total,
    movement.transfer_in_total,
    movement.transfer_out_total,
    (
      case
        -- O banco é a fonte do saldo; o extrato importado não cobre a
        -- história inteira da conta.
        when movement.saldo_do_banco then movement.current_balance
        else
          movement.initial_balance
          + movement.income_total
          - movement.expense_total
          + movement.transfer_in_total
          - movement.transfer_out_total
          + movement.adjustment_total
      end
    )::numeric as derived_balance
  from movements as movement
  order by movement.account_id;
end;
$$;

alter function public.get_derived_account_balances() owner to postgres;

revoke all on function public.get_derived_account_balances()
  from public, anon, authenticated;
grant execute on function public.get_derived_account_balances()
  to authenticated;

comment on function public.get_derived_account_balances() is
  'Saldo oficial por conta do workspace autenticado. Conta manual: derivado dos lancamentos completed, incluindo ajustes. Conta do Open Finance sincronizada: saldo informado pelo banco (current_balance, gravado pelo backend na convencao do app, cartao negativo quando ha fatura).';
comment on function public.proteger_conta_do_open_finance() is
  'Impede o app (JWT authenticated/anon, inclusive dentro de RPC security definer) de editar ou excluir dados que o banco mantem numa conta do Open Finance. service_role, job sem JWT e cascata de FK passam.';
comment on function public.proteger_lancamento_do_open_finance() is
  'Impede o app de editar valor, data, conta, tipo, descricao ou auto_confirm, ou de excluir lancamento do Open Finance. Categoria, observacao, competencia e o resto de metadata seguem editaveis.';
comment on function public.recusar_ajuste_em_conta_do_open_finance() is
  'Recusa ajuste de saldo em conta do Open Finance: o saldo dela e o do banco.';

commit;
