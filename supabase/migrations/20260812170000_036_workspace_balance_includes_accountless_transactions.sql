begin;

-- BUG REAL EM PRODUCAO: get_derived_workspace_balance() soma
-- get_derived_account_balances(), que so agrega transacoes com
-- transaction.account_id = account.id (join estrito por conta real). Desde
-- que account_id ficou nullable para receita/despesa (034/035), qualquer
-- lancamento sem conta (o caso comum agora) nunca bate nesse join -- fica
-- de fora do saldo total do workspace, silenciosamente. Confirmado com
-- dados reais: 4 lancamentos sem conta somando -R$495,00 ausentes do saldo
-- exibido em Registros ("Resumo do mes" usa exatamente esta RPC).
--
-- Correcao: get_derived_workspace_balance() passa a somar tambem, junto
-- com o total por conta, o saldo liquido dos lancamentos SEM conta do
-- workspace (income - expense + adjustment_delta assinado; transferencia
-- exige conta dos dois lados, nunca fica sem). get_derived_account_balances()
-- NAO muda -- o saldo POR conta continua correto (so soma o que pertence
-- aquela conta especifica); a correcao e so no agregado do workspace.
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
  select
    coalesce(sum(balance.derived_balance), 0)::numeric
    + (
      select coalesce(sum(transaction.amount) filter (where transaction.transaction_type = 'income'), 0)
        - coalesce(sum(transaction.amount) filter (where transaction.transaction_type = 'expense'), 0)
        + coalesce(sum(transaction.adjustment_delta) filter (where transaction.transaction_type = 'adjustment'), 0)
      from public.transactions as transaction
      where transaction.workspace_id = v_workspace_id
        and transaction.status = 'completed'
        and transaction.account_id is null
    )::numeric
  from public.get_derived_account_balances() as balance;
end;
$$;

alter function public.get_derived_workspace_balance() owner to postgres;
alter function public.get_derived_workspace_balance() security definer;
alter function public.get_derived_workspace_balance() set search_path = '';
revoke all on function public.get_derived_workspace_balance()
  from public, anon, authenticated;
grant execute on function public.get_derived_workspace_balance()
  to authenticated;

comment on function public.get_derived_workspace_balance() is
  'Saldo total do workspace: soma o saldo derivado por conta com o saldo liquido dos lancamentos sem conta (account_id null) -- nunca perde receita/despesa/ajuste sem conta associada.';

commit;
