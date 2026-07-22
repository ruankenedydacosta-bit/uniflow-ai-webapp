-- UniFlow AI - validacao de public.crm_pipeline_stages e public.crm_opportunities
-- (Subfase 7.5.1 do CRM)
-- Migration alvo: 20260721_016_crm_pipeline.sql
-- Ambiente permitido: somente Supabase UniFlow DEV.
--
-- PARTE A - consultas estruturais (schema, constraints, indices, triggers,
--           policies, seed). Rodam como postgres no SQL Editor e NAO
--           validam RLS.
-- PARTE B - roteiro manual de comportamento sob RLS, no mesmo estilo de
--           supabase/tests/rls_validation.sql e
--           supabase/tests/crm_clients_validation.sql (set_config do JWT
--           simulado + `set local role authenticated`, sempre dentro de
--           `begin; ... rollback;`). Nenhum bloco deve ser commitado.
--
-- Antes de rodar a PARTE B, tenha preparados (via Auth/Dashboard/SQL como
-- postgres, fora dos blocos de teste):
--   WORKSPACE_A_UUID          - workspace business de teste A.
--   WORKSPACE_B_UUID          - workspace business de teste B (isolado de A).
--   OWNER_A_UUID               - membro role='owner', status='active' em A
--                                 (ou o proprio owner_user_id de A).
--   MEMBER_A_UUID               - membro role='member', status='active' em A.
--   VIEWER_A_UUID               - membro role='viewer', status='active' em A.
--   CLIENT_A_UUID                - cliente ativo (is_archived=false) em A.
--   CLIENT_A_ARCHIVED_UUID       - cliente arquivado (is_archived=true) em A.
--   CLIENT_B_UUID                - cliente ativo em B (nao pertence a A).
--   STAGE_A_UUID                 - etapa ativa de A (ex.: uma das 5 do seed).
--   STAGE_A_SECOND_UUID          - uma SEGUNDA etapa ativa de A, diferente de STAGE_A_UUID.
--   STAGE_A_ARCHIVED_UUID        - etapa de A com is_archived=true (marcar manualmente antes do teste).
--   STAGE_B_UUID                 - etapa de B (nao pertence a A).
--
-- Para preparar STAGE_A_ARCHIVED_UUID (fixture, fora dos blocos begin/rollback):
--   update public.crm_pipeline_stages set is_archived = true
--   where id = 'STAGE_A_ARCHIVED_UUID'::uuid;
-- Reverta depois: set is_archived = false na mesma linha.

-- ============================================================================
-- PARTE A - VALIDACAO ESTRUTURAL (roda como postgres, ignora RLS)
-- ============================================================================

-- A1. Tabelas criadas.
select table_schema, table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('crm_pipeline_stages', 'crm_opportunities')
order by table_name;

-- Esperado: 2 linhas.

-- A2. Colunas e tipos.
select table_name, ordinal_position, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('crm_pipeline_stages', 'crm_opportunities')
order by table_name, ordinal_position;

-- Esperado: crm_pipeline_stages com 9 colunas (id, workspace_id, name,
-- position, is_default, is_archived, created_by, created_at, updated_at);
-- crm_opportunities com 13 colunas (id, workspace_id, client_id, stage_id,
-- title, estimated_value, outcome, stage_entered_at, assigned_user_id,
-- position, created_by, created_at, updated_at). Confirmar que
-- crm_pipeline_stages.created_by NAO tem column_default (nulo por design)
-- e crm_opportunities.created_by tem column_default envolvendo auth.uid().

-- A3. Constraints.
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
  and constraint_table.relname in ('crm_pipeline_stages', 'crm_opportunities')
order by constraint_table.relname, constraint_definition.conname;

-- Esperado: crm_pipeline_stages_name_not_blank, crm_pipeline_stages_position_non_negative,
-- crm_opportunities_title_not_blank, crm_opportunities_estimated_value_non_negative,
-- crm_opportunities_position_non_negative, crm_opportunities_outcome_check.
-- Confirmar que NAO existe nenhuma constraint unique envolvendo "position"
-- em crm_pipeline_stages (decisao aprovada: sem unique de posicao).

-- A4. Indices.
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('crm_pipeline_stages', 'crm_opportunities')
order by tablename, indexname;

-- Esperado: crm_pipeline_stages: pk + crm_pipeline_stages_workspace_position_idx.
-- crm_opportunities: pk + crm_opportunities_workspace_stage_idx +
-- crm_opportunities_client_idx + crm_opportunities_workspace_outcome_idx.

-- A5. Triggers.
select
  event_object_table as table_name,
  trigger_name,
  event_manipulation,
  action_timing
from information_schema.triggers
where trigger_schema = 'public'
  and event_object_table in ('crm_pipeline_stages', 'crm_opportunities', 'workspaces')
  and trigger_name like '%crm%'
order by event_object_table, trigger_name, event_manipulation;

-- Esperado: crm_pipeline_stages_set_updated_at, crm_pipeline_stages_prevent_immutable_field_change
-- (before update); crm_opportunities_set_updated_at, crm_opportunities_prevent_immutable_field_change,
-- crm_opportunities_set_stage_entered_at (before update); crm_opportunities_validate_relationships
-- (before insert e before update -- 2 linhas); on_business_workspace_created_seed_crm_stages em workspaces
-- (after insert).

-- A6. Funcoes de trigger: quais sao security definer.
select proname as function_name, prosecdef as is_security_definer
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in (
    'prevent_crm_pipeline_stages_immutable_field_change',
    'prevent_crm_opportunities_immutable_field_change',
    'set_crm_opportunity_stage_entered_at',
    'validate_crm_opportunity_relationships',
    'seed_default_crm_pipeline_stages'
  )
order by proname;

-- Esperado: is_security_definer = true SOMENTE para seed_default_crm_pipeline_stages;
-- false para as outras 4.

-- A7. RLS habilitado.
select relname as table_name, relrowsecurity as rls_enabled
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in ('crm_pipeline_stages', 'crm_opportunities');

-- Esperado: rls_enabled = true para as duas.

-- A8. Policies declaradas.
select tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('crm_pipeline_stages', 'crm_opportunities')
order by tablename, cmd, policyname;

-- Esperado: 4 policies por tabela (select/insert/update/delete), 8 no total.

-- A9. Etapas padrao existentes por workspace business (diagnostico, nao assertivo
-- -- depende do estado real do DEV).
select
  w.id as workspace_id,
  w.name as workspace_name,
  count(s.id) as stage_count,
  count(s.id) filter (where s.is_default) as default_stage_count
from public.workspaces w
left join public.crm_pipeline_stages s on s.workspace_id = w.id
where w.workspace_type = 'business'
group by w.id, w.name
order by w.name;

-- Esperado: default_stage_count >= 5 para todo workspace business (o backfill
-- desta migration deve ter rodado). stage_count pode ser > 5 se ja existirem
-- etapas customizadas (nao existe ainda nesta fase, mas a consulta e generica).

-- A10. Ausencia de duplicacao das etapas padrao por nome normalizado.
select workspace_id, lower(btrim(name)) as normalized_name, count(*) as occurrences
from public.crm_pipeline_stages
group by workspace_id, lower(btrim(name))
having count(*) > 1;

-- Esperado: 0 linhas (nenhum nome normalizado duplicado no mesmo workspace).

-- ============================================================================
-- PARTE B - COMPORTAMENTO SOB RLS (substituir UUIDs antes de rodar)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- B1. Criacao de oportunidade valida.
-- ----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', 'MEMBER_A_UUID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

-- Esperado: sucesso.
insert into public.crm_opportunities (workspace_id, client_id, stage_id, title, estimated_value, created_by)
values ('WORKSPACE_A_UUID'::uuid, 'CLIENT_A_UUID'::uuid, 'STAGE_A_UUID'::uuid, 'Oportunidade valida', 1000, auth.uid());

select id, title, outcome, stage_id from public.crm_opportunities where title = 'Oportunidade valida';

rollback;

-- ----------------------------------------------------------------------------
-- B2. Rejeicao de titulo vazio.
-- ----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', 'MEMBER_A_UUID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

-- Esperado: violacao de crm_opportunities_title_not_blank.
insert into public.crm_opportunities (workspace_id, client_id, stage_id, title, created_by)
values ('WORKSPACE_A_UUID'::uuid, 'CLIENT_A_UUID'::uuid, 'STAGE_A_UUID'::uuid, '   ', auth.uid());

rollback;

-- ----------------------------------------------------------------------------
-- B3. Rejeicao de valor negativo.
-- ----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', 'MEMBER_A_UUID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

-- Esperado: violacao de crm_opportunities_estimated_value_non_negative.
insert into public.crm_opportunities (workspace_id, client_id, stage_id, title, estimated_value, created_by)
values ('WORKSPACE_A_UUID'::uuid, 'CLIENT_A_UUID'::uuid, 'STAGE_A_UUID'::uuid, 'Valor negativo', -10, auth.uid());

rollback;

-- ----------------------------------------------------------------------------
-- B4. Rejeicao de outcome invalido.
-- ----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', 'MEMBER_A_UUID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

-- Esperado: violacao de crm_opportunities_outcome_check.
insert into public.crm_opportunities (workspace_id, client_id, stage_id, title, outcome, created_by)
values ('WORKSPACE_A_UUID'::uuid, 'CLIENT_A_UUID'::uuid, 'STAGE_A_UUID'::uuid, 'Outcome invalido', 'maybe', auth.uid());

rollback;

-- ----------------------------------------------------------------------------
-- B5. Rejeicao de cliente de outro workspace.
-- ----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', 'MEMBER_A_UUID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

-- Esperado: erro "client belongs to a different workspace" (ou "not found
-- or not accessible", se o membro de A nao enxergar CLIENT_B_UUID via RLS).
insert into public.crm_opportunities (workspace_id, client_id, stage_id, title, created_by)
values ('WORKSPACE_A_UUID'::uuid, 'CLIENT_B_UUID'::uuid, 'STAGE_A_UUID'::uuid, 'Cliente de outro workspace', auth.uid());

rollback;

-- ----------------------------------------------------------------------------
-- B6. Rejeicao de etapa de outro workspace.
-- ----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', 'MEMBER_A_UUID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

-- Esperado: erro "stage belongs to a different workspace" (ou "not found
-- or not accessible").
insert into public.crm_opportunities (workspace_id, client_id, stage_id, title, created_by)
values ('WORKSPACE_A_UUID'::uuid, 'CLIENT_A_UUID'::uuid, 'STAGE_B_UUID'::uuid, 'Etapa de outro workspace', auth.uid());

rollback;

-- ----------------------------------------------------------------------------
-- B7. Rejeicao de cliente arquivado na criacao.
-- ----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', 'MEMBER_A_UUID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

-- Esperado: erro "cannot create an opportunity for an archived client".
insert into public.crm_opportunities (workspace_id, client_id, stage_id, title, created_by)
values ('WORKSPACE_A_UUID'::uuid, 'CLIENT_A_ARCHIVED_UUID'::uuid, 'STAGE_A_UUID'::uuid, 'Cliente arquivado', auth.uid());

rollback;

-- ----------------------------------------------------------------------------
-- B8. Rejeicao de etapa arquivada na criacao.
-- ----------------------------------------------------------------------------
-- Pre-requisito: STAGE_A_ARCHIVED_UUID com is_archived=true (ver preparo no topo do arquivo).
begin;
select set_config('request.jwt.claim.sub', 'MEMBER_A_UUID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

-- Esperado: erro "cannot create an opportunity in an archived stage".
insert into public.crm_opportunities (workspace_id, client_id, stage_id, title, created_by)
values ('WORKSPACE_A_UUID'::uuid, 'CLIENT_A_UUID'::uuid, 'STAGE_A_ARCHIVED_UUID'::uuid, 'Etapa arquivada', auth.uid());

rollback;

-- ----------------------------------------------------------------------------
-- B9. Rejeicao de movimentacao para etapa arquivada.
-- ----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', 'MEMBER_A_UUID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

insert into public.crm_opportunities (id, workspace_id, client_id, stage_id, title, created_by)
values (
  '00000000-0000-0000-0000-0000000000b9'::uuid,
  'WORKSPACE_A_UUID'::uuid, 'CLIENT_A_UUID'::uuid, 'STAGE_A_UUID'::uuid,
  'Oportunidade para mover', auth.uid()
);

-- Esperado: erro "cannot move an opportunity into an archived stage".
update public.crm_opportunities
set stage_id = 'STAGE_A_ARCHIVED_UUID'::uuid
where id = '00000000-0000-0000-0000-0000000000b9'::uuid;

rollback;

-- ----------------------------------------------------------------------------
-- B10. stage_entered_at atualiza automaticamente ao mudar de etapa.
-- ----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', 'MEMBER_A_UUID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

insert into public.crm_opportunities (id, workspace_id, client_id, stage_id, title, created_by)
values (
  '00000000-0000-0000-0000-0000000000b1'::uuid,
  'WORKSPACE_A_UUID'::uuid, 'CLIENT_A_UUID'::uuid, 'STAGE_A_UUID'::uuid,
  'Oportunidade stage_entered_at', auth.uid()
);

select stage_entered_at as antes from public.crm_opportunities
where id = '00000000-0000-0000-0000-0000000000b1'::uuid;

-- Pequena espera nao e necessaria: comparar timestamps antes/depois via
-- desigualdade e suficiente (now() dentro da mesma transacao ainda avanca
-- entre statements por causa do clock_timestamp implicito do trigger).
update public.crm_opportunities
set stage_id = 'STAGE_A_SECOND_UUID'::uuid
where id = '00000000-0000-0000-0000-0000000000b1'::uuid;

-- Esperado: stage_entered_at (depois) > antes.
select stage_entered_at as depois from public.crm_opportunities
where id = '00000000-0000-0000-0000-0000000000b1'::uuid;

rollback;

-- ----------------------------------------------------------------------------
-- B11. stage_entered_at NAO muda ao editar so titulo/valor.
-- ----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', 'MEMBER_A_UUID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

insert into public.crm_opportunities (id, workspace_id, client_id, stage_id, title, estimated_value, created_by)
values (
  '00000000-0000-0000-0000-0000000000b2'::uuid,
  'WORKSPACE_A_UUID'::uuid, 'CLIENT_A_UUID'::uuid, 'STAGE_A_UUID'::uuid,
  'Oportunidade titulo/valor', 500, auth.uid()
);

select stage_entered_at as antes from public.crm_opportunities
where id = '00000000-0000-0000-0000-0000000000b2'::uuid;

update public.crm_opportunities
set title = 'Oportunidade titulo/valor editado', estimated_value = 750
where id = '00000000-0000-0000-0000-0000000000b2'::uuid;

-- Esperado: stage_entered_at (depois) IGUAL a antes.
select stage_entered_at as depois from public.crm_opportunities
where id = '00000000-0000-0000-0000-0000000000b2'::uuid;

rollback;

-- ----------------------------------------------------------------------------
-- B12. Rejeicao de alteracao de workspace_id.
-- ----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', 'MEMBER_A_UUID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

insert into public.crm_opportunities (id, workspace_id, client_id, stage_id, title, created_by)
values (
  '00000000-0000-0000-0000-0000000000b3'::uuid,
  'WORKSPACE_A_UUID'::uuid, 'CLIENT_A_UUID'::uuid, 'STAGE_A_UUID'::uuid,
  'Oportunidade workspace_id', auth.uid()
);

-- Esperado: erro "workspace_id cannot be changed after creation".
update public.crm_opportunities
set workspace_id = 'WORKSPACE_B_UUID'::uuid
where id = '00000000-0000-0000-0000-0000000000b3'::uuid;

rollback;

-- ----------------------------------------------------------------------------
-- B13. Rejeicao de alteracao de client_id.
-- ----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', 'MEMBER_A_UUID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

insert into public.crm_opportunities (id, workspace_id, client_id, stage_id, title, created_by)
values (
  '00000000-0000-0000-0000-0000000000b4'::uuid,
  'WORKSPACE_A_UUID'::uuid, 'CLIENT_A_UUID'::uuid, 'STAGE_A_UUID'::uuid,
  'Oportunidade client_id', auth.uid()
);

-- Esperado: erro "client_id cannot be changed after creation".
-- (Troque para outro cliente ATIVO do mesmo workspace A, se houver mais de
-- um, para isolar que o erro e por imutabilidade e nao por outro motivo.)
update public.crm_opportunities
set client_id = 'CLIENT_A_ARCHIVED_UUID'::uuid
where id = '00000000-0000-0000-0000-0000000000b4'::uuid;

rollback;

-- ----------------------------------------------------------------------------
-- B14. Rejeicao de alteracao de created_by.
-- ----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', 'OWNER_A_UUID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

insert into public.crm_opportunities (id, workspace_id, client_id, stage_id, title, created_by)
values (
  '00000000-0000-0000-0000-0000000000b5'::uuid,
  'WORKSPACE_A_UUID'::uuid, 'CLIENT_A_UUID'::uuid, 'STAGE_A_UUID'::uuid,
  'Oportunidade created_by', auth.uid()
);

-- Esperado: erro "created_by cannot be changed after creation".
update public.crm_opportunities
set created_by = 'MEMBER_A_UUID'::uuid
where id = '00000000-0000-0000-0000-0000000000b5'::uuid;

rollback;

-- ----------------------------------------------------------------------------
-- B15. FK impede excluir cliente com oportunidade vinculada.
-- ----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', 'OWNER_A_UUID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

insert into public.crm_opportunities (workspace_id, client_id, stage_id, title, created_by)
values ('WORKSPACE_A_UUID'::uuid, 'CLIENT_A_UUID'::uuid, 'STAGE_A_UUID'::uuid, 'Oportunidade FK cliente', auth.uid());

-- Esperado: erro de violacao de foreign key (crm_opportunities_client_id_fkey).
delete from public.clients where id = 'CLIENT_A_UUID'::uuid;

rollback;

-- ----------------------------------------------------------------------------
-- B16. FK impede excluir etapa com oportunidade vinculada.
-- ----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', 'OWNER_A_UUID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

insert into public.crm_opportunities (workspace_id, client_id, stage_id, title, created_by)
values ('WORKSPACE_A_UUID'::uuid, 'CLIENT_A_UUID'::uuid, 'STAGE_A_UUID'::uuid, 'Oportunidade FK etapa', auth.uid());

-- Esperado: erro de violacao de foreign key (crm_opportunities_stage_id_fkey).
delete from public.crm_pipeline_stages where id = 'STAGE_A_UUID'::uuid;

rollback;

-- ----------------------------------------------------------------------------
-- B17. Seed automatico ao criar um workspace business novo.
-- ----------------------------------------------------------------------------
-- Roda como postgres (fora de RLS) -- o objetivo aqui e validar o TRIGGER de
-- seed, nao a policy de insert em workspaces (ja coberta em rls_validation.sql).
begin;

insert into public.workspaces (id, name, workspace_type, owner_user_id)
values (
  '00000000-0000-0000-0000-0000000000b6'::uuid,
  'Workspace teste seed business',
  'business',
  'OWNER_A_UUID'::uuid
);

-- Esperado: 5 linhas, exatamente os 5 nomes padrao, is_default = true em todas.
select name, position, is_default
from public.crm_pipeline_stages
where workspace_id = '00000000-0000-0000-0000-0000000000b6'::uuid
order by position;

rollback;

-- ----------------------------------------------------------------------------
-- B18. Ausencia de seed ao criar workspace pessoal.
-- ----------------------------------------------------------------------------
begin;

insert into public.workspaces (id, name, workspace_type, owner_user_id)
values (
  '00000000-0000-0000-0000-0000000000b7'::uuid,
  'Workspace teste seed pessoal',
  'personal',
  'OWNER_A_UUID'::uuid
);

-- Esperado: 0 linhas.
select id from public.crm_pipeline_stages
where workspace_id = '00000000-0000-0000-0000-0000000000b7'::uuid;

rollback;

-- ----------------------------------------------------------------------------
-- B19. RLS por papel: viewer le mas nao escreve; member escreve mas nao exclui.
-- ----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', 'VIEWER_A_UUID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

-- Esperado: sucesso (select liberado a qualquer membro ativo).
select id from public.crm_pipeline_stages where workspace_id = 'WORKSPACE_A_UUID'::uuid;

-- Esperado: erro de RLS (viewer nao esta em ['owner','admin','member']).
insert into public.crm_opportunities (workspace_id, client_id, stage_id, title, created_by)
values ('WORKSPACE_A_UUID'::uuid, 'CLIENT_A_UUID'::uuid, 'STAGE_A_UUID'::uuid, 'Oportunidade via viewer', auth.uid());

rollback;

begin;
select set_config('request.jwt.claim.sub', 'MEMBER_A_UUID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

insert into public.crm_opportunities (id, workspace_id, client_id, stage_id, title, created_by)
values (
  '00000000-0000-0000-0000-0000000000b8'::uuid,
  'WORKSPACE_A_UUID'::uuid, 'CLIENT_A_UUID'::uuid, 'STAGE_A_UUID'::uuid,
  'Oportunidade member delete', auth.uid()
);

-- Esperado: erro de RLS (member nao esta em ['owner','admin'] para delete).
delete from public.crm_opportunities where id = '00000000-0000-0000-0000-0000000000b8'::uuid;

rollback;

-- ============================================================================
-- LIMPEZA
-- ============================================================================
-- Todos os blocos da PARTE B terminam com `rollback;` -- nenhum dado de teste
-- deve persistir. Confirme ao final:
select count(*) from public.crm_opportunities where title like '%teste%' or title like 'Oportunidade %';
select id from public.workspaces where id in (
  '00000000-0000-0000-0000-0000000000b6'::uuid,
  '00000000-0000-0000-0000-0000000000b7'::uuid
);
-- Esperado: 0 linhas nas duas consultas. Se STAGE_A_ARCHIVED_UUID foi
-- arquivada manualmente para o teste B8/B9, reverta is_archived para false
-- ao final (nao e desfeito por nenhum rollback, foi alterado fora dos blocos).
