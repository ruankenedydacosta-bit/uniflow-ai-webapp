-- Auditoria somente leitura do estado da RPC ensure_own_profile.
-- Nao executa DROP, CREATE, ALTER, INSERT, UPDATE ou DELETE.

with function_state as (
  select
    count(*) as function_count,
    count(*) filter (where function_definition.pronargs = 0) as zero_arg_count,
    bool_or(
      function_definition.pronargs = 0
      and function_definition.prosecdef
      and pg_get_functiondef(function_definition.oid) like '%auth.uid()%'
      and lower(pg_get_functiondef(function_definition.oid))
        like '%on conflict (id) do nothing%'
      and pg_get_function_result(function_definition.oid)
        like '%onboarding_completed boolean%'
      and lower(pg_get_function_result(function_definition.oid))
        !~ '(email|password|token|session|avatar_url|created_at|updated_at)'
    ) as compatible_function
  from pg_proc as function_definition
  join pg_namespace as function_schema
    on function_schema.oid = function_definition.pronamespace
  where function_schema.nspname = 'public'
    and function_definition.proname = 'ensure_own_profile'
)
select
  case
    when function_count = 0
      then 'ensure_profile_ready_for_migration'
    when function_count = 1 and zero_arg_count = 1 and compatible_function
      then 'ensure_profile_already_present_review_before_reapply'
    else 'ensure_profile_function_state_manual_review_required'
  end as audit_state,
  function_count,
  zero_arg_count,
  coalesce(compatible_function, false) as compatible_function
from function_state;

select
  function_definition.oid::regprocedure as function_signature,
  function_definition.prosecdef as security_definer,
  function_definition.proconfig as function_config,
  pg_get_function_result(function_definition.oid) as function_result
from pg_proc as function_definition
join pg_namespace as function_schema
  on function_schema.oid = function_definition.pronamespace
where function_schema.nspname = 'public'
  and function_definition.proname = 'ensure_own_profile';
