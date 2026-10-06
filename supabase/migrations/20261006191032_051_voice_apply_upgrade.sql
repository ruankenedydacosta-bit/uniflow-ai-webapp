begin;

-- Épico #116 / #114: upgrade imediato. Quem sobe de plano paga a diferença
-- numa cobrança avulsa; quando ela é confirmada, o webhook chama esta função
-- e o nível novo vale já no ciclo atual, com a cota dele.
--
-- Atribuição, não soma: a cota do ciclo passa a ser a do nível novo (ou
-- continua a atual, se já for maior). Repetir a chamada para a mesma
-- cobrança não muda nada. A troca agendada para o mesmo nível sai, porque já
-- foi aplicada.
create or replace function public.voice_apply_upgrade(p_subscription_id uuid, p_tier_id text, p_asaas_payment_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscription public.subscriptions%rowtype;
  v_seconds integer;
  v_cycle_id uuid;
begin
  select * into v_subscription from public.subscriptions where id = p_subscription_id for update;
  if v_subscription.id is null then
    raise exception 'Assinatura não encontrada.' using errcode = 'P0001', hint = 'voz_assinatura_inexistente';
  end if;

  select voice_seconds_per_cycle into v_seconds from public.subscription_tiers where id = p_tier_id;
  if v_seconds is null then
    raise exception 'Plano desconhecido.' using errcode = 'P0001', hint = 'voz_nivel_inexistente';
  end if;

  update public.subscriptions
  set tier_id = p_tier_id,
      pending_tier_id = case when pending_tier_id = p_tier_id then null else pending_tier_id end
  where id = v_subscription.id;

  v_cycle_id := public.voice_current_cycle_id(v_subscription.workspace_id);
  if v_cycle_id is not null then
    perform 1 from public.voice_cycles where id = v_cycle_id for update;
    update public.voice_cycles
    set tier_id = p_tier_id,
        seconds_granted = greatest(seconds_granted, v_seconds)
    where id = v_cycle_id;
  end if;

  raise log 'voice_apply_upgrade subscription=% tier=% payment=%', p_subscription_id, p_tier_id, p_asaas_payment_id;
end;
$$;

revoke execute on function public.voice_apply_upgrade(uuid, text, text) from public, anon, authenticated;
grant execute on function public.voice_apply_upgrade(uuid, text, text) to service_role;

commit;
