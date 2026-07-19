-- Auditoria somente leitura antes da migration 009. Executar apenas no DEV.

with dependencies as (
  select
    to_regprocedure(
      'public.execute_confirmed_financial_action(uuid,text,uuid,text,text,text,uuid,text,text,numeric,date,uuid)'
    ) is not null
      and to_regprocedure('public.normalize_financial_account_identity(text)') is not null
      and to_regclass('public.accounts_workspace_active_identity_uidx') is not null
      and to_regclass('public.transactions_workspace_client_operation_uidx') is not null
      as ready
),
objects as (
  select
    to_regprocedure('public.get_derived_account_balances()') is not null
      as account_balance_function,
    to_regprocedure('public.get_derived_workspace_balance()') is not null
      as workspace_balance_function,
    coalesce(
      has_function_privilege(
        'authenticated',
        to_regprocedure('public.normalize_financial_account_identity(text)'),
        'EXECUTE'
      ),
      false
    ) as authenticated_can_normalize
),
state as (
  select
    dependencies.ready,
    objects.*,
    (
      objects.account_balance_function::integer
      + objects.workspace_balance_function::integer
      + objects.authenticated_can_normalize::integer
    ) as correction_count
  from dependencies, objects
)
select
  case
    when not ready then 'atomic_financial_action_fix_dependencies_missing'
    when correction_count = 0 then 'atomic_financial_action_fix_ready_for_migration'
    when correction_count = 3 then 'atomic_financial_action_fix_already_present_run_validation'
    else 'atomic_financial_action_fix_partial_apply_detected'
  end as audit_status,
  account_balance_function,
  workspace_balance_function,
  authenticated_can_normalize
from state;

-- Esperado depois da 008 e antes da primeira aplicacao da 009:
-- atomic_financial_action_fix_ready_for_migration
