-- UniFlow AI - validacao de public.agenda_items (Subfase 8.1 do modulo Agenda)
-- Migration alvo: 20260722_017_agenda_items.sql
-- Ambiente permitido: somente Supabase UniFlow DEV.
--
-- PARTE A - consultas estruturais (schema, constraints, indices, triggers,
--           policies). Rodam como postgres no SQL Editor e NAO validam RLS.
-- PARTE B - roteiro manual de comportamento sob RLS, no mesmo estilo de
--           supabase/tests/rls_validation.sql, supabase/tests/
--           crm_clients_validation.sql e supabase/tests/
--           crm_pipeline_validation.sql (set_config do JWT simulado +
--           `set local role authenticated`, sempre dentro de
--           `begin; ... rollback;`). Nenhum bloco deve ser commitado.
--           NAO EXECUTAR a Parte B nesta subfase -- preparada para a rodada
--           de validacao formal futura, mesma pendencia ja registrada para
--           os arquivos de validacao do CRM.
--
-- Antes de rodar a PARTE B (quando autorizado), tenha preparados (via Auth/
-- Dashboard/SQL como postgres, fora dos blocos de teste):
--   WORKSPACE_A_UUID          - workspace de teste A (pessoal ou business).
--   WORKSPACE_B_UUID          - workspace de teste B (isolado de A).
--   OWNER_A_UUID               - membro role='owner', status='active' em A.
--   MEMBER_A_UUID               - membro role='member', status='active' em A.
--   VIEWER_A_UUID               - membro role='viewer', status='active' em A.
--   DISABLED_MEMBER_A_UUID      - membro de A com status='disabled' (ou 'invited').
--   MEMBER_B_UUID               - membro role='member', status='active' em B (nao pertence a A).
--   CLIENT_A_UUID                - cliente ativo em A (tabela clients).
--   CLIENT_B_UUID                - cliente ativo em B (nao pertence a A).

-- ============================================================================
-- PARTE A - VALIDACAO ESTRUTURAL (roda como postgres, ignora RLS)
-- ============================================================================

-- A1. Tabela criada.
select table_schema, table_name
from information_schema.tables
where table_schema = 'public'
  and table_name = 'agenda_items';

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
  and table_name = 'agenda_items'
order by ordinal_position;

-- Esperado: 15 colunas (id, workspace_id, item_type, title, description,
-- location, starts_at, ends_at, is_all_day, status, client_id,
-- assigned_user_id, created_by, created_at, updated_at). Confirmar:
-- item_type NOT NULL sem column_default; status NOT NULL com default
-- 'scheduled'::text; starts_at NOT NULL; ends_at nullable; is_all_day NOT
-- NULL default false; client_id nullable; created_by com column_default
-- envolvendo auth.uid().

-- A3. Constraints.
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
  and constraint_table.relname = 'agenda_items'
order by constraint_definition.conname;

-- Esperado: 9 linhas -- 1 primary key, 4 foreign keys (workspace_id,
-- client_id, assigned_user_id, created_by) e 4 constraints de dominio
-- (agenda_items_title_not_blank, agenda_items_item_type_check,
-- agenda_items_status_check, agenda_items_ends_at_check).

-- A4. Indices.
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'agenda_items'
order by indexname;

-- Esperado: 5 linhas -- pk (agenda_items_pkey) + agenda_items_workspace_starts_idx
-- + agenda_items_workspace_status_idx + agenda_items_client_idx +
-- agenda_items_workspace_assigned_idx.

-- A5. Triggers.
select
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
from information_schema.triggers
where trigger_schema = 'public'
  and event_object_table = 'agenda_items'
order by trigger_name, event_manipulation;

-- Esperado: 6 linhas -- agenda_items_set_updated_at (before update),
-- agenda_items_prevent_immutable_field_change (before update),
-- agenda_items_validate_assigned_user (before insert e before update -- 2
-- linhas), agenda_items_validate_client (before insert e before update -- 2
-- linhas). 4 triggers logicos no total.

-- A6. Funcoes de trigger: NENHUMA deve ser security definer (nao ha seed
-- automatico em agenda_items, diferente de crm_pipeline_stages).
select proname as function_name, prosecdef as is_security_definer
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in (
    'prevent_agenda_items_immutable_field_change',
    'validate_agenda_item_assigned_user',
    'validate_agenda_item_client'
  )
order by proname;

-- Esperado: is_security_definer = false para as tres funcoes.

-- A7. RLS habilitado.
select
  table_definition.relname as table_name,
  table_definition.relrowsecurity as rls_enabled
from pg_class as table_definition
join pg_namespace as table_schema
  on table_schema.oid = table_definition.relnamespace
where table_schema.nspname = 'public'
  and table_definition.relname = 'agenda_items';

-- Esperado: rls_enabled = true.

-- A8. Policies declaradas.
select policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'agenda_items'
order by cmd, policyname;

-- Esperado: 4 policies -- agenda_items_select_active_member (select),
-- agenda_items_insert_active_contributor (insert),
-- agenda_items_update_active_contributor (update),
-- agenda_items_delete_owner_or_admin (delete).

-- ============================================================================
-- PARTE B - COMPORTAMENTO SOB RLS (NAO EXECUTAR NESTA SUBFASE)
-- Substituir UUIDs antes de rodar. Cada bloco e independente, sempre
-- terminando em rollback -- nenhum dado de teste deve persistir.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- B1. Membro do workspace consegue ler.
-- ----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', 'MEMBER_A_UUID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

insert into public.agenda_items (workspace_id, item_type, title, starts_at, created_by)
values ('WORKSPACE_A_UUID'::uuid, 'meeting', 'Reuniao de teste', now(), auth.uid());

-- Esperado: 1 linha (o item recem-criado em A).
select id, workspace_id, title from public.agenda_items;

rollback;

-- ----------------------------------------------------------------------------
-- B2. Outro workspace nao consegue ler.
-- ----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', 'MEMBER_B_UUID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

-- Esperado: zero linhas -- membro de B nao ve itens de A (o insert do bloco
-- B1 foi desfeito pelo rollback; repetir com um item de A ja commitado
-- previamente por fora deste roteiro, se necessario para um teste real).
select id from public.agenda_items where workspace_id = 'WORKSPACE_A_UUID'::uuid;

rollback;

-- ----------------------------------------------------------------------------
-- B3. Viewer nao consegue inserir.
-- ----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', 'VIEWER_A_UUID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

-- Esperado: sucesso (select liberado a qualquer membro ativo).
select id from public.agenda_items where workspace_id = 'WORKSPACE_A_UUID'::uuid;

-- Esperado: erro de RLS (viewer nao esta em ['owner','admin','member']).
insert into public.agenda_items (workspace_id, item_type, title, starts_at, created_by)
values ('WORKSPACE_A_UUID'::uuid, 'task', 'Tarefa via viewer', now(), auth.uid());

rollback;

-- ----------------------------------------------------------------------------
-- B4. Member consegue inserir.
-- ----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', 'MEMBER_A_UUID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

-- Esperado: sucesso.
insert into public.agenda_items (workspace_id, item_type, title, starts_at, created_by)
values ('WORKSPACE_A_UUID'::uuid, 'task', 'Tarefa via member', now(), auth.uid());

rollback;

-- ----------------------------------------------------------------------------
-- B5. Viewer nao consegue atualizar.
-- ----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', 'OWNER_A_UUID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

insert into public.agenda_items (id, workspace_id, item_type, title, starts_at, created_by)
values (
  '00000000-0000-0000-0000-0000000000c1'::uuid,
  'WORKSPACE_A_UUID'::uuid, 'reminder', 'Lembrete teste update viewer', now(), auth.uid()
);

select set_config('request.jwt.claim.sub', 'VIEWER_A_UUID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

-- Esperado: erro de RLS (viewer nao esta em ['owner','admin','member']) ou
-- zero linhas afetadas (a policy USING ja esconde a linha do update).
update public.agenda_items
set title = 'Titulo alterado por viewer'
where id = '00000000-0000-0000-0000-0000000000c1'::uuid;

rollback;

-- ----------------------------------------------------------------------------
-- B6. Member consegue atualizar.
-- ----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', 'MEMBER_A_UUID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

insert into public.agenda_items (id, workspace_id, item_type, title, starts_at, created_by)
values (
  '00000000-0000-0000-0000-0000000000c2'::uuid,
  'WORKSPACE_A_UUID'::uuid, 'reminder', 'Lembrete teste update member', now(), auth.uid()
);

-- Esperado: sucesso.
update public.agenda_items
set title = 'Titulo alterado por member'
where id = '00000000-0000-0000-0000-0000000000c2'::uuid;

rollback;

-- ----------------------------------------------------------------------------
-- B7. Owner/admin conseguem excluir.
-- ----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', 'OWNER_A_UUID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

insert into public.agenda_items (id, workspace_id, item_type, title, starts_at, created_by)
values (
  '00000000-0000-0000-0000-0000000000c3'::uuid,
  'WORKSPACE_A_UUID'::uuid, 'other', 'Item teste delete owner', now(), auth.uid()
);

-- Esperado: sucesso.
delete from public.agenda_items where id = '00000000-0000-0000-0000-0000000000c3'::uuid;

rollback;

-- ----------------------------------------------------------------------------
-- B8. Member nao consegue excluir.
-- ----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', 'MEMBER_A_UUID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

insert into public.agenda_items (id, workspace_id, item_type, title, starts_at, created_by)
values (
  '00000000-0000-0000-0000-0000000000c4'::uuid,
  'WORKSPACE_A_UUID'::uuid, 'other', 'Item teste delete member', now(), auth.uid()
);

-- Esperado: erro de RLS (member nao esta em ['owner','admin'] para delete)
-- ou zero linhas afetadas.
delete from public.agenda_items where id = '00000000-0000-0000-0000-0000000000c4'::uuid;

rollback;

-- ----------------------------------------------------------------------------
-- B9. workspace_id e imutavel.
-- ----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', 'OWNER_A_UUID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

insert into public.agenda_items (id, workspace_id, item_type, title, starts_at, created_by)
values (
  '00000000-0000-0000-0000-0000000000c5'::uuid,
  'WORKSPACE_A_UUID'::uuid, 'other', 'Item teste imutabilidade workspace', now(), auth.uid()
);

-- Esperado: erro "agenda_items: workspace_id cannot be changed after creation".
update public.agenda_items
set workspace_id = 'WORKSPACE_B_UUID'::uuid
where id = '00000000-0000-0000-0000-0000000000c5'::uuid;

rollback;

-- ----------------------------------------------------------------------------
-- B10. created_by e imutavel.
-- ----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', 'OWNER_A_UUID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

insert into public.agenda_items (id, workspace_id, item_type, title, starts_at, created_by)
values (
  '00000000-0000-0000-0000-0000000000c6'::uuid,
  'WORKSPACE_A_UUID'::uuid, 'other', 'Item teste imutabilidade created_by', now(), auth.uid()
);

-- Esperado: erro "agenda_items: created_by cannot be changed after creation".
update public.agenda_items
set created_by = 'MEMBER_A_UUID'::uuid
where id = '00000000-0000-0000-0000-0000000000c6'::uuid;

rollback;

-- ----------------------------------------------------------------------------
-- B11. client_id pode ser alterado (nao e imutavel).
-- ----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', 'OWNER_A_UUID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

insert into public.agenda_items (id, workspace_id, item_type, title, starts_at, client_id, created_by)
values (
  '00000000-0000-0000-0000-0000000000c7'::uuid,
  'WORKSPACE_A_UUID'::uuid, 'appointment', 'Item teste client_id editavel', now(),
  'CLIENT_A_UUID'::uuid, auth.uid()
);

-- Esperado: sucesso -- client_id atualizado sem erro de imutabilidade.
update public.agenda_items
set client_id = null
where id = '00000000-0000-0000-0000-0000000000c7'::uuid;

select id, client_id from public.agenda_items
where id = '00000000-0000-0000-0000-0000000000c7'::uuid;

rollback;

-- ----------------------------------------------------------------------------
-- B12. Cliente de outro workspace e rejeitado.
-- ----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', 'MEMBER_A_UUID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

-- Esperado: erro "agenda_items: client belongs to a different workspace"
-- (ou "not found or not accessible", se o membro de A nao enxergar
-- CLIENT_B_UUID via RLS).
insert into public.agenda_items (workspace_id, item_type, title, starts_at, client_id, created_by)
values (
  'WORKSPACE_A_UUID'::uuid, 'appointment', 'Item cliente de outro workspace', now(),
  'CLIENT_B_UUID'::uuid, auth.uid()
);

rollback;

-- ----------------------------------------------------------------------------
-- B13. assigned_user_id valido e aceito.
-- ----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', 'OWNER_A_UUID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

-- Esperado: sucesso -- MEMBER_A_UUID e membro ativo de WORKSPACE_A_UUID.
insert into public.agenda_items (workspace_id, item_type, title, starts_at, assigned_user_id, created_by)
values (
  'WORKSPACE_A_UUID'::uuid, 'task', 'Item com responsavel valido', now(),
  'MEMBER_A_UUID'::uuid, auth.uid()
);

select id, assigned_user_id from public.agenda_items
where assigned_user_id = 'MEMBER_A_UUID'::uuid;

rollback;

-- ----------------------------------------------------------------------------
-- B14. Usuario inativo e rejeitado.
-- ----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', 'OWNER_A_UUID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

-- Esperado: erro "assigned_user_id must be an active member of the workspace"
-- (DISABLED_MEMBER_A_UUID pertence a A mas com status <> 'active').
insert into public.agenda_items (workspace_id, item_type, title, starts_at, assigned_user_id, created_by)
values (
  'WORKSPACE_A_UUID'::uuid, 'task', 'Item com responsavel desativado', now(),
  'DISABLED_MEMBER_A_UUID'::uuid, auth.uid()
);

rollback;

-- ----------------------------------------------------------------------------
-- B15. Usuario de outro workspace e rejeitado.
-- ----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', 'OWNER_A_UUID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

-- Esperado: erro "assigned_user_id must be an active member of the workspace"
-- (MEMBER_B_UUID nao pertence a WORKSPACE_A_UUID).
insert into public.agenda_items (workspace_id, item_type, title, starts_at, assigned_user_id, created_by)
values (
  'WORKSPACE_A_UUID'::uuid, 'task', 'Item com responsavel de outro workspace', now(),
  'MEMBER_B_UUID'::uuid, auth.uid()
);

rollback;

-- ----------------------------------------------------------------------------
-- B16. Titulo vazio e rejeitado.
-- ----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', 'OWNER_A_UUID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

-- Esperado: violacao de agenda_items_title_not_blank.
insert into public.agenda_items (workspace_id, item_type, title, starts_at, created_by)
values ('WORKSPACE_A_UUID'::uuid, 'other', '   ', now(), auth.uid());

rollback;

-- ----------------------------------------------------------------------------
-- B17. item_type invalido e rejeitado.
-- ----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', 'OWNER_A_UUID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

-- Esperado: violacao de agenda_items_item_type_check.
insert into public.agenda_items (workspace_id, item_type, title, starts_at, created_by)
values ('WORKSPACE_A_UUID'::uuid, 'holiday', 'Tipo invalido', now(), auth.uid());

rollback;

-- ----------------------------------------------------------------------------
-- B18. status invalido e rejeitado.
-- ----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', 'OWNER_A_UUID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

-- Esperado: violacao de agenda_items_status_check.
insert into public.agenda_items (workspace_id, item_type, title, starts_at, status, created_by)
values ('WORKSPACE_A_UUID'::uuid, 'other', 'Status invalido', now(), 'archived', auth.uid());

rollback;

-- ----------------------------------------------------------------------------
-- B19a. ends_at < starts_at e rejeitado.
-- ----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', 'OWNER_A_UUID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

-- Esperado: violacao de agenda_items_ends_at_check.
insert into public.agenda_items (workspace_id, item_type, title, starts_at, ends_at, created_by)
values (
  'WORKSPACE_A_UUID'::uuid, 'meeting', 'Fim antes do inicio',
  now(), now() - interval '1 hour', auth.uid()
);

rollback;

-- ----------------------------------------------------------------------------
-- B19b. Exclusao do cliente define client_id como null, sem excluir o item.
-- ----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', 'OWNER_A_UUID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

insert into public.agenda_items (id, workspace_id, item_type, title, starts_at, client_id, created_by)
values (
  '00000000-0000-0000-0000-0000000000c8'::uuid,
  'WORKSPACE_A_UUID'::uuid, 'appointment', 'Item com cliente para excluir', now(),
  'CLIENT_A_UUID'::uuid, auth.uid()
);

-- Esperado: sucesso -- ON DELETE SET NULL, diferente do bloqueio por FK
-- usado em crm_opportunities.client_id.
delete from public.clients where id = 'CLIENT_A_UUID'::uuid;

-- Esperado: 1 linha, client_id = null (o item de agenda sobrevive).
select id, client_id from public.agenda_items
where id = '00000000-0000-0000-0000-0000000000c8'::uuid;

rollback;

-- ============================================================================
-- LIMPEZA
-- ============================================================================
-- Todos os blocos da PARTE B terminam com `rollback;` -- nenhum dado de teste
-- deve persistir. Se algum bloco falhar antes do rollback (ex.: SQL Editor
-- abortando a transacao), confirme manualmente que nenhuma linha de teste
-- ficou em public.agenda_items antes de encerrar a sessao.
