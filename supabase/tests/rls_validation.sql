-- UniFlow AI - roteiro manual de validacao de RLS
-- Ambiente permitido: somente Supabase UniFlow DEV.
--
-- IMPORTANTE:
-- 1. O SQL Editor normalmente executa como postgres e, nesse contexto, ignora RLS.
-- 2. Uma consulta bem-sucedida como postgres NAO valida policies de usuario.
-- 3. A validacao principal deve usar supabase-js com usuario autenticado por meio
--    de `npm run supabase:test-rls`.
-- 4. Os blocos abaixo que simulam JWT ajudam no diagnostico, mas devem ser
--    executados separadamente e sempre encerrados com rollback.
-- 5. Nunca use service_role para validar acesso de anon ou authenticated.
-- 6. Substitua UUIDs apenas na sessao local do SQL Editor. Nao versione dados reais.

-- ============================================================================
-- BLOCO 1 - PREPARACAO
-- ============================================================================

-- Use o Dashboard de Auth para obter o UUID do usuario de teste.
-- A consulta abaixo serve somente para confirmar os relacionamentos preparados.
-- Como roda com privilegios administrativos, ela NAO valida RLS.

select
  profile.id as user_id,
  profile.current_workspace_id,
  workspace_member.workspace_id,
  workspace_member.role,
  workspace_member.status
from public.profiles as profile
left join public.workspace_members as workspace_member
  on workspace_member.user_id = profile.id
where profile.id = '00000000-0000-0000-0000-000000000000'::uuid;

-- Antes dos proximos blocos, tenha dois UUIDs:
-- USER_WITH_MEMBERSHIP_UUID: usuario owner de um workspace no DEV.
-- USER_WITHOUT_MEMBERSHIP_UUID: usuario de teste sem membership.

-- ============================================================================
-- BLOCO 2 - USUARIO AUTENTICADO COM MEMBERSHIP
-- ============================================================================

-- Execute este bloco isoladamente. Troque os dois placeholders por UUIDs de
-- usuarios de teste do UniFlow DEV. O segundo UUID deve pertencer a outro user.

begin;

select set_config(
  'request.jwt.claim.sub',
  'USER_WITH_MEMBERSHIP_UUID',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

-- Esperado: auth.uid() igual ao usuario simulado.
select auth.uid() as simulated_user_id;

-- Esperado: exatamente o proprio profile.
select id, user_mode, current_workspace_id, onboarding_completed
from public.profiles
where id = auth.uid();

-- Esperado: nenhuma linha do profile de outro usuario.
select id
from public.profiles
where id = 'OTHER_USER_UUID'::uuid;

-- Esperado: apenas workspaces com membership ativa do usuario.
select id, name, workspace_type, owner_user_id
from public.workspaces
order by created_at;

-- Esperado: memberships dos workspaces aos quais o usuario pertence.
select workspace_id, user_id, role, status
from public.workspace_members
order by workspace_id, created_at;

-- Esperado: somente assinaturas dos workspaces permitidos, possivelmente zero.
select id, workspace_id, plan_id, status
from public.subscriptions
order by created_at;

-- Esperado: os planos ativos do catalogo.
select id, name, active
from public.plans
where active = true
order by id;

rollback;

-- A leitura de site_leads deve ser testada em um bloco separado, pois o erro
-- esperado pode abortar a transacao atual do SQL Editor.

begin;
select set_config(
  'request.jwt.claim.sub',
  'USER_WITH_MEMBERSHIP_UUID',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

-- Esperado: permission denied. Retornar linhas e uma falha critica de RLS/grant.
select id
from public.site_leads
limit 1;

-- Se a consulta anterior gerar erro, execute `rollback;` separadamente caso o
-- SQL Editor mantenha a sessao em estado de transacao abortada.
rollback;

-- ============================================================================
-- BLOCO 3 - USUARIO AUTENTICADO SEM MEMBERSHIP
-- ============================================================================

begin;

select set_config(
  'request.jwt.claim.sub',
  'USER_WITHOUT_MEMBERSHIP_UUID',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

-- Esperado: o proprio profile, caso o trigger de Auth ja tenha rodado.
select id
from public.profiles
where id = auth.uid();

-- Esperado: zero workspaces, memberships e subscriptions.
select id
from public.workspaces;

select id, workspace_id, role, status
from public.workspace_members;

select id, workspace_id, plan_id, status
from public.subscriptions;

-- Esperado: planos ativos continuam legiveis.
select id, name
from public.plans
where active = true
order by id;

rollback;

-- ============================================================================
-- BLOCO 4 - LEITURA PUBLICA (ANON)
-- ============================================================================

begin;
select set_config('request.jwt.claim.role', 'anon', true);
set local role anon;

-- Esperado: planos ativos.
select id, name, active
from public.plans
where active = true
order by id;

rollback;

-- Teste uma tabela privada separadamente. Esperado: permission denied porque
-- anon nao recebeu SELECT. Repita isoladamente para workspaces,
-- workspace_members e subscriptions se precisar diagnosticar grants.
begin;
select set_config('request.jwt.claim.role', 'anon', true);
set local role anon;

select id
from public.profiles
limit 1;

-- Se houver erro esperado, execute `rollback;` separadamente se necessario.
rollback;

-- Teste site_leads separadamente. Esperado: permission denied.
begin;
select set_config('request.jwt.claim.role', 'anon', true);
set local role anon;

select id
from public.site_leads
limit 1;

-- Se houver erro esperado, execute `rollback;` separadamente se necessario.
rollback;

-- ============================================================================
-- BLOCO 5 - LIMPEZA DOS DADOS DE TESTE
-- ============================================================================

-- Este roteiro nao apaga dados automaticamente.
--
-- O script Node tenta uma escrita em subscriptions que deve ser bloqueada. Se
-- a escrita for aceita por engano, ele informa o UUID gerado e encerra com
-- exit code 1. Localize esse registro pela consulta abaixo, revise a falha e
-- remova-o manualmente no UniFlow DEV usando um procedimento administrativo.
-- Nunca execute limpeza no projeto de producao.

select id, workspace_id, plan_id, status, created_at
from public.subscriptions
where id = 'UNEXPECTED_SUBSCRIPTION_ID_HERE'::uuid;

-- Confirme ao final que os dados funcionais usados pelo teste continuam validos.
select workspace_id, user_id, role, status
from public.workspace_members
where user_id = 'USER_WITH_MEMBERSHIP_UUID'::uuid;
