begin;
insert into public.billing_payments(workspace_id,asaas_payment_id,status) values('25000000-0000-4000-8000-000000000001','pay_identity','pending');
update public.billing_payments set status='received',asaas_subscription_id='sub_identity' where asaas_payment_id='pay_identity';
do $$ begin
  begin
    update public.billing_payments set workspace_id='25000000-0000-4000-8000-000000000002' where asaas_payment_id='pay_identity';
    raise exception 'cross-workspace mutation accepted';
  exception when check_violation then null; end;
  begin
    update public.billing_payments set asaas_payment_id='pay_other' where asaas_payment_id='pay_identity';
    raise exception 'provider payment mutation accepted';
  exception when check_violation then null; end;
  begin
    update public.billing_payments set asaas_subscription_id='sub_other' where asaas_payment_id='pay_identity';
    raise exception 'provider subscription mutation accepted';
  exception when check_violation then null; end;
  begin
    update public.billing_payments set asaas_subscription_id=null where asaas_payment_id='pay_identity';
    raise exception 'subscription identity erased';
  exception when check_violation then null; end;
end $$;
rollback;
