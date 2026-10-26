-- Regression fixture for a disposable PostgreSQL database with the minimal
-- plan-capability schema used in local validation. Never run on production.
-- Apply migration 048 first. This transaction rolls back all fixture rows.
begin;
insert into public.workspaces (id, workspace_type)
select ('a0000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, 'business'
from generate_series(1, 3) n;
insert into public.workspace_members (workspace_id, user_id)
select ('a0000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  '00000000-0000-0000-0000-000000000001'::uuid
from generate_series(1, 3) n;
insert into public.subscriptions (id, workspace_id, plan_id, status, created_at)
select ('b0000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  ('a0000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  'business', 'active', now() - interval '1 day'
from generate_series(1, 3) n;
insert into public.subscriptions (id, workspace_id, plan_id, status, created_at)
select ('c0000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  ('a0000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  'business', (array['pending', 'suspended', 'expired'])[n], now()
from generate_series(1, 3) n;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
set local role authenticated;
do $$
begin
  for n in 1..3 loop
    if public.workspace_has_plan_capability(
      ('a0000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
      'business_features'
    ) then
      raise exception 'Old active subscription reopened access for fixture %', n;
    end if;
  end loop;
end;
$$;
rollback;
