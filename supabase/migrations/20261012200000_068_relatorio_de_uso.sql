begin;

-- Relatório de uso no painel de administração: acessos e tempo no app, e o
-- uso da Uni (prompts e minutos de voz) por pessoa.
--
-- O tempo no app vem de app_usage_days: o app chama registrar_uso_do_app()
-- ao abrir ou voltar à tela (p_retomando), a cada minuto com a tela visível
-- e ao sair da tela. Quem mede é o relógio do banco: cada chamada soma o
-- intervalo desde a anterior, se ele for de até 90 segundos. Intervalo maior
-- é pausa e não conta. A chamada de retomada nunca soma: o intervalo antes
-- dela é o tempo em segundo plano. Duas abas abertas não dobram o tempo,
-- porque o intervalo é medido desde a última chamada de qualquer uma delas.
--
-- Uma linha por pessoa e dia de São Paulo, sem rota nem tela visitada. Uso
-- que atravessa a meia-noite vira um acesso em cada dia.
--
-- Linhas com mais de 62 dias, de qualquer pessoa, saem sempre que alguém
-- abre a primeira linha do dia, sem job à parte (prazo da política de
-- privacidade).

create table if not exists public.app_usage_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  active_seconds integer not null default 0,
  visits integer not null default 1,
  primary key (user_id, usage_date),
  constraint app_usage_days_active_seconds_check check (active_seconds >= 0),
  constraint app_usage_days_visits_check check (visits >= 1)
);

create index if not exists app_usage_days_usage_date_idx
  on public.app_usage_days (usage_date);

alter table public.app_usage_days enable row level security;
revoke all on table public.app_usage_days from anon, authenticated;

comment on table public.app_usage_days is
  'Acessos e tempo com o app aberto por pessoa e dia (São Paulo). Escrita só por registrar_uso_do_app.';

-- Acesso novo: primeira chamada do dia ou volta depois de 30 minutos parado.
create or replace function public.registrar_uso_do_app(p_retomando boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_inserted boolean;
begin
  if v_user_id is null then
    raise exception 'Sessão expirada.' using errcode = '42501';
  end if;

  insert into public.app_usage_days as usage (user_id, usage_date)
  values (v_user_id, v_today)
  on conflict (user_id, usage_date) do update
    set active_seconds = usage.active_seconds + case
          when not coalesce(p_retomando, false)
            and now() - usage.last_seen_at <= interval '90 seconds'
            then floor(extract(epoch from now() - usage.last_seen_at))::integer
          else 0
        end,
        visits = usage.visits + case
          when now() - usage.last_seen_at > interval '30 minutes' then 1
          else 0
        end,
        last_seen_at = now()
  returning (xmax = 0) into v_inserted;

  if v_inserted then
    delete from public.app_usage_days u
    where u.usage_date < v_today - 61;
  end if;
end;
$$;

-- Uso de cada pessoa nos últimos p_days dias de São Paulo, hoje incluído.
-- Só entra quem teve algum uso no período. Prompts são as mensagens da pessoa
-- à Uni, escritas ou repassadas pela conversa por voz, enquanto a conversa
-- existir. Minutos de voz são os cobrados da cota; sessão ainda aberta conta
-- o tempo até agora, até o limite da reserva.
create or replace function public.admin_usage_report(p_days integer)
returns table (
  user_id uuid,
  email text,
  full_name text,
  active_days integer,
  visits integer,
  active_seconds integer,
  last_seen_at timestamptz,
  prompts integer,
  voice_sessions integer,
  voice_seconds integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_start_date date;
  v_start_at timestamptz;
begin
  perform public.platform_admin_require();

  if p_days is null or p_days < 1 or p_days > 60 then
    raise exception 'Período inválido.'
      using errcode = 'P0001', hint = 'admin_periodo_relatorio_invalido';
  end if;

  v_start_date := (now() at time zone 'America/Sao_Paulo')::date - (p_days - 1);
  v_start_at := v_start_date::timestamp at time zone 'America/Sao_Paulo';

  return query
  with uso as (
    select
      d.user_id,
      count(*)::integer as active_days,
      sum(d.visits)::integer as visits,
      sum(d.active_seconds)::integer as active_seconds,
      max(d.last_seen_at) as last_seen_at
    from public.app_usage_days d
    where d.usage_date >= v_start_date
    group by d.user_id
  ),
  mensagens as (
    select m.user_id, count(*)::integer as prompts
    from public.uni_messages m
    where m.role = 'user' and m.created_at >= v_start_at
    group by m.user_id
  ),
  voz as (
    select
      s.user_id,
      count(*)::integer as voice_sessions,
      sum(coalesce(
        s.charged_seconds,
        least(s.reserved_seconds, greatest(0, floor(extract(epoch from now() - s.started_at)))::integer)
      ))::integer as voice_seconds
    from public.voice_sessions s
    where s.started_at >= v_start_at
    group by s.user_id
  ),
  pessoas as (
    select uso.user_id from uso
    union
    select mensagens.user_id from mensagens
    union
    select voz.user_id from voz
  )
  select
    u.id,
    u.email::text,
    p.full_name,
    coalesce(uso.active_days, 0),
    coalesce(uso.visits, 0),
    coalesce(uso.active_seconds, 0),
    uso.last_seen_at,
    coalesce(mensagens.prompts, 0),
    coalesce(voz.voice_sessions, 0),
    coalesce(voz.voice_seconds, 0)
  from pessoas
  join auth.users u on u.id = pessoas.user_id
  left join public.profiles p on p.id = u.id
  left join uso on uso.user_id = u.id
  left join mensagens on mensagens.user_id = u.id
  left join voz on voz.user_id = u.id
  order by coalesce(uso.active_seconds, 0) desc, u.created_at;
end;
$$;

revoke execute on function public.registrar_uso_do_app(boolean) from public, anon;
revoke execute on function public.admin_usage_report(integer) from public, anon;
grant execute on function public.registrar_uso_do_app(boolean) to authenticated;
grant execute on function public.admin_usage_report(integer) to authenticated;

commit;
