begin;

-- Teto diário de chamadas à IA do chat (Edge Function uni-chat-llm) por
-- pessoa. Não é cota de plano: é a trava contra uso sem limite, já que a
-- função chama a OpenAI a cada pedido e qualquer conta logada pode chamá-la.
--
-- O dia é o de São Paulo. Escrita e leitura só por uni_llm_consume_call,
-- chamada pela Edge Function com service_role.

create table if not exists public.uni_llm_daily_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  calls integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date),
  constraint uni_llm_daily_usage_calls_check check (calls >= 0)
);

alter table public.uni_llm_daily_usage enable row level security;
revoke all on table public.uni_llm_daily_usage from anon, authenticated;

comment on table public.uni_llm_daily_usage is
  'Chamadas à IA do chat por pessoa e dia (São Paulo). Escrita só por uni_llm_consume_call.';

-- Consome uma chamada do dia. Devolve allowed = false, sem contar, quando o
-- teto já foi atingido. O upsert com WHERE serializa duas abas pedindo ao
-- mesmo tempo na mesma linha.
create or replace function public.uni_llm_consume_call(p_user_id uuid, p_daily_limit integer)
returns table (allowed boolean, calls integer)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_calls integer;
begin
  if p_user_id is null or p_daily_limit is null or p_daily_limit < 1 then
    raise exception 'uni_llm_consume_call: parâmetros inválidos';
  end if;

  insert into public.uni_llm_daily_usage as usage (user_id, usage_date, calls)
  values (p_user_id, v_today, 1)
  on conflict (user_id, usage_date) do update
    set calls = usage.calls + 1, updated_at = now()
    where usage.calls < p_daily_limit
  returning usage.calls into v_calls;

  if v_calls is null then
    select u.calls into v_calls
    from public.uni_llm_daily_usage u
    where u.user_id = p_user_id and u.usage_date = v_today;
    return query select false, coalesce(v_calls, p_daily_limit);
    return;
  end if;

  -- Só o dia corrente decide. Linhas com mais de 30 dias saem aqui mesmo,
  -- sem job à parte.
  delete from public.uni_llm_daily_usage u
  where u.user_id = p_user_id and u.usage_date < v_today - 30;

  return query select true, v_calls;
end;
$$;

revoke execute on function public.uni_llm_consume_call(uuid, integer) from public, anon, authenticated;
grant execute on function public.uni_llm_consume_call(uuid, integer) to service_role;

commit;
