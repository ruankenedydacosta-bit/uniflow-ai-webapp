-- Validacao consolidada da RPC ensure_own_profile.
-- Executar somente no UniFlow DEV depois da aplicacao manual da migration 006.

with target_function as (
  select function_definition.*
  from pg_proc as function_definition
  join pg_namespace as function_schema
    on function_schema.oid = function_definition.pronamespace
  where function_schema.nspname = 'public'
    and function_definition.proname = 'ensure_own_profile'
    and function_definition.pronargs = 0
),
checks(check_name, passed) as (
  select 'anon_cannot_execute',
    not exists (
      select 1 from information_schema.routine_privileges
      where routine_schema = 'public'
        and routine_name = 'ensure_own_profile'
        and grantee = 'anon'
        and privilege_type = 'EXECUTE'
    )

  union all
  select 'authenticated_can_execute_only_rpc',
    exists (
      select 1 from information_schema.routine_privileges
      where routine_schema = 'public'
        and routine_name = 'ensure_own_profile'
        and grantee = 'authenticated'
        and privilege_type = 'EXECUTE'
    )
    and not exists (
      select 1 from information_schema.role_table_grants
      where table_schema = 'public' and table_name = 'profiles'
        and grantee in ('anon', 'authenticated')
        and privilege_type = 'INSERT'
    )
    and not exists (
      select 1 from information_schema.role_column_grants
      where table_schema = 'public' and table_name = 'profiles'
        and grantee in ('anon', 'authenticated')
        and privilege_type = 'INSERT'
    )

  union all
  select 'function_has_no_user_parameters',
    (select count(*) = 1 from target_function)

  union all
  select 'function_is_idempotent',
    exists (
      select 1 from target_function
      where lower(pg_get_functiondef(oid))
        like '%on conflict (id) do nothing%'
    )

  union all
  select 'function_is_security_definer',
    exists (select 1 from target_function where prosecdef)

  union all
  select 'function_returns_minimum_fields',
    exists (
      select 1 from target_function
      where pg_get_function_result(oid) like '%id uuid%'
        and pg_get_function_result(oid) like '%full_name text%'
        and pg_get_function_result(oid) like '%phone text%'
        and pg_get_function_result(oid) like '%user_mode text%'
        and pg_get_function_result(oid) like '%current_workspace_id uuid%'
        and pg_get_function_result(oid) like '%onboarding_completed boolean%'
        and lower(pg_get_function_result(oid)) !~ '(email|password|token|session)'
    )

  union all
  select 'function_uses_auth_uid_only',
    exists (
      select 1 from target_function
      where pg_get_functiondef(oid) like '%auth.uid()%'
        and pg_get_functiondef(oid) not like '%target_user%'
    )

  union all
  select 'public_and_anon_have_no_execute',
    not exists (
      select 1 from information_schema.routine_privileges
      where routine_schema = 'public'
        and routine_name = 'ensure_own_profile'
        and grantee in ('PUBLIC', 'anon')
        and privilege_type = 'EXECUTE'
    )

  union all
  select 'search_path_is_explicit',
    exists (
      select 1 from target_function
      where coalesce(array_to_string(proconfig, ','), '')
        in ('search_path=""', 'search_path=')
    )

  union all
  select 'trigger_and_rpc_are_compatible',
    exists (
      select 1 from information_schema.triggers
      where trigger_schema = 'auth'
        and event_object_table = 'users'
        and trigger_name = 'on_auth_user_created'
    )
    and exists (
      select 1 from target_function
      where lower(pg_get_functiondef(oid))
        like '%on conflict (id) do nothing%'
    )
)
select check_name::text, passed::boolean
from checks
order by check_name;

-- Esperado: 10/10 checks com passed = true.
