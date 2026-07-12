-- UniFlow AI - validação estática da Memória Financeira V1
-- Migration alvo: 20260711_005_uni_financial_memory.sql
-- Executar somente no UniFlow DEV depois de revisão e aplicação manual.
-- Este roteiro contém consultas somente leitura e não valida RLS autenticado.

-- 0. Resumo consolidado. Todas as colunas booleanas devem retornar true.
with required_columns(table_name, column_name) as (
  values
    ('uni_financial_memories', 'id'),
    ('uni_financial_memories', 'workspace_id'),
    ('uni_financial_memories', 'user_id'),
    ('uni_financial_memories', 'memory_type'),
    ('uni_financial_memories', 'memory_key'),
    ('uni_financial_memories', 'memory_value'),
    ('uni_financial_memories', 'confidence'),
    ('uni_financial_memories', 'status'),
    ('uni_financial_memories', 'source'),
    ('uni_financial_memories', 'user_confirmed'),
    ('uni_financial_memories', 'requires_confirmation'),
    ('uni_financial_memories', 'first_observed_at'),
    ('uni_financial_memories', 'last_observed_at'),
    ('uni_financial_memories', 'expires_at'),
    ('uni_financial_memories', 'superseded_by_id'),
    ('uni_financial_memories', 'created_at'),
    ('uni_financial_memories', 'updated_at'),
    ('uni_memory_evidence', 'id'),
    ('uni_memory_evidence', 'workspace_id'),
    ('uni_memory_evidence', 'memory_id'),
    ('uni_memory_evidence', 'transaction_id'),
    ('uni_memory_evidence', 'account_id'),
    ('uni_memory_evidence', 'evidence_type'),
    ('uni_memory_evidence', 'source'),
    ('uni_memory_evidence', 'evidence_summary'),
    ('uni_memory_evidence', 'observed_at'),
    ('uni_memory_evidence', 'created_at')
),
required_constraints(name) as (
  values
    ('uni_financial_memories_type_check'),
    ('uni_financial_memories_status_check'),
    ('uni_financial_memories_confidence_check'),
    ('uni_financial_memories_observation_order_check'),
    ('uni_financial_memories_expiration_order_check'),
    ('uni_financial_memories_expired_status_check'),
    ('uni_financial_memories_superseded_status_check'),
    ('uni_financial_memories_key_safe_check'),
    ('uni_financial_memories_value_safe_check'),
    ('uni_memory_evidence_summary_safe_check'),
    ('uni_memory_evidence_source_check')
),
required_foreign_keys(name) as (
  values
    ('uni_financial_memories_workspace_id_fkey'),
    ('uni_financial_memories_user_id_fkey'),
    ('uni_financial_memories_superseded_by_fk'),
    ('uni_memory_evidence_workspace_id_fkey'),
    ('uni_memory_evidence_memory_fk'),
    ('uni_memory_evidence_transaction_fk'),
    ('uni_memory_evidence_account_fk')
),
required_indexes(name) as (
  values
    ('uni_financial_memories_workspace_id_id_key'),
    ('uni_financial_memories_active_identity_uidx'),
    ('uni_financial_memories_workspace_status_idx'),
    ('uni_financial_memories_user_type_idx'),
    ('uni_financial_memories_expiration_idx'),
    ('uni_memory_evidence_workspace_memory_idx'),
    ('uni_memory_evidence_transaction_idx')
)
select
  (select count(*) = 2 from information_schema.tables
    where table_schema = 'public'
      and table_name in ('uni_financial_memories', 'uni_memory_evidence'))
    as two_tables_exist,
  not exists (
    select 1 from required_columns as required
    left join information_schema.columns as actual
      on actual.table_schema = 'public'
      and actual.table_name = required.table_name
      and actual.column_name = required.column_name
    where actual.column_name is null
  ) as required_columns_exist,
  not exists (
    select 1 from required_constraints as required
    left join pg_constraint as actual
      on actual.connamespace = 'public'::regnamespace
      and actual.conname = required.name
    where actual.oid is null
  ) as domain_constraints_exist,
  not exists (
    select 1 from required_foreign_keys as required
    left join pg_constraint as actual
      on actual.connamespace = 'public'::regnamespace
      and actual.conname = required.name
      and actual.contype = 'f'
    where actual.oid is null
  ) as foreign_keys_exist,
  not exists (
    select 1 from required_indexes as required
    left join pg_indexes as actual
      on actual.schemaname = 'public' and actual.indexname = required.name
    where actual.indexname is null
  ) as indexes_and_active_uniqueness_exist,
  (select count(*) = 2 from pg_class as table_definition
    join pg_namespace as table_schema on table_schema.oid = table_definition.relnamespace
    where table_schema.nspname = 'public'
      and table_definition.relname in ('uni_financial_memories', 'uni_memory_evidence')
      and table_definition.relrowsecurity)
    as rls_enabled_on_both_tables,
  (select count(*) = 4 from pg_policies
    where schemaname = 'public'
      and tablename in ('uni_financial_memories', 'uni_memory_evidence'))
    as four_scoped_policies_exist,
  not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('uni_financial_memories', 'uni_memory_evidence')
      and lower(coalesce(qual, '')) in ('true', '(true)')
  ) as no_unsafe_using_true,
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and policyname = 'uni_financial_memories_select_own_active_member'
      and qual like '%auth.uid()%'
  ) as memory_read_is_owner_scoped,
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and policyname = 'uni_financial_memories_insert_own_explicit'
      and with_check like '%category_preference%'
      and with_check not like '%recurring_income%'
      and with_check not like '%spending_pattern%'
  ) as frontend_types_are_explicit_only,
  not exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in ('uni_financial_memories', 'uni_memory_evidence')
      and grantee = 'anon'
  ) as anon_has_no_table_grants,
  not exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'uni_memory_evidence'
      and grantee = 'authenticated'
      and privilege_type <> 'SELECT'
  ) as evidence_is_read_only_for_frontend,
  not exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'uni_financial_memories'
      and grantee = 'authenticated'
      and privilege_type = 'UPDATE'
  ) and not exists (
    select 1 from information_schema.role_column_grants
    where table_schema = 'public'
      and table_name = 'uni_financial_memories'
      and grantee = 'authenticated'
      and privilege_type = 'UPDATE'
  ) as no_direct_frontend_update,
  (select count(*) = 5 from information_schema.role_column_grants
    where table_schema = 'public'
      and table_name = 'uni_financial_memories'
      and grantee = 'authenticated'
      and privilege_type = 'INSERT')
    and not exists (
      select 1 from information_schema.role_column_grants
      where table_schema = 'public'
        and table_name = 'uni_financial_memories'
        and grantee = 'authenticated'
        and privilege_type = 'INSERT'
        and column_name not in (
          'workspace_id', 'memory_type', 'memory_key', 'memory_value', 'source'
        )
    )
    as only_five_insert_columns_granted,
  has_function_privilege(
    'authenticated',
    'public.decide_uni_financial_memory(uuid,uuid,text)',
    'EXECUTE'
  ) as controlled_decision_rpc_available,
  has_function_privilege(
    'authenticated',
    'public.correct_uni_explicit_memory(uuid,uuid,jsonb)',
    'EXECUTE'
  ) as controlled_correction_rpc_available,
  not has_function_privilege(
    'anon',
    'public.decide_uni_financial_memory(uuid,uuid,text)',
    'EXECUTE'
  ) and not has_function_privilege(
    'anon',
    'public.correct_uni_explicit_memory(uuid,uuid,jsonb)',
    'EXECUTE'
  ) as anon_cannot_execute_memory_rpcs,
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name in ('uni_financial_memories', 'uni_memory_evidence')
      and lower(column_name) ~ '(token|secret|password|credential|certificate|private_key|raw_provider|audio|transcript)'
  ) as no_forbidden_columns,
  pg_get_functiondef('public.uni_memory_json_is_safe(jsonb,integer)'::regprocedure)
    like '%current_depth > 8%'
    and pg_get_functiondef('public.uni_memory_json_is_safe(jsonb,integer)'::regprocedure)
      like '%octet_length(payload::text) > 16384%'
    as sanitizer_has_depth_and_size_limits,
  exists (
    select 1 from information_schema.triggers
    where trigger_schema = 'public'
      and event_object_table = 'uni_financial_memories'
      and trigger_name = 'uni_financial_memories_set_updated_at'
  ) as updated_at_trigger_exists,
  exists (
    select 1 from information_schema.triggers
    where trigger_schema = 'public'
      and event_object_table = 'uni_financial_memories'
      and trigger_name = 'uni_financial_memories_protect_frontend'
      and event_manipulation = 'INSERT'
  ) as frontend_insert_protection_trigger_exists;

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
  and lower(column_name) ~ '(token|secret|password|credential|certificate|private_key|raw_provider|audio|transcript)';
-- Esperado: zero linhas.

-- 11. Função de sanitização e triggers de proteção/updated_at.
select routine_schema, routine_name, routine_type, data_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'uni_memory_json_is_safe',
    'protect_uni_memory_frontend_insert',
    'decide_uni_financial_memory',
    'correct_uni_explicit_memory'
  )
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
    'uni_financial_memories_active_identity_uidx'
  )
order by indexname;

-- IMPORTANTE: SQL Editor como postgres ignora RLS. Após a aplicação no DEV,
-- validar acesso real com supabase-js, chave pública e usuário autenticado.
