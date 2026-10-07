begin;

-- Teto de IA por plano (uni-chat-llm e uni-interpret).
--
-- A 053 contava chamadas com um teto único de 300 por dia. Uma chamada custa
-- de R$ 0,002 (lançamento no gpt-5.6-luna) a R$ 0,01 (plano financeiro no
-- gpt-5.4-mini), então contar chamadas não segura o custo: no teto de 300
-- por dia, uma pessoa gastaria até R$ 90 por mês. Agora são dois medidores,
-- como no Setly e no EvoCorpus:
--   - chamadas por dia, contra rajada e abuso;
--   - custo do mês em reais, o guardião de verdade, somado a partir dos
--     tokens que a OpenAI devolve em cada chamada.
-- Ao atingir qualquer um dos dois, a IA para até o dia ou o mês virar. O app
-- segue com as regras sem IA, então o registro por texto continua.
--
-- Valores: o teto do mês fica em cerca de 7% do preço do plano. A proposta de
-- planos já reserva R$ 0,59 por assinante para a IA de lançamentos (300
-- frases por mês no Luna); o teto cobre esse uso com folga para perguntas ao
-- chat sem tirar mais de R$ 4,41 do lucro do plano mais caro no pior caso.

alter table public.subscription_tiers
  add column if not exists ai_daily_call_limit integer,
  add column if not exists ai_monthly_cost_brl numeric(8,2);

update public.subscription_tiers set ai_daily_call_limit = 40, ai_monthly_cost_brl = 1.00 where id = 'essencial';
update public.subscription_tiers set ai_daily_call_limit = 80, ai_monthly_cost_brl = 2.00 where id = 'uni_voz';
update public.subscription_tiers set ai_daily_call_limit = 200, ai_monthly_cost_brl = 5.00 where id = 'uni_voz_plus';

alter table public.subscription_tiers
  alter column ai_daily_call_limit set not null,
  alter column ai_monthly_cost_brl set not null;

alter table public.subscription_tiers
  drop constraint if exists subscription_tiers_ai_limits_check;
alter table public.subscription_tiers
  add constraint subscription_tiers_ai_limits_check
  check (ai_daily_call_limit > 0 and ai_monthly_cost_brl > 0);

comment on column public.subscription_tiers.ai_daily_call_limit is
  'Chamadas à IA (uni-chat-llm e uni-interpret) por pessoa e dia de São Paulo.';
comment on column public.subscription_tiers.ai_monthly_cost_brl is
  'Custo máximo de IA por pessoa no mês de São Paulo, em reais.';

alter table public.uni_llm_daily_usage
  add column if not exists cost_brl numeric(12,4) not null default 0;

alter table public.uni_llm_daily_usage
  drop constraint if exists uni_llm_daily_usage_cost_check;
alter table public.uni_llm_daily_usage
  add constraint uni_llm_daily_usage_cost_check check (cost_brl >= 0);

comment on table public.uni_llm_daily_usage is
  'Chamadas e custo de IA por pessoa e dia (São Paulo). Escrita só por uni_llm_reserve_call e uni_llm_record_cost.';

-- Nível que decide os tetos: o da assinatura ativa do workspace pessoal. Sem
-- assinatura ativa, vale o Essencial.
create or replace function public.uni_llm_user_tier_id(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select s.tier_id
      from public.subscriptions s
      where s.workspace_id = public.voice_personal_workspace_id(p_user_id)
        and s.status = 'active'
      order by s.created_at desc
      limit 1
    ),
    'essencial'
  );
$$;

revoke execute on function public.uni_llm_user_tier_id(uuid) from public, anon, authenticated;
grant execute on function public.uni_llm_user_tier_id(uuid) to service_role;

-- Reserva uma chamada antes de chamar a OpenAI. reason: 'ok',
-- 'daily_limit' ou 'monthly_ceiling'; recusada, não conta nada. O custo
-- real entra depois, por uni_llm_record_cost.
create or replace function public.uni_llm_reserve_call(p_user_id uuid)
returns table (allowed boolean, reason text, calls integer, month_cost_brl numeric)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_month_start date := date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;
  v_daily_limit integer;
  v_monthly_cost numeric;
  v_month_cost numeric;
  v_calls integer;
begin
  if p_user_id is null then
    raise exception 'uni_llm_reserve_call: usuário obrigatório';
  end if;

  -- Duas abas pedindo ao mesmo tempo leem o mesmo total do mês.
  perform pg_advisory_xact_lock(hashtextextended('uni_llm:' || p_user_id::text, 0));

  select t.ai_daily_call_limit, t.ai_monthly_cost_brl
    into v_daily_limit, v_monthly_cost
  from public.subscription_tiers t
  where t.id = public.uni_llm_user_tier_id(p_user_id);

  if v_daily_limit is null then
    select t.ai_daily_call_limit, t.ai_monthly_cost_brl
      into v_daily_limit, v_monthly_cost
    from public.subscription_tiers t
    where t.id = 'essencial';
  end if;

  select coalesce(sum(u.cost_brl), 0) into v_month_cost
  from public.uni_llm_daily_usage u
  where u.user_id = p_user_id and u.usage_date >= v_month_start;

  select coalesce(u.calls, 0) into v_calls
  from public.uni_llm_daily_usage u
  where u.user_id = p_user_id and u.usage_date = v_today;
  v_calls := coalesce(v_calls, 0);

  if v_month_cost >= v_monthly_cost then
    return query select false, 'monthly_ceiling'::text, v_calls, v_month_cost;
    return;
  end if;
  if v_calls >= v_daily_limit then
    return query select false, 'daily_limit'::text, v_calls, v_month_cost;
    return;
  end if;

  insert into public.uni_llm_daily_usage as usage (user_id, usage_date, calls)
  values (p_user_id, v_today, 1)
  on conflict (user_id, usage_date) do update
    set calls = usage.calls + 1, updated_at = now()
  returning usage.calls into v_calls;

  -- O mês corrente precisa ficar inteiro para a soma; o resto sai aqui
  -- mesmo, sem job à parte.
  delete from public.uni_llm_daily_usage u
  where u.user_id = p_user_id and u.usage_date < v_today - 62;

  return query select true, 'ok'::text, v_calls, v_month_cost;
end;
$$;

revoke execute on function public.uni_llm_reserve_call(uuid) from public, anon, authenticated;
grant execute on function public.uni_llm_reserve_call(uuid) to service_role;

-- Soma o custo real de uma chamada já feita ao dia de hoje.
create or replace function public.uni_llm_record_cost(p_user_id uuid, p_cost_brl numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if p_user_id is null or p_cost_brl is null or p_cost_brl < 0 or p_cost_brl > 10 then
    raise exception 'uni_llm_record_cost: parâmetros inválidos';
  end if;

  insert into public.uni_llm_daily_usage as usage (user_id, usage_date, calls, cost_brl)
  values (p_user_id, v_today, 0, p_cost_brl)
  on conflict (user_id, usage_date) do update
    set cost_brl = usage.cost_brl + excluded.cost_brl, updated_at = now();
end;
$$;

revoke execute on function public.uni_llm_record_cost(uuid, numeric) from public, anon, authenticated;
grant execute on function public.uni_llm_record_cost(uuid, numeric) to service_role;

commit;
