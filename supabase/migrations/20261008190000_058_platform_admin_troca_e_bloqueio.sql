begin;

-- Painel de administração, parte 2: troca de plano direto na lista e
-- bloqueio de usuário.
--
-- 1. Assinatura com source 'asaas' sem nenhum vínculo na Asaas (sem
--    assinatura, checkout nem cliente) não é cobrada por ninguém. É o caso de
--    linhas de teste e de quem entrou antes da integração. A migration 056
--    recusava trocar o plano dessas pessoas; agora o admin cancela essa linha
--    e concede um plano manual no lugar. Linha com qualquer vínculo continua
--    recusada: pode ser um checkout pago que o webhook ainda não ligou, e
--    trocar só aqui deixaria a Asaas cobrando o preço antigo.
-- 2. admin_set_user_plan troca o nível pela lista: plano manual ativo mantém
--    a data de fim e o consumo de voz; quem não tem plano manual ganha 1 mês.
-- 3. admin_set_user_blocked bloqueia o login pelo banned_until do Supabase
--    Auth e encerra as sessões abertas.

alter table public.platform_admin_audit
  drop constraint if exists platform_admin_audit_action_check;

alter table public.platform_admin_audit
  add constraint platform_admin_audit_action_check check (
    action in ('grant_manual_plan', 'revoke_manual_plan', 'change_manual_tier', 'block_user', 'unblock_user')
  );

-- O retorno ganha subscription_billed e is_blocked: o tipo muda, então a
-- função sai e volta.
drop function if exists public.admin_list_users();

create or replace function public.admin_list_users()
returns table (
  user_id uuid,
  email text,
  full_name text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  is_platform_admin boolean,
  is_blocked boolean,
  subscription_id uuid,
  subscription_status text,
  subscription_source text,
  subscription_billed boolean,
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
    coalesce(u.banned_until > now(), false),
    s.id,
    s.status,
    s.source,
    s.asaas_subscription_id is not null
      or s.asaas_checkout_id is not null
      or s.asaas_customer_id is not null,
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

-- Igual à 056, mais a conversão da linha da Asaas sem cobrança (item 1).
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
  v_replaced_id uuid;
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
    and v_subscription.updated_at > now() - interval '2 hours'
  then
    raise exception 'Essa pessoa abriu o pagamento há pouco.'
      using errcode = 'P0001', hint = 'admin_checkout_recente';
  end if;

  -- Checkout de cartão abandonado (regra da 056) ou linha da Asaas sem
  -- vínculo nenhum lá (item 1): sai do caminho, junto com a cota de voz que
  -- ainda corria nela.
  if v_subscription.id is not null
    and v_subscription.source = 'asaas'
    and v_subscription.asaas_subscription_id is null
    and (
      v_subscription.status = 'pending'
      or (v_subscription.asaas_checkout_id is null and v_subscription.asaas_customer_id is null)
    )
  then
    v_replaced_id := v_subscription.id;
    update public.subscriptions
    set status = 'canceled',
        current_period_ends_at = least(coalesce(current_period_ends_at, now()), now()),
        cancel_effective_at = now()
    where id = v_replaced_id;

    update public.voice_cycles
    set ends_at = now()
    where subscription_id = v_replaced_id
      and starts_at < now()
      and ends_at > now();

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
      'replaced_subscription_id', v_replaced_id,
      'tier_id', p_tier_id,
      'months', p_months,
      'ends_at', v_ends_at,
      'note', v_note
    )
  );

  return v_subscription.id;
end;
$$;

-- Troca de nível pela lista. Plano manual ativo troca o nível e mantém a
-- data de fim. O ciclo de voz corrente continua o mesmo: o que já foi usado
-- fica, e o restante passa a ser o do nível novo, proporcional ao tempo que
-- falta (30 dias = 1 mês de cota). Trocar de ida e volta não recarrega a
-- cota. Sem plano manual, concede 1 mês.
create or replace function public.admin_set_user_plan(
  p_user_id uuid,
  p_tier_id text
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
  v_remaining_seconds integer;
  v_cycle_id uuid;
  v_previous_tier text;
  v_subscription public.subscriptions%rowtype;
begin
  v_admin_id := public.platform_admin_require();

  select voice_seconds_per_cycle into v_seconds
  from public.subscription_tiers
  where id = p_tier_id and active = true;
  if v_seconds is null then
    raise exception 'Plano inexistente.'
      using errcode = 'P0001', hint = 'admin_plano_invalido';
  end if;

  v_workspace_id := public.voice_personal_workspace_id(p_user_id);

  select * into v_subscription
  from public.subscriptions
  where workspace_id = v_workspace_id
    and status not in ('canceled', 'expired')
  order by created_at desc
  limit 1
  for update;

  if v_subscription.id is null
    or v_subscription.source <> 'manual'
    or v_subscription.status <> 'active'
    or v_subscription.current_period_ends_at <= now()
  then
    return public.admin_grant_manual_plan(p_user_id, p_tier_id, 1, null);
  end if;

  if v_subscription.tier_id = p_tier_id then
    return v_subscription.id;
  end if;

  v_previous_tier := v_subscription.tier_id;
  v_remaining_seconds := round(
    v_seconds
    * extract(epoch from (v_subscription.current_period_ends_at - now()))
    / extract(epoch from interval '30 days')
  )::integer;

  update public.subscriptions
  set tier_id = p_tier_id,
      pending_tier_id = null
  where id = v_subscription.id;

  select id into v_cycle_id
  from public.voice_cycles
  where subscription_id = v_subscription.id
    and starts_at <= now()
    and ends_at > now()
  order by starts_at desc
  limit 1
  for update;

  if v_cycle_id is null then
    insert into public.voice_cycles (workspace_id, subscription_id, tier_id, seconds_granted, starts_at, ends_at)
    values (v_workspace_id, v_subscription.id, p_tier_id, v_remaining_seconds, now(), v_subscription.current_period_ends_at);
  else
    update public.voice_cycles
    set tier_id = p_tier_id,
        seconds_granted = public.voice_cycle_committed_seconds(v_cycle_id) + v_remaining_seconds
    where id = v_cycle_id;
  end if;

  insert into public.platform_admin_audit (admin_user_id, action, target_user_id, details)
  values (
    v_admin_id,
    'change_manual_tier',
    p_user_id,
    jsonb_build_object(
      'subscription_id', v_subscription.id,
      'from_tier_id', v_previous_tier,
      'tier_id', p_tier_id,
      'ends_at', v_subscription.current_period_ends_at
    )
  );

  return v_subscription.id;
end;
$$;

-- Bloqueio: banned_until é o campo que o Supabase Auth confere no login e na
-- renovação do token. Apagar as sessões derruba os refresh tokens; o access
-- token já emitido vale até expirar (1 hora no padrão). A pessoa não bloqueia
-- a si mesma nem outro admin: tirar alguém da equipe é por SQL.
create or replace function public.admin_set_user_blocked(
  p_user_id uuid,
  p_blocked boolean,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  v_admin_id := public.platform_admin_require();

  if p_blocked is null then
    raise exception 'Informe se é para bloquear ou desbloquear.'
      using errcode = 'P0001', hint = 'admin_bloqueio_invalido';
  end if;

  if p_user_id = v_admin_id then
    raise exception 'Você não pode bloquear a própria conta.'
      using errcode = 'P0001', hint = 'admin_bloquear_a_si';
  end if;

  if p_blocked and exists (select 1 from public.platform_admins where user_id = p_user_id) then
    raise exception 'Essa pessoa é da equipe.'
      using errcode = 'P0001', hint = 'admin_bloquear_admin';
  end if;

  update auth.users
  set banned_until = case when p_blocked then now() + interval '100 years' else null end
  where id = p_user_id;

  if not found then
    raise exception 'Usuário inexistente.'
      using errcode = 'P0001', hint = 'admin_usuario_inexistente';
  end if;

  if p_blocked then
    delete from auth.refresh_tokens where user_id = p_user_id::text;
    delete from auth.sessions where user_id = p_user_id;
  end if;

  insert into public.platform_admin_audit (admin_user_id, action, target_user_id, details)
  values (
    v_admin_id,
    case when p_blocked then 'block_user' else 'unblock_user' end,
    p_user_id,
    jsonb_build_object('note', v_note)
  );

  return p_blocked;
end;
$$;

revoke execute on function public.admin_list_users() from public, anon;
revoke execute on function public.admin_set_user_plan(uuid, text) from public, anon;
revoke execute on function public.admin_set_user_blocked(uuid, boolean, text) from public, anon;

grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_set_user_plan(uuid, text) to authenticated;
grant execute on function public.admin_set_user_blocked(uuid, boolean, text) to authenticated;

commit;
