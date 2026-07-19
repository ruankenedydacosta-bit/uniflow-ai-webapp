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
normalization_function as (
  select function_definition.*
  from pg_proc as function_definition
  join pg_namespace as function_schema
    on function_schema.oid = function_definition.pronamespace
  where function_definition.oid = to_regprocedure(
    'public.normalize_financial_account_identity(text)'
  )
),
account_balance_function as (
  select function_definition.*
  from pg_proc as function_definition
  join pg_namespace as function_schema
    on function_schema.oid = function_definition.pronamespace
  where function_definition.oid = to_regprocedure(
    'public.get_derived_account_balances()'
  )
),
workspace_balance_function as (
  select function_definition.*
  from pg_proc as function_definition
  join pg_namespace as function_schema
    on function_schema.oid = function_definition.pronamespace
  where function_definition.oid = to_regprocedure(
    'public.get_derived_workspace_balance()'
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

  union all
  select 'rpc_replay_requires_completed_original',
    exists (
      select 1 from target_function
      where pg_get_functiondef(oid) like '%transaction.status = ''completed''%'
        and pg_get_functiondef(oid) like '%transaction.source_type = ''manual''%'
        and pg_get_functiondef(oid) like '%transaction.created_by = v_user_id%'
    )

  union all
  select 'atomic_rpc_owner_is_postgres',
    exists (
      select 1 from target_function
      where pg_get_userbyid(proowner) = 'postgres'
    )

  union all
  select 'normalization_owner_is_postgres',
    exists (
      select 1 from normalization_function
      where pg_get_userbyid(proowner) = 'postgres'
    )

  union all
  select 'normalization_is_immutable_invoker',
    exists (
      select 1 from normalization_function
      where provolatile = 'i' and not prosecdef
    )

  union all
  select 'normalization_has_safe_search_path',
    exists (
      select 1 from normalization_function
      where coalesce(array_to_string(proconfig, ','), '')
        in ('search_path=""', 'search_path=')
    )

  union all
  select 'authenticated_can_normalize_for_account_index',
    has_function_privilege(
      'authenticated',
      'public.normalize_financial_account_identity(text)',
      'EXECUTE'
    )

  union all
  select 'anon_cannot_normalize',
    not has_function_privilege(
      'anon',
      'public.normalize_financial_account_identity(text)',
      'EXECUTE'
    )

  union all
  select 'public_cannot_normalize',
    not exists (
      select 1 from information_schema.routine_privileges
      where routine_schema = 'public'
        and routine_name = 'normalize_financial_account_identity'
        and grantee = 'PUBLIC'
        and privilege_type = 'EXECUTE'
    )

  union all
  select 'account_balance_function_exists',
    (select count(*) = 1 from account_balance_function)

  union all
  select 'workspace_balance_function_exists',
    (select count(*) = 1 from workspace_balance_function)

  union all
  select 'account_balance_owner_is_postgres',
    exists (
      select 1 from account_balance_function
      where pg_get_userbyid(proowner) = 'postgres'
    )

  union all
  select 'workspace_balance_owner_is_postgres',
    exists (
      select 1 from workspace_balance_function
      where pg_get_userbyid(proowner) = 'postgres'
    )

  union all
  select 'account_balance_is_security_definer',
    exists (select 1 from account_balance_function where prosecdef)

  union all
  select 'workspace_balance_is_security_definer',
    exists (select 1 from workspace_balance_function where prosecdef)

  union all
  select 'account_balance_has_safe_search_path',
    exists (
      select 1 from account_balance_function
      where coalesce(array_to_string(proconfig, ','), '')
        in ('search_path=""', 'search_path=')
    )

  union all
  select 'workspace_balance_has_safe_search_path',
    exists (
      select 1 from workspace_balance_function
      where coalesce(array_to_string(proconfig, ','), '')
        in ('search_path=""', 'search_path=')
    )

  union all
  select 'authenticated_can_read_account_balances',
    has_function_privilege(
      'authenticated',
      'public.get_derived_account_balances()',
      'EXECUTE'
    )

  union all
  select 'authenticated_can_read_workspace_balance',
    has_function_privilege(
      'authenticated',
      'public.get_derived_workspace_balance()',
      'EXECUTE'
    )

  union all
  select 'anon_cannot_read_account_balances',
    not has_function_privilege(
      'anon',
      'public.get_derived_account_balances()',
      'EXECUTE'
    )

  union all
  select 'anon_cannot_read_workspace_balance',
    not has_function_privilege(
      'anon',
      'public.get_derived_workspace_balance()',
      'EXECUTE'
    )

  union all
  select 'public_cannot_read_account_balances',
    not exists (
      select 1 from information_schema.routine_privileges
      where routine_schema = 'public'
        and routine_name = 'get_derived_account_balances'
        and grantee = 'PUBLIC'
        and privilege_type = 'EXECUTE'
    )

  union all
  select 'public_cannot_read_workspace_balance',
    not exists (
      select 1 from information_schema.routine_privileges
      where routine_schema = 'public'
        and routine_name = 'get_derived_workspace_balance'
        and grantee = 'PUBLIC'
        and privilege_type = 'EXECUTE'
    )

  union all
  select 'balance_functions_have_no_workspace_parameter',
    exists (select 1 from account_balance_function where pronargs = 0)
      and exists (select 1 from workspace_balance_function where pronargs = 0)

  union all
  select 'account_balance_derives_workspace_and_membership',
    exists (
      select 1 from account_balance_function
      where pg_get_functiondef(oid) like '%profile.current_workspace_id%'
        and pg_get_functiondef(oid) like '%member.user_id = v_user_id%'
        and pg_get_functiondef(oid) like '%member.status = ''active''%'
        and pg_get_functiondef(oid) not like '%p_workspace_id%'
    )

  union all
  select 'account_balance_uses_only_completed_transactions',
    exists (
      select 1 from account_balance_function
      where pg_get_functiondef(oid) like '%transaction.status = ''completed''%'
    )

  union all
  select 'workspace_balance_derives_workspace_and_membership',
    exists (
      select 1 from workspace_balance_function
      where pg_get_functiondef(oid) like '%profile.current_workspace_id%'
        and pg_get_functiondef(oid) like '%member.user_id = v_user_id%'
        and pg_get_functiondef(oid) like '%member.status = ''active''%'
        and pg_get_functiondef(oid) not like '%p_workspace_id%'
    )

  union all
  select 'account_balance_handles_transfer_legs_once',
    exists (
      select 1 from account_balance_function
      where pg_get_functiondef(oid) like '%transaction.destination_account_id = account.id%'
        and pg_get_functiondef(oid) like '%movement.transfer_in_total%'
        and pg_get_functiondef(oid) like '%movement.transfer_out_total%'
    )

  union all
  select 'workspace_balance_sums_account_balances',
    exists (
      select 1 from workspace_balance_function
      where pg_get_functiondef(oid) like '%get_derived_account_balances()%'
        and pg_get_functiondef(oid) like '%sum(balance.derived_balance)%'
    )

  union all
  select 'atomic_rpc_does_not_mutate_current_balance',
    exists (
      select 1 from target_function
      where pg_get_functiondef(oid) !~* 'set[[:space:]]+current_balance'
    )

  union all
  select 'balance_returns_no_sensitive_metadata',
    exists (
      select 1 from account_balance_function
      where lower(pg_get_function_result(oid)) !~ '(email|token|secret|password|metadata|workspace_id|user_id)'
    )
      and exists (
        select 1 from workspace_balance_function
        where lower(pg_get_function_result(oid)) !~ '(email|token|secret|password|metadata|workspace_id|user_id)'
      )

  union all
  select 'current_balance_documented_as_non_authoritative',
    coalesce(
      col_description(
        'public.accounts'::regclass,
        (
          select ordinal_position::integer
          from information_schema.columns
          where table_schema = 'public'
            and table_name = 'accounts'
            and column_name = 'current_balance'
        )
      ),
      ''
    ) like '%legado/cache sem autoridade contabil%'
)
select check_name::text, passed::boolean
from checks
order by check_name;

-- Esperado depois das migrations 008 e 009: 49/49 checks com passed = true.
