begin;

-- Lançamento previsto com "Confirmar automaticamente na data" ligado
-- (metadata.auto_confirm = true) vira realizado no dia. Sem a opção, o
-- previsto espera a pessoa confirmar. A data do lançamento não muda: é a
-- data de vencimento.

create index if not exists transactions_pending_auto_confirm_idx
  on public.transactions (transaction_date)
  where status = 'pending' and metadata ->> 'auto_confirm' = 'true';

create or replace function public.confirm_due_planned_transactions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.transactions
  set status = 'completed'
  where status = 'pending'
    and metadata ->> 'auto_confirm' = 'true'
    and transaction_date <= (now() at time zone 'America/Sao_Paulo')::date;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.confirm_due_planned_transactions() from public, anon, authenticated;
grant execute on function public.confirm_due_planned_transactions() to service_role;

create extension if not exists pg_cron with schema extensions;

-- 03:10 UTC = 00:10 em Brasília, logo depois da virada do dia.
select
  cron.schedule(
    'confirm-due-planned-transactions',
    '10 3 * * *',
    $$ select public.confirm_due_planned_transactions(); $$
  );

commit;
