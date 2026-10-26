-- Execute only against a disposable/local Supabase database after migration 051.
-- This test uses a synthetic event and rolls back all fixture data.
begin;

insert into public.webhook_events (id, asaas_event_id, event_type, payload)
values (
  '91000000-0000-0000-0000-000000000001',
  'evt_retry_fixture_001',
  'PAYMENT_CONFIRMED',
  '{"id":"evt_retry_fixture_001","event":"PAYMENT_CONFIRMED","payment":{"id":"pay_fixture"}}'::jsonb
);

set local role service_role;
do $$
declare claim_count integer;
begin
  select count(*) into claim_count
  from public.claim_billing_webhook_event('91000000-0000-0000-0000-000000000001'::uuid);
  if claim_count <> 1 then raise exception 'first claim must return exactly one event'; end if;

  select count(*) into claim_count
  from public.claim_billing_webhook_event('91000000-0000-0000-0000-000000000001'::uuid);
  if claim_count <> 0 then raise exception 'active lease must block duplicate claim'; end if;
end
$$;

reset role;
update public.webhook_events
set processing_started_at = statement_timestamp() - interval '11 minutes'
where id = '91000000-0000-0000-0000-000000000001';
set local role service_role;
do $$
declare claim_count integer;
begin
  select count(*) into claim_count
  from public.claim_billing_webhook_event('91000000-0000-0000-0000-000000000001'::uuid);
  if claim_count <> 1 then raise exception 'expired lease must be recoverable'; end if;
end
$$;

rollback;
