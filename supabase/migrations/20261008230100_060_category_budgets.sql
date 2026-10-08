begin;

-- Teto mensal de gasto por categoria (#121). A Leitura do mês da Home usa o
-- teto quando ele existe e, sem ele, a média das saídas dos 3 meses
-- anteriores. Um teto por categoria em cada espaço.
--
-- A categoria precisa ser visível no espaço: do próprio espaço ou de sistema
-- (workspace_id nulo). Sem essa checagem, um membro poderia apontar o teto
-- para a categoria de outro espaço.

create table if not exists public.category_budgets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  monthly_limit numeric(14, 2) not null,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint category_budgets_monthly_limit_check check (monthly_limit > 0),
  constraint category_budgets_workspace_category_key unique (workspace_id, category_id)
);

drop trigger if exists category_budgets_set_updated_at on public.category_budgets;
create trigger category_budgets_set_updated_at
before update on public.category_budgets
for each row execute function public.set_updated_at();

alter table public.category_budgets enable row level security;

revoke all on table public.category_budgets from anon, authenticated;
grant all on table public.category_budgets to service_role;
grant select on public.category_budgets to authenticated;
grant insert (workspace_id, category_id, monthly_limit) on public.category_budgets to authenticated;
grant update (monthly_limit) on public.category_budgets to authenticated;
grant delete on public.category_budgets to authenticated;

drop policy if exists category_budgets_select_member on public.category_budgets;
create policy category_budgets_select_member
on public.category_budgets
for select
to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists category_budgets_insert_contributor on public.category_budgets;
create policy category_budgets_insert_contributor
on public.category_budgets
for insert
to authenticated
with check (
  public.is_workspace_member(workspace_id, array['owner', 'admin', 'member']::text[])
  and exists (
    select 1
    from public.categories as c
    where c.id = category_id
      and (c.workspace_id is null or c.workspace_id = category_budgets.workspace_id)
  )
);

drop policy if exists category_budgets_update_contributor on public.category_budgets;
create policy category_budgets_update_contributor
on public.category_budgets
for update
to authenticated
using (public.is_workspace_member(workspace_id, array['owner', 'admin', 'member']::text[]))
with check (public.is_workspace_member(workspace_id, array['owner', 'admin', 'member']::text[]));

drop policy if exists category_budgets_delete_contributor on public.category_budgets;
create policy category_budgets_delete_contributor
on public.category_budgets
for delete
to authenticated
using (public.is_workspace_member(workspace_id, array['owner', 'admin', 'member']::text[]));

commit;
