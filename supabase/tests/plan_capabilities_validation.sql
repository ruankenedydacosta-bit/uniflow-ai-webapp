-- Validacao do catalogo e do gating por plano (issue #55).
-- Ambiente permitido: banco Supabase descartavel/local ou UniFlow DEV somente
-- para leitura. Nunca execute migrations ou fixtures no projeto de producao.
--
-- Estrutura e seed podem ser inspecionados como postgres. O comportamento deve
-- ser validado como authenticated; postgres ignora RLS. Os blocos de usuario
-- abaixo sao somente leitura e exigem UUIDs de fixtures autorizadas.

-- A. Catalogo canonico: exatamente a matriz existente antes da migration.
select plan_id, capability_id
from public.plan_capabilities
order by plan_id, capability_id;
-- Esperado: pro/reports; business/reports; business/business_features;
-- enterprise/reports; enterprise/business_features. Nenhuma linha para free.

-- B. Definicao e policies instaladas. Esta consulta estrutural nao valida RLS.
select tablename, policyname, permissive, roles, cmd
from pg_policies
where schemaname = 'public'
  and (
    tablename = 'plan_capabilities'
    or policyname in (
      'clients_require_business_plan',
      'crm_pipeline_stages_require_business_plan',
      'crm_opportunities_require_business_plan',
      'projects_require_business_plan'
    )
  )
order by tablename, policyname;

select pg_get_functiondef('public.workspace_has_plan_capability(uuid,text)'::regprocedure);

-- C. Troque por UUID de um usuario authenticated com workspace pessoal Pro e
-- workspace empresarial sem assinatura Business. Execute somente em transacao.
begin;
select set_config('request.jwt.claim.sub', 'AUTHENTICATED_USER_UUID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

-- Esperado para workspace pessoal Pro: reports=true e business_features=false.
select public.workspace_has_plan_capability('PERSONAL_PRO_WORKSPACE_UUID'::uuid, 'reports');
select public.workspace_has_plan_capability('PERSONAL_PRO_WORKSPACE_UUID'::uuid, 'business_features');

-- Esperado para workspace Business sem plano Business/Enterprise:
-- business_features=false e clients/crm/projects sem linhas visiveis.
select public.workspace_has_plan_capability('BUSINESS_FREE_WORKSPACE_UUID'::uuid, 'business_features');
select id from public.clients where workspace_id = 'BUSINESS_FREE_WORKSPACE_UUID'::uuid;
select id from public.crm_pipeline_stages where workspace_id = 'BUSINESS_FREE_WORKSPACE_UUID'::uuid;
select id from public.crm_opportunities where workspace_id = 'BUSINESS_FREE_WORKSPACE_UUID'::uuid;
select id from public.projects where workspace_id = 'BUSINESS_FREE_WORKSPACE_UUID'::uuid;

-- Esperado para Business/Enterprise: business_features=true e as linhas ficam
-- visiveis conforme as policies permissivas de membership/papel ja existentes.
select public.workspace_has_plan_capability('BUSINESS_PAID_WORKSPACE_UUID'::uuid, 'business_features');

-- Uma assinatura canceled mantem capacidade ate current_period_ends_at; depois
-- disso a funcao retorna false. Use fixtures preexistentes, sem editar dados.
rollback;
