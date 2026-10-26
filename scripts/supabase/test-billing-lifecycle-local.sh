#!/usr/bin/env bash
set -euo pipefail
# Starts its own disposable PostgreSQL cluster. Never accepts DATABASE_URL.
pgbin="$(dirname "$(command -v initdb || echo /opt/homebrew/opt/postgresql@17/bin/initdb)")"
cluster="$(mktemp -d /tmp/uniflow-billing-lifecycle.XXXXXX)"
"$pgbin/initdb" -D "$cluster/data" -U postgres --auth=trust > "$cluster/init.log"
"$pgbin/pg_ctl" -D "$cluster/data" -l "$cluster/server.log" -o "-h 127.0.0.1 -p 55438 -k $cluster" start > /dev/null
trap '"$pgbin/pg_ctl" -D "$cluster/data" -m fast stop > /dev/null' EXIT
psql_local=("$pgbin/psql" -U postgres -h "$cluster" -p 55438 -d postgres -v ON_ERROR_STOP=1)
"${psql_local[@]}" -f supabase/tests/billing_lifecycle_fixture.sql > "$cluster/schema.log"
"${psql_local[@]}" -f supabase/migrations/20261025170000_052_billing_lifecycle.sql -f supabase/migrations/20261025180000_053_billing_rpc_suspension.sql > "$cluster/migrations.log"
if [ "${BILLING_TEST_INCLUDE_PIX_AUTOMATIC:-0}" = 1 ]; then
  "${psql_local[@]}" -f supabase/migrations/20261025150000_050_billing_operation_attempts.sql -f supabase/migrations/20261025190000_054_pix_automatic_authorizations.sql >> "$cluster/migrations.log"
  "${psql_local[@]}" -f supabase/tests/pix_automatic_validation.sql
fi
"${psql_local[@]}" -f supabase/tests/billing_lifecycle_validation.sql
"${psql_local[@]}" -c "insert into public.subscriptions(id,workspace_id,status,updated_at) values ('90000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','active','2026-10-01Z')" > /dev/null
race_sql="begin; set local role service_role; select public.apply_billing_lifecycle('90000000-0000-4000-8000-000000000001','2026-10-01Z','{}','[]','[]',now()); select pg_sleep(0.2); commit;"
"${psql_local[@]}" -tA -c "$race_sql" > "$cluster/race-a.log" &
race_pid=$!
"${psql_local[@]}" -tA -c "$race_sql" > "$cluster/race-b.log"
wait "$race_pid"
successes="$(cat "$cluster/race-a.log" "$cluster/race-b.log" | rg -c '^t$')"
test "$successes" = 1
printf 'Two concurrent workers: exactly one accepted.\n'
if [ "${BILLING_TEST_INCLUDE_PIX_AUTOMATIC:-0}" = 1 ]; then
  "${psql_local[@]}" -c "insert into public.workspaces values('92000000-0000-4000-8000-000000000001','personal'); insert into public.billing_customers(workspace_id,asaas_customer_id) values('92000000-0000-4000-8000-000000000001','cus_race');" > /dev/null
  auto_sql="begin; set local role service_role; select (public.reserve_pix_automatic('92000000-0000-4000-8000-000000000001','pro',29.9)->>'claimed')::boolean; select pg_sleep(0.2); commit;"
  classic_sql="begin; set local role service_role; with claim as (insert into public.billing_operation_attempts(operation,workspace_id,plan_id,status) values('subscription','92000000-0000-4000-8000-000000000001','pro','processing') on conflict do nothing returning id) select exists(select 1 from claim); select pg_sleep(0.2); commit;"
  "${psql_local[@]}" -tA -c "$auto_sql" > "$cluster/auto-race.log" &
  auto_pid=$!
  "${psql_local[@]}" -tA -c "$classic_sql" > "$cluster/classic-race.log"
  wait "$auto_pid"
  successes="$(cat "$cluster/auto-race.log" "$cluster/classic-race.log" | rg -c '^t$')"
  test "$successes" = 1
  printf 'Conventional and Automatic Pix race: exactly one creation reservation accepted.\n'
fi
printf 'Disposable PostgreSQL lifecycle assertions passed. Logs: %s\n' "$cluster"
