-- UniFlow AI - auditoria somente leitura após eventual falha da migration 005.
-- Não executa DROP, CREATE, ALTER ou qualquer limpeza automática.

with expected_objects(kind, name) as (
  values
    ('table', 'uni_financial_memories'),
    ('table', 'uni_memory_evidence'),
    ('index', 'uni_financial_memories_workspace_id_id_key'),
    ('index', 'uni_financial_memories_active_identity_uidx'),
    ('index', 'uni_financial_memories_workspace_status_idx'),
    ('index', 'uni_financial_memories_user_type_idx'),
    ('index', 'uni_financial_memories_expiration_idx'),
    ('index', 'uni_memory_evidence_workspace_memory_idx'),
    ('index', 'uni_memory_evidence_transaction_idx'),
    ('constraint', 'uni_financial_memories_type_check'),
    ('constraint', 'uni_financial_memories_status_check'),
    ('constraint', 'uni_financial_memories_source_check'),
    ('constraint', 'uni_financial_memories_key_not_blank'),
    ('constraint', 'uni_financial_memories_key_safe_check'),
    ('constraint', 'uni_financial_memories_value_object_check'),
    ('constraint', 'uni_financial_memories_value_safe_check'),
    ('constraint', 'uni_financial_memories_value_size_check'),
    ('constraint', 'uni_financial_memories_confidence_check'),
    ('constraint', 'uni_financial_memories_observation_order_check'),
    ('constraint', 'uni_financial_memories_expiration_order_check'),
    ('constraint', 'uni_financial_memories_expired_status_check'),
    ('constraint', 'uni_financial_memories_superseded_status_check'),
    ('constraint', 'uni_financial_memories_confirmation_check'),
    ('constraint', 'uni_financial_memories_superseded_by_fk'),
    ('constraint', 'uni_financial_memories_workspace_id_fkey'),
    ('constraint', 'uni_financial_memories_user_id_fkey'),
    ('constraint', 'uni_memory_evidence_memory_fk'),
    ('constraint', 'uni_memory_evidence_workspace_id_fkey'),
    ('constraint', 'uni_memory_evidence_transaction_fk'),
    ('constraint', 'uni_memory_evidence_account_fk'),
    ('constraint', 'uni_memory_evidence_type_not_blank'),
    ('constraint', 'uni_memory_evidence_source_check'),
    ('constraint', 'uni_memory_evidence_summary_object_check'),
    ('constraint', 'uni_memory_evidence_summary_safe_check'),
    ('constraint', 'uni_memory_evidence_summary_size_check'),
    ('trigger', 'uni_financial_memories_protect_frontend'),
    ('trigger', 'uni_financial_memories_set_updated_at'),
    ('policy', 'uni_financial_memories_select_own_active_member'),
    ('policy', 'uni_financial_memories_insert_own_explicit'),
    ('policy', 'uni_financial_memories_delete_own'),
    ('policy', 'uni_memory_evidence_select_active_member'),
    ('function', 'uni_memory_json_is_safe'),
    ('function', 'protect_uni_memory_frontend_insert'),
    ('function', 'decide_uni_financial_memory'),
    ('function', 'correct_uni_explicit_memory')
),
found_objects as (
  select expected.kind, expected.name,
    case expected.kind
      when 'table' then to_regclass(format('public.%I', expected.name)) is not null
      when 'index' then exists (
        select 1 from pg_indexes
        where schemaname = 'public' and indexname = expected.name
      )
      when 'constraint' then exists (
        select 1 from pg_constraint
        where connamespace = 'public'::regnamespace and conname = expected.name
      )
      when 'trigger' then exists (
        select 1 from pg_trigger
        where not tgisinternal and tgname = expected.name
      )
      when 'policy' then exists (
        select 1 from pg_policies
        where schemaname = 'public' and policyname = expected.name
      )
      when 'function' then exists (
        select 1 from pg_proc
        where pronamespace = 'public'::regnamespace and proname = expected.name
      )
      else false
    end as found
  from expected_objects as expected
),
summary as (
  select count(*) as expected_count, count(*) filter (where found) as found_count
  from found_objects
)
select
  case
    when found_count = 0 then 'no_005_objects_found'
    when found_count = expected_count then 'all_005_objects_found_review_before_reapply'
    else 'partial_005_schema_manual_review_required'
  end as apply_state,
  found_count,
  expected_count,
  expected_count - found_count as missing_count
from summary;

-- Detalhe dos objetos encontrados e ausentes.
with expected_objects(kind, name) as (
  values
    ('table', 'uni_financial_memories'),
    ('table', 'uni_memory_evidence'),
    ('index', 'uni_financial_memories_active_identity_uidx'),
    ('index', 'uni_financial_memories_workspace_status_idx'),
    ('constraint', 'uni_financial_memories_status_check'),
    ('trigger', 'uni_financial_memories_protect_frontend'),
    ('trigger', 'uni_financial_memories_set_updated_at'),
    ('policy', 'uni_financial_memories_select_own_active_member'),
    ('policy', 'uni_financial_memories_insert_own_explicit'),
    ('policy', 'uni_financial_memories_delete_own'),
    ('policy', 'uni_memory_evidence_select_active_member'),
    ('function', 'uni_memory_json_is_safe'),
    ('function', 'protect_uni_memory_frontend_insert'),
    ('function', 'decide_uni_financial_memory'),
    ('function', 'correct_uni_explicit_memory')
)
select
  expected.kind,
  expected.name,
  case expected.kind
    when 'table' then to_regclass(format('public.%I', expected.name)) is not null
    when 'index' then exists (
      select 1 from pg_indexes where schemaname = 'public' and indexname = expected.name
    )
    when 'constraint' then exists (
      select 1 from pg_constraint where connamespace = 'public'::regnamespace and conname = expected.name
    )
    when 'trigger' then exists (
      select 1 from pg_trigger where not tgisinternal and tgname = expected.name
    )
    when 'policy' then exists (
      select 1 from pg_policies where schemaname = 'public' and policyname = expected.name
    )
    when 'function' then exists (
      select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = expected.name
    )
    else false
  end as found
from expected_objects as expected
order by expected.kind, expected.name;

-- Inventário completo relacionado à migration 005.
select table_name
from information_schema.tables
where table_schema = 'public' and table_name like 'uni%memory%'
order by table_name;

select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public' and indexname like 'uni%memor%'
order by tablename, indexname;

select conrelid::regclass as table_name, conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where connamespace = 'public'::regnamespace and conname like 'uni%memor%'
order by conrelid::regclass::text, conname;

select event_object_table, trigger_name, event_manipulation, action_statement
from information_schema.triggers
where trigger_schema = 'public' and trigger_name like 'uni%memor%'
order by trigger_name, event_manipulation;

select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and policyname like 'uni%memor%'
order by tablename, policyname;

select routine_name, routine_type, security_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'uni_memory_json_is_safe',
    'protect_uni_memory_frontend_insert',
    'decide_uni_financial_memory',
    'correct_uni_explicit_memory'
  )
order by routine_name;
