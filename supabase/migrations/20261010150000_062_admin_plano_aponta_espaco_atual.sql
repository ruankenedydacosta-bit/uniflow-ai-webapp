begin;

-- Quem ganhou plano manual sem ter espaço abria /app/registros e recebia
-- financial_balance_workspace_required. A 059 passou a criar o "Perfil PF"
-- em admin_grant_manual_plan, mas não apontou profiles.current_workspace_id
-- para ele. O app cai no primeiro espaço quando o campo é nulo; as RPCs de
-- saldo (get_derived_workspace_balance e get_derived_account_balances) não.
-- Agora a função preenche o campo quando ele está nulo, e o backfill corrige
-- quem já ficou assim.

-- Igual à 059, mais o update de profiles.current_workspace_id.
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
    if not exists (select 1 from auth.users where id = p_user_id) then
      raise exception 'Usuário inexistente.'
        using errcode = 'P0001', hint = 'admin_usuario_inexistente';
    end if;

    insert into public.workspaces (name, workspace_type, owner_user_id)
    values ('Perfil PF', 'personal', p_user_id)
    returning id into v_workspace_id;
  end if;

  update public.profiles
  set current_workspace_id = v_workspace_id
  where id = p_user_id
    and current_workspace_id is null;

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

-- Perfil sem espaço atual que já é membro ativo de algum: aponta para o
-- pessoal mais antigo, ou para o mais antigo de qualquer tipo.
update public.profiles as profile
set current_workspace_id = (
  select member.workspace_id
  from public.workspace_members as member
  join public.workspaces as workspace on workspace.id = member.workspace_id
  where member.user_id = profile.id
    and member.status = 'active'
  order by (workspace.workspace_type = 'personal') desc, workspace.created_at
  limit 1
)
where profile.current_workspace_id is null
  and exists (
    select 1
    from public.workspace_members as member
    where member.user_id = profile.id
      and member.status = 'active'
  );

commit;
