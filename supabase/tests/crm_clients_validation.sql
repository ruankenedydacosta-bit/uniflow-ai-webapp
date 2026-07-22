-- UniFlow AI - validacao de public.clients (Fase 7.1 do CRM)
-- Migration alvo: 20260721_015_crm_clients.sql
-- Ambiente permitido: somente Supabase UniFlow DEV.
--
-- Este arquivo tem duas partes:
--   PARTE A - consultas estruturais (schema, constraints, indices, triggers,
--             policies). Rodam como postgres no SQL Editor e NAO validam RLS.
--   PARTE B - roteiro manual de comportamento sob RLS, no mesmo estilo de
--             supabase/tests/rls_validation.sql (set_config do JWT simulado +
--             `set local role authenticated`, sempre dentro de
--             `begin; ... rollback;`). Nenhum bloco desta parte deve ser
--             commitado -- eles existem para confirmar comportamento, nao
--             para persistir dado de teste.
--
-- Antes de rodar a PARTE B, tenha preparados (via Auth/Dashboard, fora deste
-- arquivo):
--   WORKSPACE_A_UUID       - workspace business de teste A.
--   WORKSPACE_B_UUID       - workspace business de teste B (isolado de A).
--   OWNER_A_UUID            - membro role='owner', status='active' em A.
--   MEMBER_A_UUID            - membro role='member', status='active' em A.
--   VIEWER_A_UUID            - membro role='viewer', status='active' em A.
--   DISABLED_MEMBER_A_UUID   - membro de A com status='disabled' (ou 'invited').
--   MEMBER_B_UUID            - membro role='member', status='active' em B (nao pertence a A).

-- ============================================================================
-- PARTE A - VALIDACAO ESTRUTURAL (roda como postgres, ignora RLS)
-- ============================================================================

-- A1. Tabela criada.
select table_schema, table_name
from information_schema.tables
where table_schema = 'public'
  and table_name = 'clients';

-- Esperado: 1 linha.

-- A2. Colunas e tipos.
select
  ordinal_position,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'clients'
order by ordinal_position;

-- A3. Constraints (checks de dominio + not null implicitos via not null nas colunas).
select
  constraint_definition.conname as constraint_name,
  constraint_definition.contype as constraint_type,
  pg_get_constraintdef(constraint_definition.oid) as definition
from pg_constraint as constraint_definition
join pg_class as constraint_table
  on constraint_table.oid = constraint_definition.conrelid
join pg_namespace as table_schema
  on table_schema.oid = constraint_table.relnamespace
where table_schema.nspname = 'public'
  and constraint_table.relname = 'clients'
order by constraint_definition.conname;

-- Esperado: entre outras, clients_name_not_blank, clients_entity_type_check,
-- clients_lifecycle_stage_check, clients_relationship_status_check,
-- clients_estimated_value_non_negative.

-- A4. Indices.
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'clients'
order by indexname;

-- Esperado: pk + clients_workspace_lifecycle_idx + clients_workspace_assigned_idx
-- + clients_workspace_archived_idx.

-- A5. Triggers.
select
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
from information_schema.triggers
where trigger_schema = 'public'
  and event_object_table = 'clients'
order by trigger_name, event_manipulation;

-- Esperado: clients_set_updated_at (before update),
-- clients_prevent_immutable_field_change (before update),
-- clients_validate_assigned_user (before insert, before update).

-- A6. Funcoes de trigger NAO devem ser security definer (correcao do plano).
select
  proname as function_name,
  prosecdef as is_security_definer
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in (
    'prevent_clients_immutable_field_change',
    'validate_client_assigned_user'
  );

-- Esperado: is_security_definer = false para as duas.

-- A7. RLS habilitado.
select
  table_definition.relname as table_name,
  table_definition.relrowsecurity as rls_enabled
from pg_class as table_definition
join pg_namespace as table_schema
  on table_schema.oid = table_definition.relnamespace
where table_schema.nspname = 'public'
  and table_definition.relname = 'clients';

-- Esperado: rls_enabled = true.

-- A8. Policies declaradas.
select policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'clients'
order by cmd, policyname;

-- Esperado: clients_select_active_member (select),
-- clients_insert_active_contributor (insert),
-- clients_update_active_contributor (update),
-- clients_delete_owner_or_admin (delete).

-- ============================================================================
-- PARTE B - COMPORTAMENTO SOB RLS (substituir UUIDs antes de rodar)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- B1. Isolamento entre workspaces (select).
-- ----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', 'MEMBER_A_UUID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

insert into public.clients (workspace_id, name, created_by)
values ('WORKSPACE_A_UUID'::uuid, 'Cliente Workspace A', auth.uid());

-- Esperado: 1 linha (o cliente recem-criado em A).
select id, workspace_id, name from public.clients;

rollback;

begin;
select set_config('request.jwt.claim.sub', 'MEMBER_B_UUID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

-- Esperado: zero linhas -- membro de B nao ve clientes de A (o insert acima
-- foi desfeito pelo rollback, mas o teste real deve ser repetido com um
-- cliente de A ja commitado previamente por fora deste roteiro, se necessario).
select id from public.clients where workspace_id = 'WORKSPACE_A_UUID'::uuid;

rollback;

-- ----------------------------------------------------------------------------
-- B2. Papel viewer: le, nao escreve.
-- ----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', 'VIEWER_A_UUID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

-- Esperado: sucesso (select liberado para qualquer membro ativo).
select id from public.clients where workspace_id = 'WORKSPACE_A_UUID'::uuid;

-- Esperado: erro de RLS (viewer nao esta em ['owner','admin','member']).
insert into public.clients (workspace_id, name, created_by)
values ('WORKSPACE_A_UUID'::uuid, 'Cliente via viewer', auth.uid());

rollback;

-- ----------------------------------------------------------------------------
-- B3. workspace_id imutavel apos a criacao (correcao 1 do plano).
-- ----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', 'OWNER_A_UUID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

insert into public.clients (id, workspace_id, name, created_by)
values (
  '00000000-0000-0000-0000-0000000000b3'::uuid,
  'WORKSPACE_A_UUID'::uuid,
  'Cliente teste imutabilidade',
  auth.uid()
);

-- Esperado: erro "workspace_id cannot be changed after creation".
update public.clients
set workspace_id = 'WORKSPACE_B_UUID'::uuid
where id = '00000000-0000-0000-0000-0000000000b3'::uuid;

rollback;

-- ----------------------------------------------------------------------------
-- B4. created_by imutavel apos a criacao (correcao 2 do plano).
-- ----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', 'OWNER_A_UUID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

insert into public.clients (id, workspace_id, name, created_by)
values (
  '00000000-0000-0000-0000-0000000000b4'::uuid,
  'WORKSPACE_A_UUID'::uuid,
  'Cliente teste created_by',
  auth.uid()
);

-- Esperado: erro "created_by cannot be changed after creation".
update public.clients
set created_by = 'MEMBER_A_UUID'::uuid
where id = '00000000-0000-0000-0000-0000000000b4'::uuid;

rollback;

-- ----------------------------------------------------------------------------
-- B5. assigned_user_id: responsavel ativo do mesmo workspace -- aceito.
-- ----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', 'OWNER_A_UUID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

-- Esperado: sucesso -- MEMBER_A_UUID e membro ativo de WORKSPACE_A_UUID.
insert into public.clients (workspace_id, name, assigned_user_id, created_by)
values (
  'WORKSPACE_A_UUID'::uuid,
  'Cliente com responsavel valido',
  'MEMBER_A_UUID'::uuid,
  auth.uid()
);

select id, assigned_user_id from public.clients
where assigned_user_id = 'MEMBER_A_UUID'::uuid;

rollback;

-- ----------------------------------------------------------------------------
-- B6. assigned_user_id: responsavel desativado -- rejeitado.
-- ----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', 'OWNER_A_UUID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

-- Esperado: erro "assigned_user_id must be an active member of the workspace"
-- (DISABLED_MEMBER_A_UUID pertence a A mas com status <> 'active').
insert into public.clients (workspace_id, name, assigned_user_id, created_by)
values (
  'WORKSPACE_A_UUID'::uuid,
  'Cliente com responsavel desativado',
  'DISABLED_MEMBER_A_UUID'::uuid,
  auth.uid()
);

rollback;

-- ----------------------------------------------------------------------------
-- B7. assigned_user_id: responsavel de outro workspace -- rejeitado.
-- ----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', 'OWNER_A_UUID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

-- Esperado: erro "assigned_user_id must be an active member of the workspace"
-- (MEMBER_B_UUID nao pertence a WORKSPACE_A_UUID).
insert into public.clients (workspace_id, name, assigned_user_id, created_by)
values (
  'WORKSPACE_A_UUID'::uuid,
  'Cliente com responsavel de outro workspace',
  'MEMBER_B_UUID'::uuid,
  auth.uid()
);

rollback;

-- ----------------------------------------------------------------------------
-- B8. Constraints de dominio rejeitam valores fora do enum.
-- ----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', 'OWNER_A_UUID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

-- Esperado: violacao de clients_entity_type_check.
insert into public.clients (workspace_id, name, entity_type, created_by)
values ('WORKSPACE_A_UUID'::uuid, 'Cliente tipo invalido', 'organization', auth.uid());

rollback;

begin;
select set_config('request.jwt.claim.sub', 'OWNER_A_UUID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

-- Esperado: violacao de clients_name_not_blank.
insert into public.clients (workspace_id, name, created_by)
values ('WORKSPACE_A_UUID'::uuid, '   ', auth.uid());

rollback;

-- ============================================================================
-- LIMPEZA
-- ============================================================================
-- Todos os blocos da PARTE B terminam com `rollback;` -- nenhum dado de teste
-- deve persistir. Se algum bloco falhar antes do rollback (ex.: SQL Editor
-- abortando a transacao), confirme manualmente que nenhuma linha de teste
-- ficou em public.clients antes de encerrar a sessao.
