-- UniFlow AI - validacao estatica da infraestrutura Open Finance
-- Migration alvo: 20260711_004_open_finance_infrastructure.sql
-- Ambiente permitido depois da revisao: somente Supabase UniFlow DEV.
--
-- Este roteiro e somente leitura. Ele nao aplica migration, nao cria fixtures,
-- nao altera dados e nao valida integracao com qualquer instituicao.
--
-- IMPORTANTE: o SQL Editor normalmente executa como postgres e ignora RLS.
-- As consultas abaixo validam schema, policies e grants declarados. O
-- comportamento real de RLS ainda devera ser testado com anon/publishable key e
-- usuarios autenticados. Nunca use service_role para validar acesso frontend.

-- 1. Tabelas esperadas. Esperado: quatro linhas.
select table_schema, table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'open_finance_consents',
    'external_accounts',
    'external_transactions',
    'sync_jobs'
  )
order by table_name;

-- 2. Colunas, tipos, nullability e defaults.
select
  table_name,
  ordinal_position,
  column_name,
  data_type,
  numeric_precision,
  numeric_scale,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'open_finance_consents',
    'external_accounts',
    'external_transactions',
    'sync_jobs'
  )
order by table_name, ordinal_position;

-- 3. Nenhuma coluna pode ter nome destinado a segredo. Esperado: zero linhas.
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'open_finance_consents',
    'external_accounts',
    'external_transactions',
    'sync_jobs'
  )
  and column_name ~* '(token|secret|password|certificate|private_key)'
order by table_name, column_name;

-- 4. Foreign keys e acoes referenciais. Confirme workspaces, auth.users,
-- accounts, transactions e relacionamentos internos por workspace/provider.
select
  source_table.relname as table_name,
  constraint_definition.conname as constraint_name,
  target_schema.nspname as referenced_schema,
  target_table.relname as referenced_table,
  pg_get_constraintdef(constraint_definition.oid) as definition
from pg_constraint as constraint_definition
join pg_class as source_table
  on source_table.oid = constraint_definition.conrelid
join pg_namespace as source_schema
  on source_schema.oid = source_table.relnamespace
join pg_class as target_table
  on target_table.oid = constraint_definition.confrelid
join pg_namespace as target_schema
  on target_schema.oid = target_table.relnamespace
where source_schema.nspname = 'public'
  and source_table.relname in (
    'open_finance_consents',
    'external_accounts',
    'external_transactions',
    'sync_jobs'
  )
  and constraint_definition.contype = 'f'
order by source_table.relname, constraint_definition.conname;

-- 5. Constraints de dominio e integridade temporal.
select
  constraint_table.relname as table_name,
  constraint_definition.conname as constraint_name,
  constraint_definition.contype as constraint_type,
  pg_get_constraintdef(constraint_definition.oid) as definition
from pg_constraint as constraint_definition
join pg_class as constraint_table
  on constraint_table.oid = constraint_definition.conrelid
join pg_namespace as table_schema
  on table_schema.oid = constraint_table.relnamespace
where table_schema.nspname = 'public'
  and constraint_table.relname in (
    'open_finance_consents',
    'external_accounts',
    'external_transactions',
    'sync_jobs'
  )
order by constraint_table.relname, constraint_definition.conname;

-- 6. Estados permitidos. As definicoes devem conter exatamente os vocabularios
-- documentados para consentimento, conta externa, transacao e sync job.
select
  constraint_table.relname as table_name,
  constraint_definition.conname as constraint_name,
  pg_get_constraintdef(constraint_definition.oid) as definition
from pg_constraint as constraint_definition
join pg_class as constraint_table
  on constraint_table.oid = constraint_definition.conrelid
join pg_namespace as table_schema
  on table_schema.oid = constraint_table.relnamespace
where table_schema.nspname = 'public'
  and constraint_definition.conname in (
    'open_finance_consents_status_check',
    'external_accounts_status_check',
    'external_accounts_sync_status_check',
    'external_transactions_status_check',
    'sync_jobs_status_check'
  )
order by constraint_definition.conname;

-- 6a. Cada estado esperado deve aparecer na constraint correspondente.
-- Esperado: present = true em todas as linhas.
with expected_states(constraint_name, expected_state) as (
  values
    ('open_finance_consents_status_check', 'created'),
    ('open_finance_consents_status_check', 'awaiting_authorization'),
    ('open_finance_consents_status_check', 'authorized'),
    ('open_finance_consents_status_check', 'active'),
    ('open_finance_consents_status_check', 'expired'),
    ('open_finance_consents_status_check', 'revoked'),
    ('open_finance_consents_status_check', 'failed'),
    ('external_accounts_status_check', 'active'),
    ('external_accounts_status_check', 'inactive'),
    ('external_accounts_status_check', 'disconnected'),
    ('external_accounts_status_check', 'error'),
    ('external_accounts_sync_status_check', 'pending'),
    ('external_accounts_sync_status_check', 'syncing'),
    ('external_accounts_sync_status_check', 'synced'),
    ('external_accounts_sync_status_check', 'partial'),
    ('external_accounts_sync_status_check', 'error'),
    ('external_accounts_sync_status_check', 'disconnected'),
    ('external_transactions_status_check', 'pending'),
    ('external_transactions_status_check', 'posted'),
    ('external_transactions_status_check', 'reversed'),
    ('external_transactions_status_check', 'canceled'),
    ('sync_jobs_status_check', 'pending'),
    ('sync_jobs_status_check', 'running'),
    ('sync_jobs_status_check', 'completed'),
    ('sync_jobs_status_check', 'partial'),
    ('sync_jobs_status_check', 'failed'),
    ('sync_jobs_status_check', 'canceled')
),
actual_constraints as (
  select
    constraint_definition.conname as constraint_name,
    pg_get_constraintdef(constraint_definition.oid) as definition
  from pg_constraint as constraint_definition
  join pg_class as constraint_table
    on constraint_table.oid = constraint_definition.conrelid
  join pg_namespace as table_schema
    on table_schema.oid = constraint_table.relnamespace
  where table_schema.nspname = 'public'
)
select
  expected.constraint_name,
  expected.expected_state,
  position(
    quote_literal(expected.expected_state)
    in coalesce(actual.definition, '')
  ) > 0 as present
from expected_states as expected
left join actual_constraints as actual
  on actual.constraint_name = expected.constraint_name
order by expected.constraint_name, expected.expected_state;

-- 7. Integridade temporal. Esperado: todas as constraints listadas.
with expected_constraints(constraint_name) as (
  values
    ('open_finance_consents_granted_at_check'),
    ('open_finance_consents_revoked_at_check'),
    ('open_finance_consents_terminal_dates_check'),
    ('open_finance_consents_expiration_check'),
    ('open_finance_consents_requested_granted_check'),
    ('open_finance_consents_revocation_order_check'),
    ('open_finance_consents_retention_order_check'),
    ('sync_jobs_started_at_check'),
    ('sync_jobs_running_started_check'),
    ('sync_jobs_completed_at_check'),
    ('sync_jobs_completion_order_check'),
    ('sync_jobs_retry_at_check')
)
select
  expected.constraint_name,
  (actual.oid is not null) as present,
  pg_get_constraintdef(actual.oid) as definition
from expected_constraints as expected
left join pg_constraint as actual
  on actual.conname = expected.constraint_name
order by expected.constraint_name;

-- 8. Indices. Os indices unicos devem incluir instituicao/conta onde o
-- identificador do provedor pode nao ser global.
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in (
    'open_finance_consents',
    'external_accounts',
    'external_transactions',
    'sync_jobs'
  )
order by tablename, indexname;

-- 9. Indices essenciais de idempotencia. Esperado: todos presentes e unicos.
with expected_indexes(index_name) as (
  values
    ('open_finance_consents_provider_id_uidx'),
    ('external_accounts_provider_identity_uidx'),
    ('external_transactions_provider_identity_uidx'),
    ('external_transactions_fingerprint_uidx'),
    ('sync_jobs_idempotency_uidx'),
    ('sync_jobs_single_active_scope_uidx'),
    ('sync_jobs_webhook_event_uidx')
)
select
  expected.index_name,
  (actual.indexname is not null) as present,
  actual.indexdef
from expected_indexes as expected
left join pg_indexes as actual
  on actual.schemaname = 'public'
  and actual.indexname = expected.index_name
order by expected.index_name;

-- 10. RLS deve estar ativo nas quatro tabelas.
select
  table_definition.relname as table_name,
  table_definition.relrowsecurity as rls_enabled,
  table_definition.relforcerowsecurity as rls_forced
from pg_class as table_definition
join pg_namespace as table_schema
  on table_schema.oid = table_definition.relnamespace
where table_schema.nspname = 'public'
  and table_definition.relname in (
    'open_finance_consents',
    'external_accounts',
    'external_transactions',
    'sync_jobs'
  )
order by table_definition.relname;

-- 11. Policies. Esperado: somente SELECT para authenticated.
select tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'open_finance_consents',
    'external_accounts',
    'external_transactions',
    'sync_jobs'
  )
order by tablename, policyname;

-- 12. Policies privadas permissivas. Esperado: zero linhas.
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'open_finance_consents',
    'external_accounts',
    'external_transactions',
    'sync_jobs'
  )
  and (
    lower(btrim(coalesce(qual, ''))) in ('true', '(true)')
    or lower(btrim(coalesce(with_check, ''))) in ('true', '(true)')
  );

-- 13. Grants por tabela. Esperado: nenhum grant de escrita para anon ou
-- authenticated e nenhum acesso para anon.
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'open_finance_consents',
    'external_accounts',
    'external_transactions',
    'sync_jobs'
  )
  and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type;

-- 14. Grants por coluna. Authenticated deve possuir somente SELECT nas colunas
-- seguras; payloads e identificadores operacionais de backend ficam ocultos.
select grantee, table_name, column_name, privilege_type
from information_schema.role_column_grants
where table_schema = 'public'
  and table_name in (
    'open_finance_consents',
    'external_accounts',
    'external_transactions',
    'sync_jobs'
  )
  and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type, column_name;

-- Esperado: zero linhas. Estas colunas sao backend-only mesmo quando contem
-- dados sanitizados.
select grantee, table_name, column_name, privilege_type
from information_schema.role_column_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
  and (
    privilege_type <> 'SELECT'
    or column_name in (
      'provider_consent_id',
      'provider_account_id',
      'provider_transaction_id',
      'fingerprint',
      'sanitized_provider_data',
      'idempotency_key',
      'webhook_event_id',
      'cursor_data',
      'requested_by',
      'metadata'
    )
  )
  and table_name in (
    'open_finance_consents',
    'external_accounts',
    'external_transactions',
    'sync_jobs'
  );

-- 15. Triggers de updated_at. Esperado: um trigger por tabela.
select
  event_object_table as table_name,
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
from information_schema.triggers
where trigger_schema = 'public'
  and event_object_table in (
    'open_finance_consents',
    'external_accounts',
    'external_transactions',
    'sync_jobs'
  )
order by event_object_table, trigger_name;

-- 16. Resumo automatico. Todas as linhas devem retornar passed = true.
with target_tables(table_name) as (
  values
    ('open_finance_consents'),
    ('external_accounts'),
    ('external_transactions'),
    ('sync_jobs')
),
existing_tables as (
  select table_name
  from information_schema.tables
  where table_schema = 'public'
),
forbidden_columns as (
  select table_name, column_name
  from information_schema.columns
  where table_schema = 'public'
    and table_name in (select table_name from target_tables)
    and column_name ~* '(token|secret|password|certificate|private_key)'
),
rls_tables as (
  select table_definition.relname as table_name
  from pg_class as table_definition
  join pg_namespace as table_schema
    on table_schema.oid = table_definition.relnamespace
  where table_schema.nspname = 'public'
    and table_definition.relrowsecurity = true
),
expected_foreign_keys(constraint_name) as (
  values
    ('open_finance_consents_workspace_id_fkey'),
    ('open_finance_consents_user_id_fkey'),
    ('external_accounts_workspace_id_fkey'),
    ('external_accounts_consent_workspace_fkey'),
    ('external_accounts_normalized_workspace_fkey'),
    ('external_transactions_workspace_id_fkey'),
    ('external_transactions_account_workspace_fkey'),
    ('external_transactions_normalized_workspace_fkey'),
    ('sync_jobs_workspace_id_fkey'),
    ('sync_jobs_requested_by_fkey'),
    ('sync_jobs_consent_workspace_fkey'),
    ('sync_jobs_account_workspace_fkey')
),
existing_foreign_keys as (
  select constraint_definition.conname as constraint_name
  from pg_constraint as constraint_definition
  join pg_class as constraint_table
    on constraint_table.oid = constraint_definition.conrelid
  join pg_namespace as table_schema
    on table_schema.oid = constraint_table.relnamespace
  where table_schema.nspname = 'public'
    and constraint_definition.contype = 'f'
    and constraint_table.relname in (select table_name from target_tables)
),
expected_indexes(index_name) as (
  values
    ('open_finance_consents_provider_id_uidx'),
    ('external_accounts_provider_identity_uidx'),
    ('external_transactions_provider_identity_uidx'),
    ('external_transactions_fingerprint_uidx'),
    ('sync_jobs_idempotency_uidx'),
    ('sync_jobs_single_active_scope_uidx'),
    ('sync_jobs_webhook_event_uidx')
),
existing_indexes as (
  select indexname as index_name
  from pg_indexes
  where schemaname = 'public'
    and tablename in (select table_name from target_tables)
),
expected_triggers(trigger_name) as (
  values
    ('open_finance_consents_set_updated_at'),
    ('external_accounts_set_updated_at'),
    ('external_transactions_set_updated_at'),
    ('sync_jobs_set_updated_at')
),
existing_triggers as (
  select trigger_name
  from information_schema.triggers
  where trigger_schema = 'public'
    and event_object_table in (select table_name from target_tables)
),
expected_status_constraints(constraint_name) as (
  values
    ('open_finance_consents_status_check'),
    ('external_accounts_status_check'),
    ('external_accounts_sync_status_check'),
    ('external_transactions_status_check'),
    ('sync_jobs_status_check')
),
existing_status_constraints as (
  select constraint_definition.conname as constraint_name
  from pg_constraint as constraint_definition
  join pg_class as constraint_table
    on constraint_table.oid = constraint_definition.conrelid
  join pg_namespace as table_schema
    on table_schema.oid = constraint_table.relnamespace
  where table_schema.nspname = 'public'
    and constraint_definition.contype = 'c'
    and constraint_table.relname in (select table_name from target_tables)
),
unsafe_policies as (
  select policyname
  from pg_policies
  where schemaname = 'public'
    and tablename in (select table_name from target_tables)
    and (
      cmd <> 'SELECT'
      or roles <> array['authenticated']::name[]
      or lower(btrim(coalesce(qual, ''))) in ('true', '(true)')
    )
),
unsafe_grants as (
  select table_name
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name in (select table_name from target_tables)
    and grantee in ('anon', 'authenticated')

  union all

  select table_name
  from information_schema.role_column_grants
  where table_schema = 'public'
    and table_name in (select table_name from target_tables)
    and grantee in ('anon', 'authenticated')
    and (grantee = 'anon' or privilege_type <> 'SELECT')
),
hidden_column_grants as (
  select table_name, column_name
  from information_schema.role_column_grants
  where table_schema = 'public'
    and table_name in (select table_name from target_tables)
    and grantee in ('anon', 'authenticated')
    and column_name in (
      'provider_consent_id',
      'provider_account_id',
      'provider_transaction_id',
      'fingerprint',
      'sanitized_provider_data',
      'idempotency_key',
      'webhook_event_id',
      'cursor_data',
      'requested_by',
      'metadata'
    )
)
select
  'four_tables_exist' as check_name,
  count(*) = 4 as passed
from target_tables
where table_name in (select table_name from existing_tables)

union all

select 'no_forbidden_columns', count(*) = 0
from forbidden_columns

union all

select 'rls_enabled_on_four_tables', count(*) = 4
from target_tables
where table_name in (select table_name from rls_tables)

union all

select 'twelve_foreign_keys_exist', count(*) = 12
from expected_foreign_keys
where constraint_name in (select constraint_name from existing_foreign_keys)

union all

select 'seven_idempotency_indexes_exist', count(*) = 7
from expected_indexes
where index_name in (select index_name from existing_indexes)

union all

select 'four_updated_at_triggers_exist', count(*) = 4
from expected_triggers
where trigger_name in (select trigger_name from existing_triggers)

union all

select 'five_status_constraints_exist', count(*) = 5
from expected_status_constraints
where constraint_name in (
  select constraint_name from existing_status_constraints
)

union all

select 'four_safe_select_policies', count(*) = 4
from pg_policies
where schemaname = 'public'
  and tablename in (select table_name from target_tables)
  and policyname not in (select policyname from unsafe_policies)

union all

select 'no_unsafe_frontend_grants', count(*) = 0
from unsafe_grants

union all

select 'no_hidden_column_grants', count(*) = 0
from hidden_column_grants
order by check_name;
