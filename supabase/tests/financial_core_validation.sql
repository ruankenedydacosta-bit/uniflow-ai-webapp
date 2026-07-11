-- UniFlow AI - validacao estatica do nucleo financeiro
-- Migration alvo: 20260711_002_financial_core.sql
-- Ambiente permitido apos revisao: somente Supabase UniFlow DEV.
--
-- Este arquivo contem apenas consultas de diagnostico. Ele nao aplica migration,
-- nao cria fixtures e nao altera dados.
--
-- IMPORTANTE:
-- O SQL Editor normalmente executa como postgres e ignora RLS. Estas consultas
-- confirmam estrutura, constraints e policies declaradas, mas NAO validam o
-- comportamento de acesso de um usuario. RLS real deve ser testado depois com
-- supabase-js, anon/publishable key e usuarios autenticados de papeis diferentes.

-- 1. Tabelas esperadas no schema public.
select table_schema, table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('accounts', 'categories', 'transactions')
order by table_name;

-- Esperado: 3 linhas.

-- 2. Colunas e tipos. Valores monetarios devem aparecer como numeric, nunca float.
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
  and table_name in ('accounts', 'categories', 'transactions')
order by table_name, ordinal_position;

-- 3. Constraints, incluindo checks de tipos, status, valores e escopo de contas.
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
  and constraint_table.relname in ('accounts', 'categories', 'transactions')
order by constraint_table.relname, constraint_definition.conname;

-- 4. Checks essenciais de dominio. Esperado: uma linha para cada constraint.
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
    'accounts_account_type_check',
    'accounts_source_type_check',
    'accounts_sync_status_check',
    'categories_category_type_check',
    'transactions_amount_positive_check',
    'transactions_transaction_type_check',
    'transactions_status_check',
    'transactions_source_type_check',
    'transactions_transfer_accounts_check'
  )
order by constraint_definition.conname;

-- 5. Indices de workspace, datas, status, origem e deduplicacao externa.
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('accounts', 'categories', 'transactions')
order by tablename, indexname;

-- 6. RLS deve estar ativo nas tres tabelas.
select
  table_definition.relname as table_name,
  table_definition.relrowsecurity as rls_enabled,
  table_definition.relforcerowsecurity as rls_forced
from pg_class as table_definition
join pg_namespace as table_schema
  on table_schema.oid = table_definition.relnamespace
where table_schema.nspname = 'public'
  and table_definition.relname in ('accounts', 'categories', 'transactions')
order by table_definition.relname;

-- Esperado: rls_enabled = true para todas.

-- 7. Policies declaradas por operacao e papel.
select
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('accounts', 'categories', 'transactions')
order by tablename, cmd, policyname;

-- 8. Triggers de escopo e updated_at.
select
  event_object_table as table_name,
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
from information_schema.triggers
where trigger_schema = 'public'
  and event_object_table in ('accounts', 'categories', 'transactions')
order by event_object_table, trigger_name, event_manipulation;

-- 9. Privilegios por tabela/coluna. Anon nao deve ter acesso; authenticated
-- deve receber apenas operacoes complementadas por RLS.
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('accounts', 'categories', 'transactions')
  and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type;

select grantee, table_name, column_name, privilege_type
from information_schema.role_column_grants
where table_schema = 'public'
  and table_name in ('accounts', 'categories', 'transactions')
  and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type, column_name;

-- 10. Confirmacao de que nao existem colunas destinadas a segredos bancarios.
-- Esperado: zero linhas. Metadata e raw_provider_data tambem nao podem receber
-- tokens ou segredos por convencao e validacao futura da camada segura.
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and table_name in ('accounts', 'categories', 'transactions')
  and (
    column_name ilike '%token%'
    or column_name ilike '%secret%'
    or column_name ilike '%password%'
    or column_name ilike '%credential%'
    or column_name ilike '%certificate%'
    or column_name ilike '%consent%'
  )
order by table_name, column_name;

-- 11. Comentarios de seguranca Open Finance.
select
  table_definition.relname as table_name,
  column_definition.attname as column_name,
  col_description(column_definition.attrelid, column_definition.attnum) as comment
from pg_attribute as column_definition
join pg_class as table_definition
  on table_definition.oid = column_definition.attrelid
join pg_namespace as table_schema
  on table_schema.oid = table_definition.relnamespace
where table_schema.nspname = 'public'
  and table_definition.relname in ('accounts', 'transactions')
  and column_definition.attname in (
    'external_provider',
    'external_transaction_id',
    'metadata',
    'raw_provider_data'
  )
order by table_definition.relname, column_definition.attname;

