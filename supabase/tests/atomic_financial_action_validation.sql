-- Validacao consolidada da migration 008.
-- Executar somente no UniFlow DEV depois da aplicacao manual.

with target_function as (
  select function_definition.*
  from pg_proc as function_definition
  join pg_namespace as function_schema
    on function_schema.oid = function_definition.pronamespace
  where function_definition.oid = to_regprocedure(
    'public.execute_confirmed_financial_action(uuid,text,uuid,text,text,text,uuid,text,text,numeric,date,uuid)'
  )
),
checks(check_name, passed) as (
  select 'account_active_identity_unique_index',
    to_regclass('public.accounts_workspace_active_identity_uidx') is not null

  union all
  select 'anon_cannot_execute_rpc',
    not has_function_privilege(
      'anon',
      'public.execute_confirmed_financial_action(uuid,text,uuid,text,text,text,uuid,text,text,numeric,date,uuid)',
      'EXECUTE'
    )

  union all
  select 'authenticated_can_execute_rpc',
    has_function_privilege(
      'authenticated',
      'public.execute_confirmed_financial_action(uuid,text,uuid,text,text,text,uuid,text,text,numeric,date,uuid)',
      'EXECUTE'
    )

  union all
  select 'client_operation_column_is_uuid',
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'transactions'
        and column_name = 'client_operation_id'
        and data_type = 'uuid'
    )

  union all
  select 'frontend_cannot_write_client_operation_id',
    not exists (
      select 1 from information_schema.role_column_grants
      where table_schema = 'public'
        and table_name = 'transactions'
        and column_name = 'client_operation_id'
        and grantee in ('anon', 'authenticated')
        and privilege_type in ('INSERT', 'UPDATE')
    )

  union all
  select 'function_derives_current_workspace',
    exists (
      select 1 from target_function
      where pg_get_functiondef(oid) like '%profile.current_workspace_id%'
        and pg_get_functiondef(oid) not like '%p_workspace_id%'
    )

  union all
  select 'function_has_advisory_locks',
    exists (
      select 1 from target_function
      where pg_get_functiondef(oid) like '%pg_advisory_xact_lock%'
    )

  union all
  select 'function_has_explicit_search_path',
    exists (
      select 1 from target_function
      where coalesce(array_to_string(proconfig, ','), '')
        in ('search_path=""', 'search_path=')
    )

  union all
  select 'function_has_expected_signature',
    (select count(*) = 1 from target_function)

  union all
  select 'function_is_security_definer',
    exists (select 1 from target_function where prosecdef)

  union all
  select 'function_returns_minimum_fields',
    exists (
      select 1 from target_function
      where pg_get_function_result(oid) like '%transaction_id uuid%'
        and pg_get_function_result(oid) like '%account_id uuid%'
        and pg_get_function_result(oid) like '%account_created boolean%'
        and pg_get_function_result(oid) like '%account_reactivated boolean%'
        and pg_get_function_result(oid) like '%idempotent_replay boolean%'
        and lower(pg_get_function_result(oid)) !~ '(email|token|secret|password|metadata)'
    )

  union all
  select 'function_uses_auth_uid',
    exists (
      select 1 from target_function
      where pg_get_functiondef(oid) like '%auth.uid()%'
        and pg_get_functiondef(oid) not like '%p_user_id%'
    )

  union all
  select 'idempotency_unique_index',
    to_regclass('public.transactions_workspace_client_operation_uidx') is not null

  union all
  select 'normalization_function_exists',
    to_regprocedure('public.normalize_financial_account_identity(text)') is not null

  union all
  select 'public_cannot_execute_rpc',
    not exists (
      select 1 from information_schema.routine_privileges
      where routine_schema = 'public'
        and routine_name = 'execute_confirmed_financial_action'
        and grantee = 'PUBLIC'
        and privilege_type = 'EXECUTE'
    )

  union all
  select 'rls_remains_enabled',
    (select relrowsecurity from pg_class where oid = 'public.accounts'::regclass)
    and (select relrowsecurity from pg_class where oid = 'public.transactions'::regclass)

  union all
  select 'rpc_validates_category_scope',
    exists (
      select 1 from target_function
      where pg_get_functiondef(oid) like '%category.workspace_id = v_workspace_id%'
    )

  union all
  select 'rpc_validates_membership',
    exists (
      select 1 from target_function
      where pg_get_functiondef(oid) like '%member.user_id = v_user_id%'
        and pg_get_functiondef(oid) like '%member.status = ''active''%'
    )
)
select check_name::text, passed::boolean
from checks
order by check_name;

-- Esperado: 18/18 checks com passed = true.
