-- UniFlow AI - auditoria somente leitura apos falha da migration 004
-- Ambiente permitido: somente Supabase UniFlow DEV.
--
-- Este arquivo NAO limpa, cria, altera ou remove objetos. Execute-o antes de
-- qualquer nova tentativa. Nao execute em producao.

-- 1. Resumo: indica se nenhuma, algumas ou todas as tabelas da 004 existem.
with expected_tables(table_name) as (
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
    and table_name in (select table_name from expected_tables)
)
select
  count(*) as existing_table_count,
  case
    when count(*) = 0 then 'no_004_tables_found'
    when count(*) = 4 then 'all_004_tables_found_review_before_reapply'
    else 'partial_004_schema_manual_review_required'
  end as apply_state
from existing_tables;

-- 2. Tabelas e colunas que podem ter permanecido.
select
  table_name,
  ordinal_position,
  column_name,
  data_type,
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

-- 3. Indices de compatibilidade que a migration cria nas tabelas normalizadas.
-- Ambos devem existir antes das FKs workspace-first.
select schemaname, tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'accounts_workspace_id_id_uidx',
    'transactions_workspace_id_id_uidx'
  )
order by indexname;

-- 4. Todos os indices da 004 que podem ter permanecido.
select schemaname, tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in (
    'open_finance_consents',
    'external_accounts',
    'external_transactions',
    'sync_jobs'
  )
order by tablename, indexname;

-- 5. Constraints e FKs que podem ter permanecido.
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

-- 6. Unicidade disponivel em accounts e transactions. Confirme indices
-- UNIQUE validos, nao parciais, exatamente em (workspace_id, id).
select
  table_definition.relname as table_name,
  index_definition.relname as index_name,
  index_catalog.indisunique,
  index_catalog.indisvalid,
  index_catalog.indisready,
  (index_catalog.indpred is null) as is_not_partial,
  pg_get_indexdef(index_definition.oid) as definition
from pg_index as index_catalog
join pg_class as table_definition
  on table_definition.oid = index_catalog.indrelid
join pg_namespace as table_schema
  on table_schema.oid = table_definition.relnamespace
join pg_class as index_definition
  on index_definition.oid = index_catalog.indexrelid
where table_schema.nspname = 'public'
  and table_definition.relname in ('accounts', 'transactions')
order by table_definition.relname, index_definition.relname;

-- 7. Policies e RLS possivelmente criados.
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

-- 8. Triggers possivelmente criados.
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

-- 9. Grants possivelmente criados.
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

-- Interpretacao:
-- - no_004_tables_found: a transacao provavelmente reverteu as tabelas da 004;
-- - partial_004_schema_manual_review_required: nao reaplique; prepare limpeza
--   manual revisada para os objetos listados;
-- - all_004_tables_found_review_before_reapply: a migration pode ter avancado
--   mais do que o erro sugere; valide todos os objetos antes de qualquer acao.
--
-- Este roteiro deliberadamente nao inclui DROP automatico.
