-- Executed only in the harness-created, disposable PostgreSQL cluster.
begin;
create function public.pix_test_assert(ok boolean,message text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'ASSERT: %',message; end if; end $$;
insert into auth.users values('11000000-0000-4000-8000-000000000001');
insert into public.workspaces values('21000000-0000-4000-8000-000000000001','personal');
insert into public.workspace_members values('21000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','active','owner');
insert into public.billing_customers(workspace_id,asaas_customer_id) values('21000000-0000-4000-8000-000000000001','cus_fixture');
set local role service_role;
select public.reserve_pix_automatic('21000000-0000-4000-8000-000000000001','pro',29.9) as reservation \gset
select public.pix_test_assert((:'reservation'::jsonb->>'claimed')::boolean,'first claim accepted');
select public.pix_test_assert(not (public.reserve_pix_automatic('21000000-0000-4000-8000-000000000001','pro',29.9)->>'claimed')::boolean,'duplicate claim denied');
select public.pix_test_assert((select count(*)=1 from public.subscriptions),'one pending local subscription');
select public.apply_pix_authorization((:'reservation'::jsonb->'authorization'->>'id')::uuid,
  jsonb_build_object('id','authorization_fixture','contractId',:'reservation'::jsonb->'authorization'->>'contract_id','customerId','cus_fixture',
    'value',29.9,'frequency','MONTHLY','paymentCreationMode','SUBSCRIPTION','status','CREATED'));
savepoint active_without_payment;
select public.apply_pix_authorization((:'reservation'::jsonb->'authorization'->>'id')::uuid,
  jsonb_build_object('id','authorization_fixture','contractId',:'reservation'::jsonb->'authorization'->>'contract_id','customerId','cus_fixture',
    'value',29.9,'frequency','MONTHLY','paymentCreationMode','SUBSCRIPTION','status','ACTIVE','subscriptionId','sub_fixture'));
select public.pix_test_assert((select status='pending' from public.subscriptions),'authorization ACTIVE alone does not activate plan');
rollback to active_without_payment;
select public.apply_pix_automatic_payment((:'reservation'::jsonb->'authorization'->>'id')::uuid,
  '{"id":"pay_initial","customer":"cus_fixture","value":29.9,"status":"RECEIVED","local_status":"received","paymentDate":"2099-10-01"}',
  '{"status":"active","current_period_ends_at":"2099-11-01T00:00:00Z"}');
select public.pix_test_assert((select status='active' and cancel_at_period_end and asaas_subscription_id is null from public.subscriptions),'initial payment works before consent activation');
savepoint refusal_after_payment;
select public.apply_pix_authorization((:'reservation'::jsonb->'authorization'->>'id')::uuid,
  jsonb_build_object('id','authorization_fixture','contractId',:'reservation'::jsonb->'authorization'->>'contract_id','customerId','cus_fixture',
    'value',29.9,'frequency','MONTHLY','paymentCreationMode','SUBSCRIPTION','status','REFUSED'));
select public.pix_test_assert((select status='active' and cancel_at_period_end and current_period_ends_at='2099-11-01Z'::timestamptz from public.subscriptions),'refusal preserves paid period');
rollback to refusal_after_payment;
select public.apply_pix_authorization((:'reservation'::jsonb->'authorization'->>'id')::uuid,
  jsonb_build_object('id','authorization_fixture','contractId',:'reservation'::jsonb->'authorization'->>'contract_id','customerId','cus_fixture',
    'value',29.9,'frequency','MONTHLY','paymentCreationMode','SUBSCRIPTION','status','ACTIVE','subscriptionId','sub_fixture'));
select public.pix_test_assert((select status='active' and not cancel_at_period_end from public.subscriptions),'active consent permits recurrence without granting another period');
select public.pix_test_assert((select asaas_subscription_id='sub_fixture' from public.billing_payments),'initial payment linked after subscription is known');
select public.apply_pix_authorization((:'reservation'::jsonb->'authorization'->>'id')::uuid,
  jsonb_build_object('id','authorization_fixture','contractId',:'reservation'::jsonb->'authorization'->>'contract_id','customerId','cus_fixture',
    'value',29.9,'frequency','MONTHLY','paymentCreationMode','SUBSCRIPTION','status','CANCELLED','subscriptionId','sub_fixture'));
select public.apply_pix_authorization((:'reservation'::jsonb->'authorization'->>'id')::uuid,
  jsonb_build_object('id','authorization_fixture','contractId',:'reservation'::jsonb->'authorization'->>'contract_id','customerId','cus_fixture',
    'value',29.9,'frequency','MONTHLY','paymentCreationMode','SUBSCRIPTION','status','ACTIVE','subscriptionId','sub_fixture'));
select public.pix_test_assert((select status='CANCELLED' from public.billing_pix_authorizations),'stale ACTIVE does not reopen terminal consent');
select public.apply_pix_automatic_payment((:'reservation'::jsonb->'authorization'->>'id')::uuid,
  '{"id":"pay_initial","customer":"cus_fixture","value":29.9,"status":"RECEIVED","local_status":"received","paymentDate":"2099-10-01"}',
  '{"status":"active","current_period_ends_at":"2099-11-01T00:00:00Z"}');
select public.pix_test_assert((select count(*)=1 from public.billing_payments),'repeated payment does not duplicate');
savepoint identity_checks;
insert into public.billing_pix_authorizations(workspace_id,subscription_id,operation_attempt_id,contract_id,asaas_customer_id,expected_value,status)
select workspace_id,subscription_id,operation_attempt_id,'ffffffffffffffffffffffffffffffff',asaas_customer_id,expected_value,'CREATED'
from public.billing_pix_authorizations limit 1;
do $$ declare a uuid; begin
  select id into a from public.billing_pix_authorizations where contract_id='ffffffffffffffffffffffffffffffff';
  begin
    perform public.apply_pix_automatic_payment(a,'{"id":"pay_initial","customer":"cus_fixture","value":29.9,"status":"RECEIVED","local_status":"received"}','{}');
    raise exception 'payment reuse accepted';
  exception when others then
    if sqlerrm <> 'PIX_PAYMENT_ALREADY_LINKED' then raise; end if;
  end;
  begin
    perform public.apply_pix_automatic_payment(a,'{"id":"pay_other","customer":"cus_other","value":29.9,"status":"RECEIVED","local_status":"received"}','{}');
    raise exception 'wrong customer accepted';
  exception when others then
    if sqlerrm <> 'PIX_PAYMENT_SCOPE_MISMATCH' then raise; end if;
  end;
end $$;
rollback to identity_checks;
reset role;
select public.pix_test_assert(not has_function_privilege('authenticated','public.reserve_pix_automatic(uuid,text,numeric)','execute'),'user cannot reserve directly');
select public.pix_test_assert(not has_function_privilege('anon','public.apply_pix_authorization(uuid,jsonb)','execute'),'anon cannot authorize');
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.pix_test_assert((select count(*)=1 from public.billing_pix_authorizations),'own workspace visible');
select public.pix_test_assert(public.workspace_allows_product_access('21000000-0000-4000-8000-000000000001'),'paid access retained');
reset role;
update public.subscriptions set cancel_effective_at=now()-interval '1 day',current_period_ends_at=now()-interval '1 day';
set local role authenticated;
select public.pix_test_assert(not public.workspace_allows_product_access('21000000-0000-4000-8000-000000000001'),'cutoff enforced without worker');
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000099',true);
select public.pix_test_assert((select count(*)=0 from public.billing_pix_authorizations),'other user isolated');
rollback;
