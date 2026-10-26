begin;
-- Reconcile provider-side termination atomically without cutting paid access.
create or replace function public.apply_billing_lifecycle(
  p_subscription_id uuid, p_expected_updated_at timestamptz,
  p_patch jsonb, p_notices jsonb, p_payments jsonb, p_now timestamptz
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_subscription public.subscriptions%rowtype;
  v_payment jsonb;
  v_notice jsonb;
  v_member record;
  v_inserted integer;
  v_message text;
begin
  if jsonb_array_length(p_payments) > 10000 or jsonb_array_length(p_notices) > 10 then
    raise exception 'billing_batch_limit';
  end if;
  select * into v_subscription from public.subscriptions
  where id = p_subscription_id and updated_at = p_expected_updated_at for update;
  if not found then return false; end if;
  if p_patch ? 'status' and p_patch->>'status' not in ('active','past_due','suspended','canceled') then
    raise exception 'invalid_lifecycle_status';
  end if;
  for v_payment in select value from jsonb_array_elements(p_payments) loop
    if v_payment->>'asaas_subscription_id' is distinct from v_subscription.asaas_subscription_id
      or (v_payment->>'workspace_id')::uuid is distinct from v_subscription.workspace_id then
      raise exception 'billing_payment_scope_mismatch';
    end if;
    insert into public.billing_payments (
      workspace_id, asaas_payment_id, asaas_subscription_id, status,
      billing_type, value, due_date, paid_at, invoice_url
    ) values (
      v_subscription.workspace_id, v_payment->>'asaas_payment_id', v_subscription.asaas_subscription_id,
      v_payment->>'status', v_payment->>'billing_type', (v_payment->>'value')::numeric,
      (v_payment->>'due_date')::date, (v_payment->>'paid_at')::timestamptz, v_payment->>'invoice_url'
    ) on conflict (asaas_payment_id) do update set
      status=excluded.status, billing_type=excluded.billing_type, value=excluded.value,
      due_date=excluded.due_date, paid_at=excluded.paid_at, invoice_url=excluded.invoice_url
    where public.billing_payments.workspace_id = excluded.workspace_id
      and public.billing_payments.asaas_subscription_id = excluded.asaas_subscription_id;
    get diagnostics v_inserted = row_count;
    if v_inserted <> 1 then raise exception 'billing_payment_identity_conflict'; end if;
  end loop;
  update public.subscriptions set
    cancel_at_period_end = coalesce((p_patch->>'cancel_at_period_end')::boolean, cancel_at_period_end),
    status = coalesce(p_patch->>'status', status),
    current_period_ends_at = greatest(current_period_ends_at, (p_patch->>'current_period_ends_at')::timestamptz),
    cancel_effective_at = greatest(cancel_effective_at, (p_patch->>'cancel_effective_at')::timestamptz),
    billing_grace_ends_at = case when p_patch->>'status' = 'active' then null
      else coalesce((p_patch->>'billing_grace_ends_at')::timestamptz,billing_grace_ends_at) end,
    billing_lifecycle_checked_at = p_now
  where id = p_subscription_id;
  for v_notice in select value from jsonb_array_elements(p_notices) loop
    v_message := case v_notice->>'stage'
      when 'before' then 'Sua cobrança vence amanhã. Confira o pagamento para manter seu plano ativo.'
      when 'due' then 'Sua cobrança vence hoje. Você pode regularizar em Pagamento e assinatura.'
      when 'overdue' then 'Há um pagamento em atraso. A tolerância é de três dias corridos desde o vencimento.'
      when 'suspended' then 'Seu plano está suspenso por falta de pagamento. Seus dados foram preservados. Regularize para continuar.'
      when 'reactivated' then 'Pagamento confirmado. Seu plano foi reativado automaticamente.'
      else null end;
    if v_message is null then raise exception 'invalid_billing_notice'; end if;
    for v_member in select user_id from public.workspace_members
      where workspace_id = v_subscription.workspace_id and status = 'active' loop
      insert into public.billing_notice_deliveries (subscription_id,user_id,notice_key)
      values (p_subscription_id,v_member.user_id,v_notice->>'key') on conflict do nothing;
      get diagnostics v_inserted = row_count;
      if v_inserted = 1 then
        insert into public.notifications (user_id,workspace_id,type,title,message,action_url,metadata)
        values (v_member.user_id,v_subscription.workspace_id,'sistema','Pagamento e assinatura',v_message,
          '/app/conta/pagamentos',jsonb_build_object('source','billing','stage',v_notice->>'stage'));
      end if;
    end loop;
  end loop;
  return true;
end;
$$;
revoke all on function public.apply_billing_lifecycle(uuid,timestamptz,jsonb,jsonb,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.apply_billing_lifecycle(uuid,timestamptz,jsonb,jsonb,jsonb,timestamptz) to service_role;

commit;
