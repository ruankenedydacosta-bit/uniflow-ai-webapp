begin;

-- Épico #116 / #113: cota de minutos da conversa por voz em tempo real.
--
-- Cada cobrança paga abre um ciclo (voice_cycles) com os segundos do nível
-- da assinatura. Cada conversa é uma sessão (voice_sessions) que reserva um
-- bloco de até 5 minutos ao abrir, renova enquanto dura e, ao encerrar, é
-- cobrada pelo relógio do banco, nunca pelo que o app informa.
--
-- Não há contador de saldo: o saldo é sempre a cota do ciclo menos o que as
-- sessões cobraram (ou reservaram, se ainda abertas ou abandonadas). Toda
-- operação trava a linha do ciclo (FOR UPDATE), o que serializa duas abas
-- abrindo conversa ao mesmo tempo.
--
-- Escrita só por estas funções. O app lê o saldo por get_my_voice_balance().

create table if not exists public.voice_cycles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  tier_id text not null references public.subscription_tiers(id) on delete restrict,
  seconds_granted integer not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  asaas_payment_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint voice_cycles_seconds_check check (seconds_granted >= 0),
  constraint voice_cycles_period_check check (ends_at > starts_at)
);

create unique index if not exists voice_cycles_asaas_payment_id_uidx
  on public.voice_cycles (asaas_payment_id)
  where asaas_payment_id is not null;

create index if not exists voice_cycles_workspace_starts_idx
  on public.voice_cycles (workspace_id, starts_at desc);

drop trigger if exists voice_cycles_set_updated_at on public.voice_cycles;
create trigger voice_cycles_set_updated_at
before update on public.voice_cycles
for each row execute function public.set_updated_at();

create table if not exists public.voice_sessions (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.voice_cycles(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'open',
  reserved_seconds integer not null,
  charged_seconds integer,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  closed_at timestamptz,
  renewals integer not null default 0,
  constraint voice_sessions_status_check check (status in ('open', 'closed', 'expired', 'failed')),
  constraint voice_sessions_reserved_check check (reserved_seconds >= 0),
  constraint voice_sessions_charged_check check (
    charged_seconds is null or (charged_seconds >= 0 and charged_seconds <= reserved_seconds)
  )
);

create index if not exists voice_sessions_cycle_idx on public.voice_sessions (cycle_id);
create index if not exists voice_sessions_user_open_idx
  on public.voice_sessions (user_id)
  where status = 'open';

alter table public.voice_cycles enable row level security;
alter table public.voice_sessions enable row level security;
revoke all on table public.voice_cycles from anon, authenticated;
revoke all on table public.voice_sessions from anon, authenticated;

comment on table public.voice_cycles is
  'Ciclo de minutos de voz, aberto por cobrança paga. Escrita só por voice_grant_cycle.';
comment on table public.voice_sessions is
  'Conversa por voz: reserva por bloco, renovação e encerramento cobrado pelo relógio do banco.';

-- Segundos já comprometidos no ciclo. Sessão aberta ou abandonada conta pela
-- reserva inteira; encerrada, pelo que foi cobrado; falha de conexão, zero.
create or replace function public.voice_cycle_committed_seconds(p_cycle_id uuid, p_exclude_session_id uuid default null)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(coalesce(charged_seconds, reserved_seconds)), 0)::integer
  from public.voice_sessions
  where cycle_id = p_cycle_id
    and status <> 'failed'
    and (p_exclude_session_id is null or id <> p_exclude_session_id);
$$;

-- Guarda do banco: nenhuma escrita em voice_sessions, nem por service_role,
-- reserva além da cota do ciclo. As funções abaixo já respeitam isso; o
-- trigger cobre qualquer caminho futuro que escreva direto na tabela.
create or replace function public.voice_sessions_enforce_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_granted integer;
  v_committed integer;
begin
  if new.status = 'failed' then
    return new;
  end if;
  select seconds_granted into v_granted from public.voice_cycles where id = new.cycle_id;
  v_committed := public.voice_cycle_committed_seconds(new.cycle_id, new.id);
  if v_committed + coalesce(new.charged_seconds, new.reserved_seconds) > v_granted then
    raise exception 'Os minutos de voz deste ciclo acabaram.'
      using errcode = 'P0001', hint = 'voz_sem_saldo';
  end if;
  return new;
end;
$$;

drop trigger if exists voice_sessions_enforce_quota on public.voice_sessions;
create trigger voice_sessions_enforce_quota
before insert or update of reserved_seconds, charged_seconds, status on public.voice_sessions
for each row execute function public.voice_sessions_enforce_quota();

-- Workspace pessoal do usuário: a assinatura do Plano Pessoal vive nele
-- (ver src/features/personal-plan/resolvePersonalWorkspaceId.js).
create or replace function public.voice_personal_workspace_id(p_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.workspaces
  where owner_user_id = p_user_id
    and workspace_type = 'personal'
  order by created_at
  limit 1;
$$;

-- Ciclo vigente do workspace: o de início mais recente que já começou e
-- ainda não terminou.
create or replace function public.voice_current_cycle_id(p_workspace_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.voice_cycles
  where workspace_id = p_workspace_id
    and starts_at <= now()
    and ends_at > now()
  order by starts_at desc
  limit 1;
$$;

-- Fecha as conversas abertas do usuário: a que ainda está no prazo é cobrada
-- pelo tempo corrido; a abandonada (prazo vencido) fica com o bloco inteiro.
create or replace function public.voice_close_open_sessions(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.voice_sessions
  set status = 'expired',
      charged_seconds = reserved_seconds,
      closed_at = now()
  where user_id = p_user_id
    and status = 'open'
    and expires_at <= now();

  update public.voice_sessions
  set status = 'closed',
      charged_seconds = least(reserved_seconds, greatest(0, floor(extract(epoch from now() - started_at))::integer)),
      closed_at = now()
  where user_id = p_user_id
    and status = 'open';
end;
$$;

-- Bloco máximo por reserva e saldo mínimo para abrir uma conversa.
create or replace function public.voice_block_seconds()
returns integer
language sql
immutable
as $$ select 300 $$;

create or replace function public.voice_min_open_seconds()
returns integer
language sql
immutable
as $$ select 30 $$;

-- Chamado pela Edge Function uni-voice-realtime-session (service_role) antes
-- de emitir a chave da conversa. Abrir uma conversa encerra as outras do
-- mesmo usuário: duas abas não somam reservas.
create or replace function public.voice_reserve_block(p_user_id uuid)
returns table (session_id uuid, reserved_seconds integer, expires_at timestamptz, remaining_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_cycle public.voice_cycles%rowtype;
  v_cycle_id uuid;
  v_available integer;
  v_reserve integer;
  v_session public.voice_sessions%rowtype;
begin
  v_workspace_id := public.voice_personal_workspace_id(p_user_id);
  if v_workspace_id is null or not exists (
    select 1 from public.subscriptions
    where workspace_id = v_workspace_id and status = 'active'
  ) then
    raise exception 'Sem assinatura ativa.' using errcode = 'P0001', hint = 'voz_sem_assinatura';
  end if;

  v_cycle_id := public.voice_current_cycle_id(v_workspace_id);
  if v_cycle_id is null then
    raise exception 'Sem ciclo de minutos vigente.' using errcode = 'P0001', hint = 'voz_sem_saldo';
  end if;
  select * into v_cycle from public.voice_cycles where id = v_cycle_id for update;

  perform public.voice_close_open_sessions(p_user_id);

  v_available := v_cycle.seconds_granted - public.voice_cycle_committed_seconds(v_cycle.id);
  if v_available < public.voice_min_open_seconds() then
    raise exception 'Os minutos de voz deste ciclo acabaram.' using errcode = 'P0001', hint = 'voz_sem_saldo';
  end if;

  v_reserve := least(public.voice_block_seconds(), v_available);
  insert into public.voice_sessions (cycle_id, workspace_id, user_id, reserved_seconds, expires_at)
  values (v_cycle.id, v_workspace_id, p_user_id, v_reserve, now() + make_interval(secs => v_reserve + 30))
  returning * into v_session;

  return query select v_session.id, v_session.reserved_seconds, v_session.expires_at, v_available - v_reserve;
end;
$$;

-- A OpenAI recusou a sessão depois da reserva: nada é cobrado.
create or replace function public.voice_release_failed(p_session_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.voice_sessions
  set status = 'failed', charged_seconds = 0, closed_at = now()
  where id = p_session_id and status = 'open';
$$;

-- Chamado pelo app enquanto a conversa dura. Só renova a própria sessão,
-- aberta, no prazo e num ciclo que ainda vale. Sem saldo, devolve zero e o
-- app encerra a conversa no fim do bloco.
create or replace function public.voice_renew_block(p_session_id uuid)
returns table (reserved_seconds integer, expires_at timestamptz, added_seconds integer, remaining_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.voice_sessions%rowtype;
  v_cycle public.voice_cycles%rowtype;
  v_available integer;
  v_add integer;
begin
  select * into v_session from public.voice_sessions where id = p_session_id;
  if v_session.id is null or v_session.user_id is distinct from auth.uid() then
    raise exception 'Conversa não encontrada.' using errcode = 'P0001', hint = 'voz_sessao_invalida';
  end if;

  select * into v_cycle from public.voice_cycles where id = v_session.cycle_id for update;
  select * into v_session from public.voice_sessions where id = p_session_id for update;

  if v_session.status <> 'open' or v_session.expires_at <= now() or v_cycle.ends_at <= now() then
    raise exception 'A conversa já terminou.' using errcode = 'P0001', hint = 'voz_sessao_encerrada';
  end if;

  v_available := v_cycle.seconds_granted - public.voice_cycle_committed_seconds(v_cycle.id);
  v_add := greatest(0, least(public.voice_block_seconds(), v_available));

  if v_add > 0 then
    update public.voice_sessions s
    set reserved_seconds = s.reserved_seconds + v_add,
        expires_at = s.started_at + make_interval(secs => s.reserved_seconds + v_add + 30),
        renewals = s.renewals + 1
    where s.id = p_session_id
    returning * into v_session;
  end if;

  return query select v_session.reserved_seconds, v_session.expires_at, v_add, v_available - v_add;
end;
$$;

-- Chamado pelo app ao encerrar. O tempo cobrado é o do relógio do banco,
-- nunca um valor informado pelo app. Repetir a chamada não muda nada.
create or replace function public.voice_close(p_session_id uuid)
returns table (charged_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.voice_sessions%rowtype;
begin
  select * into v_session from public.voice_sessions where id = p_session_id;
  if v_session.id is null or v_session.user_id is distinct from auth.uid() then
    raise exception 'Conversa não encontrada.' using errcode = 'P0001', hint = 'voz_sessao_invalida';
  end if;

  if v_session.status = 'open' then
    perform 1 from public.voice_cycles where id = v_session.cycle_id for update;
    update public.voice_sessions s
    set status = case when s.expires_at <= now() then 'expired' else 'closed' end,
        charged_seconds = case
          when s.expires_at <= now() then s.reserved_seconds
          else least(s.reserved_seconds, greatest(0, floor(extract(epoch from now() - s.started_at))::integer))
        end,
        closed_at = now()
    where s.id = p_session_id and s.status = 'open'
    returning * into v_session;
  end if;

  return query select v_session.charged_seconds;
end;
$$;

-- Chamado pelo webhook e pelo billing-sync (service_role) para cada cobrança
-- paga de assinatura. Idempotente pelo id da cobrança. Aplica a troca de
-- plano agendada e avança current_period_ends_at, que a renovação não
-- avançava. O período vai do vencimento ao mesmo dia do mês seguinte, no
-- fuso de São Paulo: pagar adiantado não corta o ciclo atual e pagar
-- atrasado não desloca o próximo vencimento.
create or replace function public.voice_grant_cycle(p_subscription_id uuid, p_asaas_payment_id text, p_due_date date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscription public.subscriptions%rowtype;
  v_tier_id text;
  v_seconds integer;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_cycle_id uuid;
begin
  select id into v_cycle_id from public.voice_cycles where asaas_payment_id = p_asaas_payment_id;
  if v_cycle_id is not null then
    return v_cycle_id;
  end if;

  select * into v_subscription from public.subscriptions where id = p_subscription_id for update;
  if v_subscription.id is null then
    raise exception 'Assinatura não encontrada.' using errcode = 'P0001', hint = 'voz_assinatura_inexistente';
  end if;

  v_tier_id := coalesce(v_subscription.pending_tier_id, v_subscription.tier_id);
  select voice_seconds_per_cycle into v_seconds from public.subscription_tiers where id = v_tier_id;

  v_ends_at := ((p_due_date + interval '1 month')::date)::timestamp at time zone 'America/Sao_Paulo';
  v_starts_at := least(greatest(now(), p_due_date::timestamp at time zone 'America/Sao_Paulo'), v_ends_at - interval '1 second');

  insert into public.voice_cycles (workspace_id, subscription_id, tier_id, seconds_granted, starts_at, ends_at, asaas_payment_id)
  values (v_subscription.workspace_id, v_subscription.id, v_tier_id, v_seconds, v_starts_at, v_ends_at, p_asaas_payment_id)
  on conflict (asaas_payment_id) where asaas_payment_id is not null do nothing
  returning id into v_cycle_id;

  if v_cycle_id is null then
    select id into v_cycle_id from public.voice_cycles where asaas_payment_id = p_asaas_payment_id;
    return v_cycle_id;
  end if;

  update public.subscriptions
  set tier_id = v_tier_id,
      pending_tier_id = null,
      current_period_ends_at = greatest(coalesce(current_period_ends_at, v_ends_at), v_ends_at)
  where id = v_subscription.id;

  return v_cycle_id;
end;
$$;

-- Saldo de quem está logado, para o app decidir se abre a conversa por voz
-- ou vai direto ao texto.
create or replace function public.get_my_voice_balance()
returns table (
  tier_id text,
  seconds_granted integer,
  remaining_seconds integer,
  cycle_ends_at timestamptz,
  has_active_subscription boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_subscription public.subscriptions%rowtype;
  v_cycle public.voice_cycles%rowtype;
begin
  v_workspace_id := public.voice_personal_workspace_id(auth.uid());
  select * into v_subscription
  from public.subscriptions
  where workspace_id = v_workspace_id and status = 'active'
  order by created_at desc
  limit 1;

  select * into v_cycle from public.voice_cycles where id = public.voice_current_cycle_id(v_workspace_id);

  return query select
    coalesce(v_cycle.tier_id, v_subscription.tier_id),
    coalesce(v_cycle.seconds_granted, 0),
    case when v_cycle.id is null then 0
      else greatest(0, v_cycle.seconds_granted - public.voice_cycle_committed_seconds(v_cycle.id)) end,
    v_cycle.ends_at,
    v_subscription.id is not null;
end;
$$;

-- Permissões: as funções internas não são chamáveis de fora; reservar,
-- liberar e creditar ciclo só pelo backend; renovar, encerrar e ler o saldo
-- pelo app logado.
revoke execute on function public.voice_cycle_committed_seconds(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.voice_sessions_enforce_quota() from public, anon, authenticated;
revoke execute on function public.voice_personal_workspace_id(uuid) from public, anon, authenticated;
revoke execute on function public.voice_current_cycle_id(uuid) from public, anon, authenticated;
revoke execute on function public.voice_close_open_sessions(uuid) from public, anon, authenticated;
revoke execute on function public.voice_reserve_block(uuid) from public, anon, authenticated;
revoke execute on function public.voice_release_failed(uuid) from public, anon, authenticated;
revoke execute on function public.voice_grant_cycle(uuid, text, date) from public, anon, authenticated;
revoke execute on function public.voice_renew_block(uuid) from public, anon;
revoke execute on function public.voice_close(uuid) from public, anon;
revoke execute on function public.get_my_voice_balance() from public, anon;

grant execute on function public.voice_reserve_block(uuid) to service_role;
grant execute on function public.voice_release_failed(uuid) to service_role;
grant execute on function public.voice_grant_cycle(uuid, text, date) to service_role;
grant execute on function public.voice_renew_block(uuid) to authenticated;
grant execute on function public.voice_close(uuid) to authenticated;
grant execute on function public.get_my_voice_balance() to authenticated;

-- Quem já assina ganha um ciclo agora, com a cota do seu nível. Ele é
-- substituído pelo ciclo da próxima cobrança paga.
insert into public.voice_cycles (workspace_id, subscription_id, tier_id, seconds_granted, starts_at, ends_at)
select s.workspace_id, s.id, s.tier_id, t.voice_seconds_per_cycle, now(), now() + interval '1 month'
from public.subscriptions s
join public.subscription_tiers t on t.id = s.tier_id
where s.status = 'active'
  and not exists (select 1 from public.voice_cycles c where c.subscription_id = s.id);

commit;
