-- Minimal fixture used ONLY by test-billing-lifecycle-local.sh in a fresh cluster.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated,service_role;
grant execute on function auth.uid() to authenticated;
create table public.workspaces(id uuid primary key,workspace_type text);
create table public.workspace_members(workspace_id uuid,user_id uuid,status text,role text);
create table public.profiles(id uuid,current_workspace_id uuid);
create table public.plans(id text primary key,active boolean default true);
insert into public.plans(id) values('free'),('pro'),('business'),('enterprise');
create table public.billing_customers(id uuid primary key default gen_random_uuid(),workspace_id uuid unique,asaas_customer_id text unique);
create table public.subscriptions(id uuid primary key default gen_random_uuid(),workspace_id uuid,plan_id text,status text,asaas_customer_id text,payment_method text,asaas_subscription_id text,current_period_ends_at timestamptz,cancel_at_period_end boolean default false,cancel_effective_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now());
create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=clock_timestamp(); return new; end $$;
create trigger subscriptions_updated before update on public.subscriptions for each row execute function public.set_updated_at();
create table public.billing_payments(id uuid default gen_random_uuid(),workspace_id uuid,asaas_payment_id text unique,asaas_subscription_id text,status text,billing_type text,value numeric,due_date date,paid_at timestamptz,invoice_url text);
create table public.notifications(id uuid default gen_random_uuid(),user_id uuid,workspace_id uuid,type text,title text,message text,action_url text,metadata jsonb);
create function public.is_workspace_member(w uuid) returns boolean language sql security definer set search_path='' as $$ select exists(select 1 from public.workspace_members where workspace_id=w and user_id=auth.uid() and status='active') $$;
do $$ declare t text; begin
foreach t in array array['accounts','categories','transactions','financial_goals','goal_contributions','agenda_items','clients','crm_pipeline_stages','crm_opportunities','projects','uni_conversations'] loop
 execute format('create table public.%I(id uuid primary key,workspace_id uuid)',t);
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy member on public.%I for all to authenticated using(public.is_workspace_member(workspace_id)) with check(public.is_workspace_member(workspace_id))',t);
end loop; end $$;
create table public.uni_messages(id uuid,conversation_id uuid);
alter table public.uni_messages enable row level security;
grant select,insert,update,delete on all tables in schema public to authenticated,service_role;
create function public.execute_confirmed_financial_action(uuid,text,uuid,text,text,text,uuid,text,text,numeric,date,uuid,numeric) returns void language sql as $$ select $$;
