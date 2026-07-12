-- Auditoria somente leitura antes de aplicar a migration 008.
-- Executar exclusivamente no UniFlow DEV. Nao corrige nem remove objetos.

with dependencies as (
  select
    to_regclass('public.profiles') is not null
      and to_regclass('public.workspace_members') is not null
      and to_regclass('public.accounts') is not null
      and to_regclass('public.account_types') is not null
      and to_regclass('public.categories') is not null
      and to_regclass('public.transactions') is not null
      as ready
),
objects as (
  select
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'transactions'
        and column_name = 'client_operation_id'
    ) as operation_column,
    to_regprocedure('public.normalize_financial_account_identity(text)') is not null
      as normalization_function,
    to_regprocedure(
      'public.execute_confirmed_financial_action(uuid,text,uuid,text,text,text,uuid,text,text,numeric,date,uuid)'
    ) is not null as atomic_rpc,
    to_regclass('public.transactions_workspace_client_operation_uidx') is not null
      as operation_index,
    to_regclass('public.accounts_workspace_active_identity_uidx') is not null
      as account_identity_index
),
active_account_identities as (
  select
    account.workspace_id,
    regexp_replace(
      regexp_replace(
        translate(
          lower(btrim(account.name)),
          'áàâãäéèêëíìîïóòôõöúùûüç',
          'aaaaaeeeeiiiiooooouuuuc'
        ),
        '\m(conta|cartao|banco|carteira)\M',
        ' ',
        'g'
      ),
      '[^a-z0-9]+',
      '',
      'g'
    ) as normalized_identity
  from public.accounts as account
  where account.is_active = true
),
active_identity_duplicate_groups as (
  select identity.workspace_id, identity.normalized_identity
  from active_account_identities as identity
  where identity.normalized_identity <> ''
  group by identity.workspace_id, identity.normalized_identity
  having count(*) > 1
),
active_identity_duplicates as (
  select count(*) as duplicate_groups
  from active_identity_duplicate_groups
),
state as (
  select
    dependencies.ready,
    objects.*,
    active_identity_duplicates.duplicate_groups,
    (
      objects.operation_column::integer
      + objects.normalization_function::integer
      + objects.atomic_rpc::integer
      + objects.operation_index::integer
      + objects.account_identity_index::integer
    ) as existing_object_count
  from dependencies, objects, active_identity_duplicates
)
select
  case
    when not ready then 'atomic_financial_action_dependencies_missing'
    when duplicate_groups > 0 then 'atomic_financial_action_active_account_conflicts'
    when existing_object_count = 0 then 'atomic_financial_action_ready_for_migration'
    when existing_object_count = 5 then 'atomic_financial_action_already_present_run_validation'
    else 'atomic_financial_action_partial_apply_detected'
  end as audit_status,
  duplicate_groups,
  operation_column,
  normalization_function,
  atomic_rpc,
  operation_index,
  account_identity_index
from state;

-- Resultado esperado antes da primeira aplicacao:
-- atomic_financial_action_ready_for_migration
