begin;

-- Leitura do mês escrita pela Uni (#122). Cada geração com IA conta numa
-- coluna própria de uni_llm_daily_usage, com limite diário fixado pela Edge
-- Function uni-insights. O custo vai para a mesma coluna cost_brl: a leitura
-- respeita o teto mensal por plano da migration 054, e as gerações não
-- consomem as respostas da conversa (calls).

alter table public.uni_llm_daily_usage
  add column if not exists insight_calls integer not null default 0;

alter table public.uni_llm_daily_usage
  drop constraint if exists uni_llm_daily_usage_insight_calls_check;
alter table public.uni_llm_daily_usage
  add constraint uni_llm_daily_usage_insight_calls_check check (insight_calls >= 0);

-- Reserva uma geração da Leitura do mês. reason: 'ok', 'daily_limit' ou
-- 'monthly_ceiling'; recusada, não conta nada. Mesmo lock por usuário de
-- uni_llm_reserve_call, porque as duas leem o total do mês.
create or replace function public.uni_insights_reserve_call(p_user_id uuid, p_daily_limit integer)
returns table (allowed boolean, reason text, insight_calls integer)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_month_start date := date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;
  v_monthly_cost numeric;
  v_month_cost numeric;
  v_calls integer;
begin
  if p_user_id is null or p_daily_limit is null or p_daily_limit < 1 then
    raise exception 'uni_insights_reserve_call: parâmetros inválidos';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('uni_llm:' || p_user_id::text, 0));

  select t.ai_monthly_cost_brl into v_monthly_cost
  from public.subscription_tiers t
  where t.id = public.uni_llm_user_tier_id(p_user_id);

  if v_monthly_cost is null then
    select t.ai_monthly_cost_brl into v_monthly_cost
    from public.subscription_tiers t
    where t.id = 'essencial';
  end if;

  select coalesce(sum(u.cost_brl), 0) into v_month_cost
  from public.uni_llm_daily_usage u
  where u.user_id = p_user_id and u.usage_date >= v_month_start;

  select u.insight_calls into v_calls
  from public.uni_llm_daily_usage u
  where u.user_id = p_user_id and u.usage_date = v_today;
  v_calls := coalesce(v_calls, 0);

  if v_month_cost >= v_monthly_cost then
    return query select false, 'monthly_ceiling'::text, v_calls;
    return;
  end if;
  if v_calls >= p_daily_limit then
    return query select false, 'daily_limit'::text, v_calls;
    return;
  end if;

  insert into public.uni_llm_daily_usage as usage (user_id, usage_date, calls, insight_calls)
  values (p_user_id, v_today, 0, 1)
  on conflict (user_id, usage_date) do update
    set insight_calls = usage.insight_calls + 1, updated_at = now()
  returning usage.insight_calls into v_calls;

  return query select true, 'ok'::text, v_calls;
end;
$$;

revoke execute on function public.uni_insights_reserve_call(uuid, integer) from public, anon, authenticated;
grant execute on function public.uni_insights_reserve_call(uuid, integer) to service_role;

commit;
