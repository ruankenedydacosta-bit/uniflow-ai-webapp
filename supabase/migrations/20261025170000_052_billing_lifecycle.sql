begin;

alter table public.subscriptions add column billing_lifecycle_checked_at timestamptz;
alter table public.subscriptions add column billing_grace_ends_at timestamptz;
create index subscriptions_billing_lifecycle_scan_idx
on public.subscriptions (billing_lifecycle_checked_at nulls first, id)
where status in ('active', 'trialing', 'past_due', 'suspended');

create table public.billing_notice_deliveries (
  subscription_id uuid not null references public.subscriptions(id),
  user_id uuid not null references auth.users(id),
  notice_key text not null,
  created_at timestamptz not null default now(),
  primary key (subscription_id, user_id, notice_key)
);
alter table public.billing_notice_deliveries enable row level security;
revoke all on public.billing_notice_deliveries from public, anon, authenticated;
grant all on public.billing_notice_deliveries to service_role;

-- Only a trusted worker can submit provider-confirmed state. The row lock and
-- expected timestamp serialize workers with webhook/sync/cancellation writes.
create function public.apply_billing_lifecycle(
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

create function public.workspace_allows_product_access(target_workspace_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_workspace_member(target_workspace_id) and not coalesce((
    select status = 'suspended' or (status = 'past_due' and (billing_grace_ends_at is null or billing_grace_ends_at <= statement_timestamp())) from public.subscriptions
    where workspace_id = target_workspace_id order by created_at desc,id desc limit 1
  ),false);
$$;
revoke all on function public.workspace_allows_product_access(uuid) from public,anon;
grant execute on function public.workspace_allows_product_access(uuid) to authenticated;

-- Billing, profile, membership, notifications and support remain available.
-- The policies only add a suspension gate to existing member/role policies.
do $$
declare v_table text;
begin
  foreach v_table in array array['accounts','categories','transactions','financial_goals',
    'goal_contributions','agenda_items','clients','crm_pipeline_stages','crm_opportunities','projects','uni_conversations'] loop
    execute format('create policy billing_suspension_gate on public.%I as restrictive for all to authenticated using (workspace_id is null or public.workspace_allows_product_access(workspace_id)) with check (workspace_id is null or public.workspace_allows_product_access(workspace_id))',v_table);
  end loop;
end;
$$;
create policy billing_suspension_gate on public.uni_messages as restrictive for all to authenticated
using (exists (select 1 from public.uni_conversations c where c.id=conversation_id and public.workspace_allows_product_access(c.workspace_id)))
with check (exists (select 1 from public.uni_conversations c where c.id=conversation_id and public.workspace_allows_product_access(c.workspace_id)));

commit;
