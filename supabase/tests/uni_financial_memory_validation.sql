-- UniFlow AI - validação estática da Memória Financeira V1
-- Migration alvo: 20260711_005_uni_financial_memory.sql
-- Executar somente no UniFlow DEV depois de revisão e aplicação manual.
-- Este roteiro contém consultas somente leitura e não valida RLS autenticado.

-- 1. As duas tabelas esperadas devem existir.
select table_schema, table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('uni_financial_memories', 'uni_memory_evidence')
order by table_name;
-- Esperado: 2 linhas.

-- 2. Colunas, tipos, nulabilidade e defaults.
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
  and table_name in ('uni_financial_memories', 'uni_memory_evidence')
order by table_name, ordinal_position;

-- 3. Constraints de domínio, temporalidade, segurança JSON e unicidade.
select
  table_definition.relname as table_name,
  constraint_definition.conname as constraint_name,
  constraint_definition.contype as constraint_type,
  pg_get_constraintdef(constraint_definition.oid) as definition
from pg_constraint as constraint_definition
join pg_class as table_definition
  on table_definition.oid = constraint_definition.conrelid
join pg_namespace as table_schema
  on table_schema.oid = table_definition.relnamespace
where table_schema.nspname = 'public'
  and table_definition.relname in ('uni_financial_memories', 'uni_memory_evidence')
order by table_definition.relname, constraint_definition.conname;

-- 4. Estados e tipos permitidos devem aparecer nos CHECKs.
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where connamespace = 'public'::regnamespace
  and conname in (
    'uni_financial_memories_type_check',
    'uni_financial_memories_status_check',
    'uni_financial_memories_source_check',
    'uni_financial_memories_confidence_check',
    'uni_financial_memories_confirmation_check'
  )
order by conname;
-- Esperado: 5 linhas; status candidate, confirmed, rejected, expired e superseded.

-- 5. Foreign keys e ações de exclusão.
select
  table_definition.relname as table_name,
  constraint_definition.conname as constraint_name,
  referenced_table.relname as referenced_table,
  pg_get_constraintdef(constraint_definition.oid) as definition
from pg_constraint as constraint_definition
join pg_class as table_definition
  on table_definition.oid = constraint_definition.conrelid
join pg_class as referenced_table
  on referenced_table.oid = constraint_definition.confrelid
join pg_namespace as table_schema
  on table_schema.oid = table_definition.relnamespace
where table_schema.nspname = 'public'
  and table_definition.relname in ('uni_financial_memories', 'uni_memory_evidence')
  and constraint_definition.contype = 'f'
order by table_definition.relname, constraint_definition.conname;
-- Esperado: workspaces, auth.users, memories, transactions e accounts.

-- 6. Índices e unicidade por workspace/usuário/tipo/chave.
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('uni_financial_memories', 'uni_memory_evidence')
order by tablename, indexname;

-- 7. RLS deve estar ativo nas duas tabelas.
select
  table_definition.relname as table_name,
  table_definition.relrowsecurity as rls_enabled,
  table_definition.relforcerowsecurity as rls_forced
from pg_class as table_definition
join pg_namespace as table_schema
  on table_schema.oid = table_definition.relnamespace
where table_schema.nspname = 'public'
  and table_definition.relname in ('uni_financial_memories', 'uni_memory_evidence')
order by table_definition.relname;
-- Esperado: rls_enabled = true nas 2 linhas.

-- 8. Policies declaradas. Nenhuma policy privada pode usar USING (true).
select tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('uni_financial_memories', 'uni_memory_evidence')
order by tablename, cmd, policyname;

select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('uni_financial_memories', 'uni_memory_evidence')
  and lower(coalesce(qual, '')) in ('true', '(true)');
-- Esperado: zero linhas.

-- 9. Grants: anon sem acesso; authenticated sem escrita em evidências.
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('uni_financial_memories', 'uni_memory_evidence')
order by table_name, grantee, privilege_type;

select grantee, table_name, column_name, privilege_type
from information_schema.role_column_grants
where table_schema = 'public'
  and table_name = 'uni_financial_memories'
order by grantee, privilege_type, column_name;

-- 10. Nenhuma coluna pode sugerir segredo, áudio ou transcrição persistida.
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and table_name in ('uni_financial_memories', 'uni_memory_evidence')
  and lower(column_name) ~ '(token|secret|password|certificate|private_key|raw_provider|audio|transcript)';
-- Esperado: zero linhas.

-- 11. Função de sanitização e triggers de proteção/updated_at.
select routine_schema, routine_name, routine_type, data_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('uni_memory_json_is_safe', 'protect_uni_memory_frontend_write')
order by routine_name;

select
  event_object_table as table_name,
  trigger_name,
  action_timing,
  event_manipulation,
  action_statement
from information_schema.triggers
where trigger_schema = 'public'
  and event_object_table = 'uni_financial_memories'
order by trigger_name, event_manipulation;

-- 12. Unicidade compatível para as FKs compostas usadas por evidências.
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'accounts_workspace_id_id_uidx',
    'transactions_workspace_id_id_uidx',
    'uni_financial_memories_workspace_id_id_key',
    'uni_financial_memories_identity_key'
  )
order by indexname;

-- IMPORTANTE: SQL Editor como postgres ignora RLS. Após a aplicação no DEV,
-- validar acesso real com supabase-js, chave pública e usuário autenticado.
