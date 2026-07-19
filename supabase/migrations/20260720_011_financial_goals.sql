begin;

-- Financial goals and contributions for the Goals module.
-- Goals are owned by a user and scoped to a workspace.
-- Contributions cascade-delete with their parent goal.

create table public.financial_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text,
  category text,
  target_amount numeric not null,
  initial_amount numeric not null default 0,
  current_amount numeric not null default 0,
  planned_monthly_amount numeric,
  start_date date not null default current_date,
  target_date date,
  priority text not null default 'medium',
  status text not null default 'active',
  linked_account_id uuid references public.financial_accounts(id) on delete set null,
  completed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_goals_target_amount_check check (target_amount > 0),
  constraint financial_goals_initial_amount_check check (initial_amount >= 0),
  constraint financial_goals_current_amount_check check (current_amount >= 0),
  constraint financial_goals_priority_check check (
    priority in ('low', 'medium', 'high')
  ),
  constraint financial_goals_status_check check (
    status in ('active', 'paused', 'completed', 'canceled')
  )
);

create table public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  goal_id uuid not null references public.financial_goals(id) on delete cascade,
  amount numeric not null,
  contribution_date date not null default current_date,
  note text,
  linked_account_id uuid references public.financial_accounts(id) on delete set null,
  client_operation_id text,
  created_at timestamptz not null default now(),
  constraint goal_contributions_amount_check check (amount > 0)
);

create unique index goal_contributions_operation_uidx
  on public.goal_contributions (goal_id, client_operation_id)
  where client_operation_id is not null;

create index financial_goals_user_workspace_idx
  on public.financial_goals (user_id, workspace_id, created_at desc);

create index financial_goals_status_idx
  on public.financial_goals (status);

create index financial_goals_target_date_idx
  on public.financial_goals (target_date);

create index goal_contributions_goal_idx
  on public.goal_contributions (goal_id, created_at desc);

create index goal_contributions_user_idx
  on public.goal_contributions (user_id);

alter table public.financial_goals enable row level security;
alter table public.goal_contributions enable row level security;

-- Goals RLS: user can only access their own goals.
create policy financial_goals_select_own
  on public.financial_goals
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy financial_goals_insert_own
  on public.financial_goals
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy financial_goals_update_own
  on public.financial_goals
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy financial_goals_delete_own
  on public.financial_goals
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- Contributions RLS: user can only access contributions from their own goals.
create policy goal_contributions_select_own
  on public.goal_contributions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.financial_goals as g
      where g.id = goal_id
        and g.user_id = (select auth.uid())
    )
  );

create policy goal_contributions_insert_own
  on public.goal_contributions
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.financial_goals as g
      where g.id = goal_id
        and g.user_id = (select auth.uid())
    )
  );

create policy goal_contributions_update_own
  on public.goal_contributions
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.financial_goals as g
      where g.id = goal_id
        and g.user_id = (select auth.uid())
    )
  )
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.financial_goals as g
      where g.id = goal_id
        and g.user_id = (select auth.uid())
    )
  );

create policy goal_contributions_delete_own
  on public.goal_contributions
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.financial_goals as g
      where g.id = goal_id
        and g.user_id = (select auth.uid())
    )
  );

-- Trigger for updated_at
create trigger financial_goals_set_updated_at
  before update on public.financial_goals
  for each row execute function public.set_updated_at();

-- Grants
revoke all on table public.financial_goals from anon, authenticated;
revoke all on table public.goal_contributions from anon, authenticated;

grant select on table public.financial_goals to authenticated;
grant insert (user_id, workspace_id, name, description, category, target_amount, initial_amount, current_amount, planned_monthly_amount, start_date, target_date, priority, status, linked_account_id)
  on public.financial_goals to authenticated;
grant update (name, description, category, target_amount, current_amount, planned_monthly_amount, start_date, target_date, priority, status, linked_account_id, completed_at, archived_at)
  on public.financial_goals to authenticated;
grant delete on table public.financial_goals to authenticated;

grant select on table public.goal_contributions to authenticated;
grant insert (user_id, workspace_id, goal_id, amount, contribution_date, note, linked_account_id, client_operation_id)
  on public.goal_contributions to authenticated;
grant update (note, linked_account_id)
  on public.goal_contributions to authenticated;
grant delete on table public.goal_contributions to authenticated;

comment on table public.financial_goals is
  'Metas financeiras do usuario; isola das por workspace e usuario.';
comment on table public.goal_contributions is
  'Contribuicoes manuais para cada meta; integracao futura com transacoes.';
comment on column public.goal_contributions.client_operation_id is
  'Chave de idempotencia para impedir contribuicao duplicada.';

commit;
