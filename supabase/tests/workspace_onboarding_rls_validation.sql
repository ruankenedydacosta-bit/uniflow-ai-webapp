-- Validacao consolidada da policy de workspace usada pelo onboarding.
-- Executar somente no UniFlow DEV depois da aplicacao manual da migration 007.

with checks(check_name, passed) as (
  select 'authenticated_grants_are_limited',
    not exists (
      select 1 from information_schema.role_table_grants
      where table_schema = 'public' and table_name = 'workspaces'
        and grantee = 'authenticated'
        and privilege_type not in ('SELECT', 'DELETE')
    )
    and not exists (
      select 1 from information_schema.role_column_grants
      where table_schema = 'public' and table_name = 'workspaces'
        and grantee = 'authenticated'
        and (
          (privilege_type = 'INSERT' and column_name not in (
            'name', 'workspace_type', 'owner_user_id'
          ))
          or (privilege_type = 'UPDATE' and column_name not in (
            'name', 'workspace_type'
          ))
          or privilege_type not in ('INSERT', 'UPDATE', 'SELECT', 'DELETE')
        )
    )

  union all
  select 'anon_has_no_workspace_grants',
    not exists (
      select 1 from information_schema.role_table_grants
      where table_schema = 'public' and table_name = 'workspaces'
        and grantee = 'anon'
    )
    and not exists (
      select 1 from information_schema.role_column_grants
      where table_schema = 'public' and table_name = 'workspaces'
        and grantee = 'anon'
    )

  union all
  select 'insert_policy_requires_authenticated_owner',
    exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'workspaces'
        and policyname = 'workspaces_insert_owner' and cmd = 'INSERT'
        and 'authenticated' = any(roles)
        and with_check like '%owner_user_id%'
        and with_check like '%auth.uid()%'
    )

  union all
  select 'membership_owner_trigger_exists',
    exists (
      select 1 from information_schema.triggers
      where trigger_schema = 'public' and event_object_table = 'workspaces'
        and trigger_name = 'on_workspace_created'
        and action_timing = 'AFTER' and event_manipulation = 'INSERT'
    )

  union all
  select 'no_duplicate_or_legacy_select_policy',
    (select count(*) = 1 from pg_policies
      where schemaname = 'public' and tablename = 'workspaces'
        and cmd = 'SELECT')
    and not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'workspaces'
        and policyname = 'workspaces_select_active_member'
    )

  union all
  select 'no_workspace_policy_uses_true',
    not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'workspaces'
        and lower(coalesce(qual, '')) in ('true', '(true)')
    )

  union all
  select 'select_policy_allows_active_members',
    exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'workspaces'
        and policyname = 'workspaces_select_owner_or_active_member'
        and cmd = 'SELECT' and qual like '%is_workspace_member%'
    )

  union all
  select 'select_policy_allows_owner',
    exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'workspaces'
        and policyname = 'workspaces_select_owner_or_active_member'
        and cmd = 'SELECT' and 'authenticated' = any(roles)
        and qual like '%owner_user_id%' and qual like '%auth.uid()%'
    )

  union all
  select 'workspaces_rls_is_enabled',
    exists (
      select 1 from pg_class as table_definition
      join pg_namespace as table_schema
        on table_schema.oid = table_definition.relnamespace
      where table_schema.nspname = 'public'
        and table_definition.relname = 'workspaces'
        and table_definition.relrowsecurity
    )
)
select check_name::text, passed::boolean
from checks
order by check_name;

-- Esperado: 9/9 checks com passed = true.
