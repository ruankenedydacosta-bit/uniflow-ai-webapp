import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// ProjectsPage.jsx
// ============================================================================

// --- consumo de dados -------------------------------------------------------

test('ProjectsPage importa e chama useProjects({ workspaceId })', async () => {
  const page = await source('ProjectsPage.jsx');
  assert.match(page, /import \{ useProjects \} from '\.\.\/hooks\/useProjects\.js';/);
  assert.match(page, /const projectsState = useProjects\(\{ workspaceId \}\);/);
});

test('ProjectsPage importa e usa useClients e useWorkspaceRole do barrel de hooks', async () => {
  const page = await source('ProjectsPage.jsx');
  assert.match(page, /import \{ useClients, useWorkspaceRole \} from '\.\.\/hooks';/);
  assert.match(page, /const clientsState = useClients\(\{ workspaceId \}\);/);
  assert.match(page, /const workspaceRole = useWorkspaceRole\(\{/);
});

test('ProjectsPage nao importa mais projects.mock.js', async () => {
  const page = await source('ProjectsPage.jsx');
  assert.doesNotMatch(page, /projects\.mock/);
});

test('ProjectsPage nao contem array de dados estaticos substituindo o service (sem "const projects = ...Mock")', async () => {
  const page = await source('ProjectsPage.jsx');
  assert.doesNotMatch(page, /projectsMock/);
});

// --- gate de contexto empresarial --------------------------------------------

test('isBusinessWorkspace deriva de access.currentWorkspace === WORKSPACE_TYPES.BUSINESS', async () => {
  const page = await source('ProjectsPage.jsx');
  assert.match(page, /const isBusinessWorkspace = access\.currentWorkspace === WORKSPACE_TYPES\.BUSINESS;/);
});

test('early return fora do contexto empresarial acontece ANTES de qualquer handler mutavel ser alcancavel (apos os hooks, antes do JSX de conteudo real)', async () => {
  const page = await source('ProjectsPage.jsx');
  const earlyReturnIndex = page.indexOf('if (!isBusinessWorkspace) {');
  const hooksIndex = page.indexOf('const projectsState = useProjects');
  const contentJsxIndex = page.indexOf('let content;');
  assert.ok(earlyReturnIndex > hooksIndex, 'hooks devem ser chamados antes do early return (regra dos hooks)');
  assert.ok(earlyReturnIndex < contentJsxIndex, 'early return deve vir antes do JSX de conteudo real');
});

test('canManage/canDelete exigem isBusinessWorkspace -- handlers mutaveis ficam bloqueados fora do contexto empresarial mesmo que alcancados', async () => {
  const page = await source('ProjectsPage.jsx');
  assert.match(page, /const canManage =\s*\n\s*isBusinessWorkspace &&/);
  assert.match(page, /const canDelete =\s*\n\s*isBusinessWorkspace &&/);
});

// --- gate de papel ------------------------------------------------------------

test('canManage depende de canUpdate, !isLoading e !isAnyProjectMutating (owner/admin/member)', async () => {
  const page = await source('ProjectsPage.jsx');
  assert.match(
    page,
    /const canManage =\s*\n\s*isBusinessWorkspace &&\s*\n\s*Boolean\(workspaceId\) &&\s*\n\s*workspaceRole\.canUpdate === true &&\s*\n\s*!workspaceRole\.isLoading &&\s*\n\s*!isAnyProjectMutating;/,
  );
});

test('canDelete depende de canDelete do papel (owner/admin apenas), nao de canUpdate', async () => {
  const page = await source('ProjectsPage.jsx');
  assert.match(
    page,
    /const canDelete =\s*\n\s*isBusinessWorkspace &&\s*\n\s*Boolean\(workspaceId\) &&\s*\n\s*workspaceRole\.canDelete === true &&\s*\n\s*!workspaceRole\.isLoading &&\s*\n\s*!isAnyProjectMutating;/,
  );
});

test('canDelete e canManage sao expressoes distintas (canDelete nao reaproveita canUpdate)', async () => {
  const page = await source('ProjectsPage.jsx');
  assert.doesNotMatch(page, /const canDelete = canManage/);
});

test('isAnyProjectMutating deriva de projectsState.isMutating', async () => {
  const page = await source('ProjectsPage.jsx');
  assert.match(page, /const isAnyProjectMutating = projectsState\.isMutating;/);
});

test('handleCreate/handleEdit tem guarda defensiva com canManage', async () => {
  const page = await source('ProjectsPage.jsx');
  assert.match(page, /function handleCreate\(\) \{\s*\n\s*if \(!canManage\) return;/);
  assert.match(page, /function handleEdit\(project\) \{\s*\n\s*if \(!canManage\) return;/);
});

test('handleSave tem guarda defensiva com canManage', async () => {
  const page = await source('ProjectsPage.jsx');
  assert.match(page, /async function handleSave\(payload\) \{\s*\n\s*if \(!canManage\) return/);
});

test('handleDeleteRequest/handleDeleteConfirm tem guarda defensiva com canDelete', async () => {
  const page = await source('ProjectsPage.jsx');
  assert.match(page, /function handleDeleteRequest\(project\) \{\s*\n\s*if \(!canDelete\) return;/);
  assert.match(page, /async function handleDeleteConfirm\(\) \{\s*\n\s*if \(!canDelete \|\| !deletingProject\) return;/);
});

test('botoes de criar/editar/excluir usam disabled + title (nao dependem so do disabled)', async () => {
  const page = await source('ProjectsPage.jsx');
  assert.match(page, /disabled=\{!canManage\}\s*\n?\s*title=\{getManageTitle\(\)\}/);
  assert.match(page, /disabled=\{!canDelete\}\s*\n?\s*title=\{getDeleteTitle\(\)\}/);
});

test('getManageTitle/getDeleteTitle consideram role loading e mutacao em andamento', async () => {
  const page = await source('ProjectsPage.jsx');
  assert.match(page, /function getManageTitle\(\) \{[\s\S]*?workspaceRole\.isLoading[\s\S]*?isAnyProjectMutating/);
  assert.match(page, /function getDeleteTitle\(\) \{[\s\S]*?workspaceRole\.isLoading[\s\S]*?isAnyProjectMutating/);
});

// --- estados: loading/erro/vazio -----------------------------------------------

test('loading combina projectsState.isLoading e clientsState.isLoading, renderiza skeleton', async () => {
  const page = await source('ProjectsPage.jsx');
  assert.match(page, /const isLoading = projectsState\.isLoading \|\| clientsState\.isLoading;/);
  assert.match(page, /styles\.skeletonCard/);
});

test('erro combina mensagens de projectsState e clientsState, com botao de retry chamando refresh dos dois', async () => {
  const page = await source('ProjectsPage.jsx');
  assert.match(page, /const hasError = Boolean\(projectsErrorMessage \|\| clientsErrorMessage\);/);
  assert.match(
    page,
    /async function handleRetry\(\) \{\s*\n\s*await Promise\.all\(\[projectsState\.refresh\(\), clientsState\.refresh\(\)\]\);/,
  );
});

test('estado vazio distingue "sem projetos no workspace" de "filtros sem resultado"', async () => {
  const page = await source('ProjectsPage.jsx');
  assert.match(page, /const hasNoProjectsAtAll =/);
  assert.match(page, /const hasNoFilterResults =/);
  assert.match(page, /Nenhum projeto cadastrado neste espaço ainda\./);
  assert.match(page, /Nenhum projeto encontrado para os filtros selecionados\./);
});

test('CTA "Criar primeiro projeto" e gated por canManage', async () => {
  const page = await source('ProjectsPage.jsx');
  const block = page.slice(page.indexOf('Nenhum projeto cadastrado'), page.indexOf('hasNoFilterResults ?'));
  assert.match(block, /disabled=\{!canManage\}/);
});

test('handleCloseForm/handleCloseDelete chamam clearError e sao bloqueados durante mutacao', async () => {
  const page = await source('ProjectsPage.jsx');
  assert.match(
    page,
    /function handleCloseForm\(\) \{\s*\n\s*if \(isAnyProjectMutating\) return;\s*\n\s*setIsFormOpen\(false\);\s*\n\s*setEditingProject\(null\);\s*\n\s*projectsState\.clearError\(\);/,
  );
  assert.match(
    page,
    /function handleCloseDelete\(\) \{\s*\n\s*if \(isAnyProjectMutating\) return;\s*\n\s*setDeletingProject\(null\);\s*\n\s*projectsState\.clearError\(\);/,
  );
});

// --- filtros ---------------------------------------------------------------------

test('filtro de busca cobre nome do projeto e nome do cliente resolvido', async () => {
  const page = await source('ProjectsPage.jsx');
  assert.match(
    page,
    /const haystack = normalizeSearchTerm\(`\$\{project\.name\} \$\{clientName\}`\);/,
  );
});

test('filtros de status e prioridade sao aplicados junto da busca', async () => {
  const page = await source('ProjectsPage.jsx');
  assert.match(page, /if \(statusFilter !== 'all' && project\.status !== statusFilter\) return false;/);
  assert.match(page, /if \(priorityFilter !== 'all' && project\.priority !== priorityFilter\) return false;/);
});

test('filtros usam useMemo (processamento local, sem nova chamada ao service)', async () => {
  const page = await source('ProjectsPage.jsx');
  assert.match(page, /const filteredProjects = useMemo\(\(\) => \{/);
  assert.doesNotMatch(page, /useProjects\(\{[^}]*search/);
});

test('busca nunca e enviada como filtro ao hook useProjects (useProjects so recebe workspaceId)', async () => {
  const page = await source('ProjectsPage.jsx');
  assert.match(page, /useProjects\(\{ workspaceId \}\)/);
});

// --- cards -----------------------------------------------------------------------

test('card exibe nome, cliente resolvido, status, prioridade, progresso, datas, impacto e proximo marco', async () => {
  const page = await source('ProjectsPage.jsx');
  assert.match(page, /\{project\.name\}/);
  assert.match(page, /client \? client\.name : 'Sem cliente vinculado'/);
  assert.match(page, /PROJECT_STATUS_LABELS\[project\.status\]/);
  assert.match(page, /PROJECT_PRIORITY_LABELS\[project\.priority\]/);
  assert.match(page, /\{project\.progress\}%/);
  assert.match(page, /formatProjectDate\(project\.starts_at\)/);
  assert.match(page, /formatProjectDate\(project\.due_at\)/);
  assert.match(page, /formatCurrency\(project\.financial_impact\)/);
  assert.match(page, /\{project\.next_milestone\}/);
});

test('descricao so aparece quando presente (renderizacao condicional)', async () => {
  const page = await source('ProjectsPage.jsx');
  assert.match(page, /\{project\.description \? <p className=\{styles\.projectDescription\}>\{project\.description\}<\/p> : null\}/);
});

test('acoes Editar/Excluir existem por card, gated individualmente', async () => {
  const page = await source('ProjectsPage.jsx');
  assert.match(page, /onClick=\{\(\) => handleEdit\(project\)\}/);
  assert.match(page, /onClick=\{\(\) => handleDeleteRequest\(project\)\}/);
});

// --- mutacoes --------------------------------------------------------------------

test('criacao chama saveProject(payload); edicao chama saveProject(payload, editingProject.id)', async () => {
  const page = await source('ProjectsPage.jsx');
  assert.match(
    page,
    /const result = editingProject\s*\n\s*\? await projectsState\.saveProject\(payload, editingProject\.id\)\s*\n\s*: await projectsState\.saveProject\(payload\);/,
  );
});

test('exclusao chama removeProject(deletingProject.id)', async () => {
  const page = await source('ProjectsPage.jsx');
  assert.match(page, /await projectsState\.removeProject\(deletingProject\.id\);/);
});

test('pagina NAO chama refresh manual apos mutacao bem-sucedida (o hook ja recarrega internamente)', async () => {
  const page = await source('ProjectsPage.jsx');
  const saveBlock = page.slice(page.indexOf('async function handleSave'), page.indexOf('function handleDeleteRequest'));
  const deleteBlock = page.slice(page.indexOf('async function handleDeleteConfirm'), page.lastIndexOf('if (!isBusinessWorkspace)'));
  assert.doesNotMatch(saveBlock, /projectsState\.refresh\(\)/);
  assert.doesNotMatch(deleteBlock, /projectsState\.refresh\(\)/);
});

test('modal de formulario so fecha apos sucesso (result sem error)', async () => {
  const page = await source('ProjectsPage.jsx');
  assert.match(
    page,
    /if \(result && !result\.error\) \{\s*\n\s*setIsFormOpen\(false\);\s*\n\s*setEditingProject\(null\);\s*\n\s*\}/,
  );
});

test('modal de exclusao so fecha apos sucesso (result sem error)', async () => {
  const page = await source('ProjectsPage.jsx');
  assert.match(
    page,
    /if \(result && !result\.error\) \{\s*\n\s*setDeletingProject\(null\);\s*\n\s*\}/,
  );
});

test('em caso de erro, handleSave/handleDeleteConfirm retornam o result sem fechar o modal (erro fica visivel via prop error do modal)', async () => {
  const page = await source('ProjectsPage.jsx');
  assert.match(page, /error=\{projectsState\.error\}/);
});

// --- datas e moeda -----------------------------------------------------------------

test('datas usam formatProjectDate, nunca new Date(project.starts_at)/new Date(project.due_at) diretamente', async () => {
  const page = await source('ProjectsPage.jsx');
  assert.doesNotMatch(page, /new Date\(project\.starts_at\)/);
  assert.doesNotMatch(page, /new Date\(project\.due_at\)/);
  assert.match(page, /formatProjectDate\(project\.starts_at\)/);
  assert.match(page, /formatProjectDate\(project\.due_at\)/);
});

test('impacto financeiro usa formatCurrency e trata null/undefined com travessao', async () => {
  const page = await source('ProjectsPage.jsx');
  assert.match(
    page,
    /project\.financial_impact !== null && project\.financial_impact !== undefined\s*\n\s*\? formatCurrency\(project\.financial_impact\)\s*\n\s*: '—'/,
  );
});

// --- escopo ------------------------------------------------------------------------

test('nao ha Kanban/Calendario/Timeline/tarefas na pagina', async () => {
  const page = await source('ProjectsPage.jsx');
  assert.doesNotMatch(page, /[Kk]anban|[Cc]alendar|[Tt]imeline|[Tt]ask/);
});

test('nao importa nenhum pacote novo (somente React, app/*, components/ui, hooks, utils, projetos locais)', async () => {
  const page = await source('ProjectsPage.jsx');
  const importBlock = page.slice(0, page.indexOf('const STATUS_FILTERS'));
  const fromClauses = importBlock.match(/from '([^']+)';/g) ?? [];
  assert.ok(fromClauses.length > 0);
  for (const clause of fromClauses) {
    assert.match(
      clause,
      /from '(react|\.\.\/app\/|\.\.\/components\/ui|\.\.\/hooks|\.\.\/utils\/|\.\/projetos\/|\.\/ProjectsPage\.module\.css)/,
    );
  }
});

test('nao importa routes.jsx, navigation.js, moduleAccess.js nem shellRoutes.js', async () => {
  const page = await source('ProjectsPage.jsx');
  assert.doesNotMatch(page, /routes\.jsx|navigation\.js|moduleAccess|shellRoutes/);
});

// ============================================================================
// src/services/projectsService.js
// ============================================================================

test('service exporta as 5 funcoes publicas aprovadas', async () => {
  const service = await source('../services/projectsService.js');
  assert.match(service, /export async function listProjects\(/);
  assert.match(service, /export async function getProject\(/);
  assert.match(service, /export async function createProject\(/);
  assert.match(service, /export async function updateProject\(/);
  assert.match(service, /export async function deleteProject\(/);
});

test('service tem whitelist de campos mutaveis, sem campos imutaveis', async () => {
  const service = await source('../services/projectsService.js');
  assert.match(service, /const MUTABLE_PROJECT_FIELDS = \[/);
  const listBlock = service.slice(
    service.indexOf('const MUTABLE_PROJECT_FIELDS'),
    service.indexOf('];', service.indexOf('const MUTABLE_PROJECT_FIELDS')),
  );
  for (const forbidden of ['id', 'workspace_id', 'created_by', 'created_at', 'updated_at']) {
    assert.doesNotMatch(listBlock, new RegExp(`'${forbidden}'`));
  }
});

test('updateProject usa pickDefined com MUTABLE_PROJECT_FIELDS -- nunca aceita campos imutaveis no update', async () => {
  const service = await source('../services/projectsService.js');
  assert.match(service, /const payload = pickDefined\(changes, MUTABLE_PROJECT_FIELDS\);/);
});

test('service valida workspaceId/projectId como UUID em todas as funcoes', async () => {
  const service = await source('../services/projectsService.js');
  const occurrences = service.match(/isValidUuid\(/g) ?? [];
  assert.ok(occurrences.length >= 5, `esperado >=5 validacoes de UUID, encontrado ${occurrences.length}`);
});

test('createProject valida nome obrigatorio', async () => {
  const service = await source('../services/projectsService.js');
  assert.match(service, /if \(typeof project\.name !== 'string' \|\| !project\.name\.trim\(\)\) \{/);
});

test('service valida progresso como numero finito entre 0 e 100 (nunca coage silenciosamente com Number())', async () => {
  const service = await source('../services/projectsService.js');
  assert.match(service, /typeof payload\.progress !== 'number' \|\| !Number\.isFinite\(payload\.progress\)/);
  assert.match(service, /payload\.progress < 0 \|\| payload\.progress > 100/);
});

test('service valida impacto financeiro como numero finito nao-negativo quando presente', async () => {
  const service = await source('../services/projectsService.js');
  assert.match(service, /payload\.financial_impact < 0/);
  assert.match(service, /typeof payload\.financial_impact !== 'number' \|\| !Number\.isFinite\(payload\.financial_impact\)/);
});

test('service valida due_at >= starts_at quando ambos presentes', async () => {
  const service = await source('../services/projectsService.js');
  assert.match(service, /payload\.starts_at &&\s*\n\s*payload\.due_at &&\s*\n\s*payload\.due_at < payload\.starts_at/);
});

test('listProjects filtra sempre por workspace_id e ordena por created_at desc', async () => {
  const service = await source('../services/projectsService.js');
  assert.match(service, /\.eq\('workspace_id', workspaceId\)\s*\n\s*\.order\('created_at', \{ ascending: false \}\);/);
});

test('listProjects suporta os 4 filtros aprovados (status, priority, clientId, assignedUserId)', async () => {
  const service = await source('../services/projectsService.js');
  assert.match(service, /\{ status, priority, clientId, assignedUserId \} = \{\}/);
  assert.match(service, /query = query\.eq\('status', status\);/);
  assert.match(service, /query = query\.eq\('priority', priority\);/);
  assert.match(service, /query = query\.eq\('client_id', clientId\);/);
  assert.match(service, /query = query\.eq\('assigned_user_id', assignedUserId\);/);
});

test('service nunca faz join com clients/workspace_members (PROJECT_FIELDS e uma lista plana de colunas)', async () => {
  const service = await source('../services/projectsService.js');
  assert.doesNotMatch(service, /clients\s*\(/);
  assert.doesNotMatch(service, /workspace_members\s*\(/);
});

test('todas as funcoes publicas retornam { data, error, isConfigured } via createResult', async () => {
  const service = await source('../services/projectsService.js');
  assert.match(service, /function createResult\(data, error = null\) \{\s*\n\s*return \{\s*\n\s*data,\s*\n\s*error,\s*\n\s*isConfigured: isSupabaseConfigured,\s*\n\s*\};/);
});

// ============================================================================
// src/hooks/useProjects.js
// ============================================================================

test('hook usa requestIdRef, isMountedRef e mutationRef (mesmo mecanismo de useAgenda.js)', async () => {
  const hook = await source('../hooks/useProjects.js');
  assert.match(hook, /const requestIdRef = useRef\(0\);/);
  assert.match(hook, /const isMountedRef = useRef\(true\);/);
  assert.match(hook, /const mutationRef = useRef\(false\);/);
});

test('mutationRef bloqueia mutacao concorrente com erro PROJECT_MUTATION_IN_PROGRESS', async () => {
  const hook = await source('../hooks/useProjects.js');
  assert.match(hook, /if \(mutationRef\.current\) \{/);
  assert.match(hook, /code: 'PROJECT_MUTATION_IN_PROGRESS'/);
});

test('refresh limpa a lista de projetos quando nao ha workspaceId (nunca mantem dados de outro workspace)', async () => {
  const hook = await source('../hooks/useProjects.js');
  assert.match(hook, /if \(!workspaceId\) \{\s*\n\s*setProjects\(\[\]\);/);
});

test('mutacao bem-sucedida chama await refresh() ANTES de liberar a trava (finally libera depois)', async () => {
  const hook = await source('../hooks/useProjects.js');
  assert.match(
    hook,
    /if \(result && !result\.error && result\.data\) \{\s*\n\s*await refresh\(\);\s*\n\s*\} else if \(result\?\.error && isMountedRef\.current\) \{/,
  );
  const performMutationBlock = hook.slice(
    hook.indexOf('const performMutation'),
    hook.indexOf('const saveProject'),
  );
  const refreshIndex = performMutationBlock.indexOf('await refresh();');
  const finallyIndex = performMutationBlock.indexOf('} finally {');
  assert.ok(refreshIndex > 0 && refreshIndex < finallyIndex, 'refresh() deve acontecer dentro do try, antes do finally que libera a trava');
});

test('hook exporta exatamente a API aprovada', async () => {
  const hook = await source('../hooks/useProjects.js');
  assert.match(
    hook,
    /return \{\s*\n\s*projects,\s*\n\s*isLoading,\s*\n\s*isMutating,\s*\n\s*error,\s*\n\s*isConfigured: isSupabaseConfigured,\s*\n\s*refresh,\s*\n\s*saveProject,\s*\n\s*removeProject,\s*\n\s*clearError,\s*\n\s*\};/,
  );
});

test('hook nao atualiza estado apos unmount (isMountedRef checado antes de cada setState relevante)', async () => {
  const hook = await source('../hooks/useProjects.js');
  assert.match(hook, /if \(requestId !== requestIdRef\.current \|\| !isMountedRef\.current\) \{\s*\n\s*return null;/);
  assert.match(hook, /if \(isMountedRef\.current\) \{\s*\n\s*setError\(null\);\s*\n\s*setIsMutating\(true\);/);
  assert.match(hook, /if \(isMountedRef\.current\) setIsMutating\(false\);/);
});

test('useProjects e exportado em hooks/index.js', async () => {
  const indexSource = await source('../hooks/index.js');
  assert.match(indexSource, /export \{ useProjects \} from '\.\/useProjects\.js';/);
});

// ============================================================================
// supabase/migrations/20260723_018_projects.sql
// ============================================================================

test('migration cria a tabela public.projects', async () => {
  const migration = await source('../../supabase/migrations/20260723_018_projects.sql');
  assert.match(migration, /create table public\.projects \(/);
});

test('migration contem as 16 colunas aprovadas', async () => {
  const migration = await source('../../supabase/migrations/20260723_018_projects.sql');
  const columns = [
    'id', 'workspace_id', 'name', 'description', 'status', 'priority', 'progress',
    'starts_at', 'due_at', 'client_id', 'assigned_user_id', 'financial_impact',
    'next_milestone', 'created_by', 'created_at', 'updated_at',
  ];
  const tableBlock = migration.slice(
    migration.indexOf('create table public.projects ('),
    migration.indexOf('\n);', migration.indexOf('create table public.projects (')),
  );
  for (const column of columns) {
    assert.match(tableBlock, new RegExp(`\\b${column}\\b`), `coluna ${column} ausente`);
  }
});

test('migration habilita RLS e cria exatamente 4 politicas', async () => {
  const migration = await source('../../supabase/migrations/20260723_018_projects.sql');
  assert.match(migration, /alter table public\.projects enable row level security;/);
  const policies = migration.match(/create policy projects_\w+/g) ?? [];
  assert.equal(policies.length, 4);
  assert.match(migration, /create policy projects_select_active_member/);
  assert.match(migration, /create policy projects_insert_active_contributor/);
  assert.match(migration, /create policy projects_update_active_contributor/);
  assert.match(migration, /create policy projects_delete_owner_or_admin/);
});

test('migration cria 4 grupos de trigger (updated_at, imutabilidade, responsavel, cliente)', async () => {
  const migration = await source('../../supabase/migrations/20260723_018_projects.sql');
  assert.match(migration, /create trigger projects_set_updated_at/);
  assert.match(migration, /create trigger projects_prevent_immutable_field_change/);
  assert.match(migration, /create trigger projects_validate_assigned_user/);
  assert.match(migration, /create trigger projects_validate_client/);
});

test('trigger de responsavel valida membro ativo do mesmo workspace', async () => {
  const migration = await source('../../supabase/migrations/20260723_018_projects.sql');
  assert.match(
    migration,
    /if new\.assigned_user_id is not null and not exists \(\s*\n\s*select 1\s*\n\s*from public\.workspace_members\s*\n\s*where workspace_id = new\.workspace_id\s*\n\s*and user_id = new\.assigned_user_id\s*\n\s*and status = 'active'/,
  );
});

test('trigger de cliente valida que o cliente existe e pertence ao mesmo workspace', async () => {
  const migration = await source('../../supabase/migrations/20260723_018_projects.sql');
  assert.match(migration, /if v_client_workspace_id is distinct from new\.workspace_id then/);
  assert.match(migration, /if not found then/);
});

test('trigger de imutabilidade bloqueia mudanca de workspace_id e created_by', async () => {
  const migration = await source('../../supabase/migrations/20260723_018_projects.sql');
  assert.match(migration, /if new\.workspace_id is distinct from old\.workspace_id then/);
  assert.match(migration, /if new\.created_by is distinct from old\.created_by then/);
});

test('constraint garante progresso entre 0 e 100', async () => {
  const migration = await source('../../supabase/migrations/20260723_018_projects.sql');
  assert.match(migration, /constraint projects_progress_check check \(progress between 0 and 100\)/);
});

test('constraint garante prazo nao anterior a data de inicio', async () => {
  const migration = await source('../../supabase/migrations/20260723_018_projects.sql');
  assert.match(
    migration,
    /constraint projects_due_at_check check \(\s*\n\s*due_at is null or starts_at is null or due_at >= starts_at\s*\n\s*\)/,
  );
});

test('constraint garante impacto financeiro nao-negativo quando presente', async () => {
  const migration = await source('../../supabase/migrations/20260723_018_projects.sql');
  assert.match(
    migration,
    /constraint projects_financial_impact_check check \(\s*\n\s*financial_impact is null or financial_impact >= 0\s*\n\s*\)/,
  );
});

test('migration nao contem nenhum artefato de tarefas/Kanban/Calendario/Timeline (as menções existem apenas em texto de documentação registrando a exclusão de escopo, nunca em nomes de objetos criados)', async () => {
  const migration = await source('../../supabase/migrations/20260723_018_projects.sql');
  assert.doesNotMatch(migration, /create table public\.(tasks|project_tasks|project_milestones|project_comments|project_attachments)/);
  // Confirma que a menção existe apenas como documentação da exclusão de escopo.
  assert.match(migration, /Kanban, Calendario, Timeline, comentarios, anexos e integracoes externas/);
  // Nenhum identificador de objeto criado (create table/index/trigger/function/policy) referencia esses termos.
  const createdIdentifiers = migration.match(/create (?:table|index|trigger|function|or replace function|policy) [^\s(]+/gi) ?? [];
  assert.ok(createdIdentifiers.length > 0);
  for (const identifier of createdIdentifiers) {
    assert.doesNotMatch(identifier, /[Kk]anban|[Cc]alendar|[Tt]imeline|[Tt]ask/);
  }
});
