begin;

-- Base do super admin da plataforma: quem é da equipe da UniFlow e pode ver
-- todos os usuários e conceder um plano manualmente (cortesia, parceiro,
-- teste), sem passar pela Asaas.
--
-- Quem é admin fica em platform_admins. Não há tela nem RPC para promover
-- alguém: entra e sai só por SQL no painel do Supabase, de propósito.
--
--   insert into public.platform_admins (user_id)
--   select id from auth.users where email = '<email>';
--
-- Toda leitura e escrita de admin passa pelas funções abaixo, que conferem
-- is_platform_admin() no banco. Esconder a tela no app é só conveniência.

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;
revoke all on table public.platform_admins from anon, authenticated;

comment on table public.platform_admins is
  'Equipe da UniFlow com acesso ao painel de administração. Escrita só por SQL no painel do Supabase.';

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

create or replace function public.platform_admin_require()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Acesso restrito à equipe da UniFlow.'
      using errcode = '42501', hint = 'admin_acesso_negado';
  end if;
  return auth.uid();
end;
$$;

-- Plano manual: mesma linha de subscriptions (plan_id 'pro', status
-- 'active'), para o acesso, a cota de voz e os tetos de IA valerem sem
-- nenhum caminho novo. source separa o que a Asaas cobra do que a equipe
-- concedeu; as Edge Functions de cobrança nunca tocam uma linha 'manual'.
-- Quem concedeu e o motivo ficam só em platform_admin_audit: o assinante lê
-- a própria linha de subscriptions e não deve ver nota interna.
alter table public.subscriptions
  add column if not exists source text not null default 'asaas';

alter table public.subscriptions
  drop constraint if exists subscriptions_source_check;

alter table public.subscriptions
  add constraint subscriptions_source_check check (source in ('asaas', 'manual'));

comment on column public.subscriptions.source is
  'Origem da assinatura: asaas (cobrada) ou manual (concedida pela equipe no painel de administração).';

create table if not exists public.platform_admin_audit (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_user_id uuid references auth.users(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint platform_admin_audit_action_check check (
    action in ('grant_manual_plan', 'revoke_manual_plan')
  )
);

create index if not exists platform_admin_audit_target_idx
  on public.platform_admin_audit (target_user_id, created_at desc);

alter table public.platform_admin_audit enable row level security;
revoke all on table public.platform_admin_audit from anon, authenticated;

comment on table public.platform_admin_audit is
  'Registro de toda ação feita no painel de administração. Escrita só pelas funções admin_*.';

-- Lista os 1000 cadastros mais recentes com a assinatura do workspace
-- pessoal: a corrente quando existe, senão a mais recente. O motivo é o da
-- última concessão daquela assinatura que trouxe um. A busca é feita no app,
-- sem acento, sobre esta lista.
create or replace function public.admin_list_users()
returns table (
  user_id uuid,
  email text,
  full_name text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  is_platform_admin boolean,
  subscription_id uuid,
  subscription_status text,
  subscription_source text,
  tier_id text,
  current_period_ends_at timestamptz,
  grant_note text
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  perform public.platform_admin_require();

  return query
  select
    u.id,
    u.email::text,
    p.full_name,
    u.created_at,
    u.last_sign_in_at,
    pa.user_id is not null,
    s.id,
    s.status,
    s.source,
    s.tier_id,
    s.current_period_ends_at,
    a.note
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.platform_admins pa on pa.user_id = u.id
  left join lateral (
    select s2.*
    from public.subscriptions s2
    where s2.workspace_id = public.voice_personal_workspace_id(u.id)
    order by (s2.status not in ('canceled', 'expired')) desc, s2.created_at desc
    limit 1
  ) s on true
  left join lateral (
    select a2.details ->> 'note' as note
    from public.platform_admin_audit a2
    where s.source = 'manual'
      and a2.action = 'grant_manual_plan'
      and a2.details ->> 'subscription_id' = s.id::text
      and a2.details ->> 'note' is not null
    order by a2.created_at desc
    limit 1
  ) a on true
  order by u.created_at desc
  limit 1000;
end;
$$;

-- Concede ou renova o plano manual por p_months meses a partir de agora. A
-- cota de voz do período inteiro entra num ciclo só, que termina junto com o
-- plano. Quem tem assinatura da Asaas corrente (paga ou em pagamento) fica
-- de fora: a troca de plano dessa pessoa passa pela cobrança. A exceção é o
-- checkout de cartão abandonado: pendente, sem assinatura na Asaas e parado
-- há mais de 2 horas. O checkout expira em 60 minutos
-- (CHECKOUT_MINUTES_TO_EXPIRE) e o webhook já cancela essa linha quando o
-- aviso de expiração chega; aqui ela é cancelada do mesmo jeito.
create or replace function public.admin_grant_manual_plan(
  p_user_id uuid,
  p_tier_id text,
  p_months integer,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_workspace_id uuid;
  v_seconds integer;
  v_ends_at timestamptz;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_subscription public.subscriptions%rowtype;
begin
  v_admin_id := public.platform_admin_require();

  if p_months is null or p_months < 1 or p_months > 24 then
    raise exception 'Escolha um período de 1 a 24 meses.'
      using errcode = 'P0001', hint = 'admin_periodo_invalido';
  end if;

  select voice_seconds_per_cycle into v_seconds
  from public.subscription_tiers
  where id = p_tier_id and active = true;
  if v_seconds is null then
    raise exception 'Plano inexistente.'
      using errcode = 'P0001', hint = 'admin_plano_invalido';
  end if;

  v_workspace_id := public.voice_personal_workspace_id(p_user_id);
  if v_workspace_id is null then
    raise exception 'Essa pessoa ainda não tem espaço pessoal.'
      using errcode = 'P0001', hint = 'admin_sem_workspace';
  end if;

  select * into v_subscription
  from public.subscriptions
  where workspace_id = v_workspace_id
    and status not in ('canceled', 'expired')
  order by created_at desc
  limit 1
  for update;

  if v_subscription.id is not null
    and v_subscription.source = 'asaas'
    and v_subscription.status = 'pending'
    and v_subscription.asaas_subscription_id is null
  then
    if v_subscription.updated_at > now() - interval '2 hours' then
      raise exception 'Essa pessoa abriu o pagamento há pouco.'
        using errcode = 'P0001', hint = 'admin_checkout_recente';
    end if;
    update public.subscriptions set status = 'canceled' where id = v_subscription.id;
    v_subscription := null;
  end if;

  if v_subscription.id is not null and v_subscription.source <> 'manual' then
    raise exception 'Essa pessoa tem uma assinatura paga ou em pagamento pela Asaas.'
      using errcode = 'P0001', hint = 'admin_assinatura_paga';
  end if;

  v_ends_at := now() + make_interval(months => p_months);

  if v_subscription.id is null then
    insert into public.subscriptions (workspace_id, plan_id, status, tier_id, source, current_period_ends_at)
    values (v_workspace_id, 'pro', 'active', p_tier_id, 'manual', v_ends_at)
    returning * into v_subscription;
  else
    update public.subscriptions
    set status = 'active',
        tier_id = p_tier_id,
        pending_tier_id = null,
        current_period_ends_at = v_ends_at,
        cancel_at_period_end = false,
        cancel_effective_at = null
    where id = v_subscription.id
    returning * into v_subscription;
  end if;

  -- Renovar começa um período novo: o ciclo anterior termina agora e o novo
  -- traz a cota cheia.
  update public.voice_cycles
  set ends_at = now()
  where subscription_id = v_subscription.id
    and starts_at < now()
    and ends_at > now();

  insert into public.voice_cycles (workspace_id, subscription_id, tier_id, seconds_granted, starts_at, ends_at)
  values (v_workspace_id, v_subscription.id, p_tier_id, v_seconds * p_months, now(), v_ends_at);

  insert into public.platform_admin_audit (admin_user_id, action, target_user_id, details)
  values (
    v_admin_id,
    'grant_manual_plan',
    p_user_id,
    jsonb_build_object(
      'subscription_id', v_subscription.id,
      'tier_id', p_tier_id,
      'months', p_months,
      'ends_at', v_ends_at,
      'note', v_note
    )
  );

  return v_subscription.id;
end;
$$;

-- Encerra o plano manual agora: o acesso e os minutos de voz param na hora.
create or replace function public.admin_revoke_manual_plan(
  p_user_id uuid,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_workspace_id uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_subscription public.subscriptions%rowtype;
begin
  v_admin_id := public.platform_admin_require();
  v_workspace_id := public.voice_personal_workspace_id(p_user_id);

  select * into v_subscription
  from public.subscriptions
  where workspace_id = v_workspace_id
    and status not in ('canceled', 'expired')
  order by created_at desc
  limit 1
  for update;

  if v_subscription.id is null or v_subscription.source <> 'manual' then
    raise exception 'Essa pessoa não tem plano manual ativo.'
      using errcode = 'P0001', hint = 'admin_sem_plano_manual';
  end if;

  update public.subscriptions
  set status = 'canceled',
      current_period_ends_at = now(),
      cancel_effective_at = now()
  where id = v_subscription.id;

  update public.voice_cycles
  set ends_at = now()
  where subscription_id = v_subscription.id
    and starts_at < now()
    and ends_at > now();

  insert into public.platform_admin_audit (admin_user_id, action, target_user_id, details)
  values (
    v_admin_id,
    'revoke_manual_plan',
    p_user_id,
    jsonb_build_object('subscription_id', v_subscription.id, 'note', v_note)
  );

  return v_subscription.id;
end;
$$;

-- Plano manual vencido vira 'expired'. Sem isso o acesso seguiria aberto,
-- porque o app e as funções de voz e IA olham só o status.
create or replace function public.platform_expire_manual_plans()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.subscriptions
  set status = 'expired'
  where source = 'manual'
    and status = 'active'
    and current_period_ends_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.is_platform_admin() from public, anon;
revoke execute on function public.platform_admin_require() from public, anon, authenticated;
revoke execute on function public.admin_list_users() from public, anon;
revoke execute on function public.admin_grant_manual_plan(uuid, text, integer, text) from public, anon;
revoke execute on function public.admin_revoke_manual_plan(uuid, text) from public, anon;
revoke execute on function public.platform_expire_manual_plans() from public, anon, authenticated;

grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_grant_manual_plan(uuid, text, integer, text) to authenticated;
grant execute on function public.admin_revoke_manual_plan(uuid, text) to authenticated;
grant execute on function public.platform_expire_manual_plans() to service_role;

create extension if not exists pg_cron with schema extensions;

select
  cron.schedule(
    'platform-expire-manual-plans',
    '*/5 * * * *',
    $$ select public.platform_expire_manual_plans(); $$
  );

commit;
