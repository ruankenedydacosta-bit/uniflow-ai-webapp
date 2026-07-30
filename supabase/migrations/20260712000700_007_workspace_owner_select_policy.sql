begin;

-- O INSERT de workspace usa RETURNING. O owner precisa conseguir ler a linha
-- criada mesmo antes de a leitura por membership ficar observavel.
drop policy if exists workspaces_select_active_member
on public.workspaces;

create policy workspaces_select_owner_or_active_member
on public.workspaces
for select
to authenticated
using (
  owner_user_id = (select auth.uid())
  or public.is_workspace_member(id)
);

commit;
