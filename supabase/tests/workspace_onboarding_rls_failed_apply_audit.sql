-- Auditoria somente leitura do estado das policies SELECT de workspaces.
-- Nao executa DROP, CREATE, ALTER ou qualquer escrita.

with policy_state as (
  select
    count(*) filter (
      where policyname = 'workspaces_select_active_member'
    ) as old_policy_count,
    count(*) filter (
      where policyname = 'workspaces_select_owner_or_active_member'
    ) as new_policy_count,
    count(*) as select_policy_count,
    bool_or(
      policyname = 'workspaces_select_owner_or_active_member'
      and qual like '%owner_user_id%'
      and qual like '%auth.uid()%'
      and qual like '%is_workspace_member%'
    ) as compatible_new_policy
  from pg_policies
  where schemaname = 'public' and tablename = 'workspaces'
    and cmd = 'SELECT'
)
select
  case
    when old_policy_count = 1 and new_policy_count = 0
      and select_policy_count = 1
      then 'old_policy_ready_for_migration'
    when old_policy_count = 0 and new_policy_count = 1
      and select_policy_count = 1 and compatible_new_policy
      then 'new_policy_already_present_review_before_reapply'
    when (old_policy_count > 0 and new_policy_count > 0)
      or select_policy_count > 1
      then 'conflicting_workspace_select_policies_manual_review_required'
    else 'workspace_policy_state_unexpected'
  end as audit_state,
  old_policy_count,
  new_policy_count,
  select_policy_count,
  coalesce(compatible_new_policy, false) as compatible_new_policy
from policy_state;

select policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'workspaces'
order by cmd, policyname;
