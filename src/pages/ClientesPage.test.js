import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('./', import.meta.url);
const source = (path) => readFile(new URL(path, ROOT), 'utf8');

test('ClientesPage usa dados reais (useClients/useSession), sem mock', async () => {
  const contents = await source('ClientesPage.jsx');
  assert.match(contents, /useClients/);
  assert.match(contents, /useSession/);
  assert.match(contents, /workspace\?\.id/);
  assert.doesNotMatch(contents, /clientsMock/);
  assert.doesNotMatch(contents, /clients\.mock\.js/);
});

test('ClientesPage trata loading, erro e lista vazia explicitamente', async () => {
  const contents = await source('ClientesPage.jsx');
  assert.match(contents, /isLoading/);
  assert.match(contents, /error/);
  assert.match(contents, /visibleClients\.length/);
});

test('ClientesPage alterna entre visualização de clientes ativos e arquivados', async () => {
  const contents = await source('ClientesPage.jsx');
  assert.match(contents, /const \[view, setView\] = useState\('active'\)/);
  assert.match(contents, /Ativos/);
  assert.match(contents, /Arquivados/);
  assert.match(contents, /visibleClients = view === 'active' \? activeClients : archivedClients/);
});

test('ClientesPage deriva archivedClients localmente (is_archived === true), sem alterar useClients.js', async () => {
  const contents = await source('ClientesPage.jsx');
  assert.match(contents, /is_archived === true/);
  assert.match(contents, /useMemo/);
  const hook = await readFile(new URL('../hooks/useClients.js', ROOT), 'utf8');
  assert.doesNotMatch(hook, /is_archived === true/);
});

test('ClientesPage nao expoe assigned_user_id (recurso Enterprise ainda sem UI aprovada)', async () => {
  const contents = await source('ClientesPage.jsx');
  assert.doesNotMatch(contents, /assigned_user_id/);
  assert.doesNotMatch(contents, /PLANS\.ENTERPRISE/);
});

test('botão "Novo cliente" está conectado à abertura do modal de criação', async () => {
  const contents = await source('ClientesPage.jsx');
  assert.match(contents, /Novo cliente/);
  assert.match(contents, /onClick=\{handleOpenCreate\}/);
  assert.match(contents, /function handleOpenCreate/);
});

// --- Subfase 9.2: gate de permissao do botao "Novo cliente" (paridade com CRM) -----

test('canOpenCreate usa workspaceRole.canUpdate, isLoading e isBusy -- mesmo padrao de canOpenCreate/canManageOpportunity em CRMPage.jsx', async () => {
  const contents = await source('ClientesPage.jsx');
  assert.match(
    contents,
    /const canOpenCreate = workspaceRole\.canUpdate === true && !workspaceRole\.isLoading && !isBusy;/,
  );
});

test('botão "Novo cliente" fica desabilitado (disabled={!canOpenCreate}) com title explicando o motivo do bloqueio', async () => {
  const contents = await source('ClientesPage.jsx');
  assert.match(
    contents,
    /<Button disabled=\{!canOpenCreate\} title=\{getCreateButtonTitle\(\)\} onClick=\{handleOpenCreate\}>\s*\n\s*Novo cliente/,
  );
  assert.match(contents, /Você não possui permissão para criar clientes\./);
});

test('handleOpenCreate retorna sem efeito quando canOpenCreate é falso -- segunda camada, não depende só do disabled (mesmo padrão de handleOpenEdit)', async () => {
  const contents = await source('ClientesPage.jsx');
  assert.match(
    contents,
    /function handleOpenCreate\(\) \{\s*\n\s*if \(!canOpenCreate\) return;/,
  );
});

test('viewer (canUpdate=false) nunca vê o botão "Novo cliente" habilitado; owner/admin/member (canUpdate=true) conseguem abrir o modal', async () => {
  // Mesma fonte de verdade de workspaceRoleUtils.js: canUpdate so e true
  // para owner/admin/member -- viewer cai em canUpdate=false, logo
  // canOpenCreate=false, logo o botao fica disabled e handleOpenCreate
  // retorna sem abrir o modal (guardas ja verificados nos dois testes acima).
  const roleUtils = await readFile(new URL('../hooks/workspaceRoleUtils.js', ROOT), 'utf8');
  assert.match(roleUtils, /UPDATE_ROLES = Object\.freeze\(\['owner', 'admin', 'member'\]\)/);
});

test('botão "Perguntar à Uni" permanece desabilitado, sem handler, mesmo padrão de CRMPage.jsx', async () => {
  const contents = await source('ClientesPage.jsx');
  assert.match(
    contents,
    /<Button variant="secondary" disabled title="Disponível em breve\.">\s*\n\s*Perguntar à Uni/,
  );
});

test('cada cliente tem uma ação "Editar" que abre o modal pré-preenchido', async () => {
  const contents = await source('ClientesPage.jsx');
  assert.match(contents, /function handleOpenEdit\(client\)/);
  assert.match(contents, /onClick=\{\(\) => handleOpenEdit\(client\)\}/);
  assert.match(contents, /Editar/);
});

test('botão "Editar" fica desabilitado durante isMutating, loading do papel e sem canUpdate', async () => {
  const contents = await source('ClientesPage.jsx');
  assert.match(
    contents,
    /disabled=\{isBusy \|\| workspaceRole\.isLoading \|\| !workspaceRole\.canUpdate\}\s*\n\s*aria-label=\{`Editar/,
  );
});

test('handleOpenEdit não abre o modal quando canUpdate !== true ou há mutação em andamento (segunda camada, não depende só do disabled)', async () => {
  const contents = await source('ClientesPage.jsx');
  assert.match(
    contents,
    /function handleOpenEdit\(client\) \{\s*\n(?:.*\n)*?\s*if \(!workspaceRole\.canUpdate \|\| clientState\.isMutating\) return;/,
  );
});

test('edição habilitada para owner/admin/member e desabilitada para viewer (mesma regra real de canUpdate, já coberta por workspaceRoleUtils.test.js)', async () => {
  const roleUtils = await readFile(new URL('../hooks/workspaceRoleUtils.js', ROOT), 'utf8');
  // A UI de edição depende de workspaceRole.canUpdate; a regra em si (owner/
  // admin/member = true, viewer = false) já é coberta exaustivamente por
  // workspaceRoleUtils.test.js -- aqui confirmamos só que a UI usa a MESMA
  // fonte de verdade, sem reimplementar a regra.
  assert.match(roleUtils, /UPDATE_ROLES = Object\.freeze\(\['owner', 'admin', 'member'\]\)/);
  const contents = await source('ClientesPage.jsx');
  assert.match(contents, /workspaceRole\.canUpdate/);
});

test('erro na consulta de papel deixa canUpdate falso (deriveWorkspaceRole com membership=null), sem lógica extra na página', async () => {
  const roleUtils = await readFile(new URL('../hooks/workspaceRoleUtils.js', ROOT), 'utf8');
  assert.match(roleUtils, /canUpdate: Boolean\(role\) && UPDATE_ROLES\.includes\(role\)/);
});

test('ClientesPage reaproveita ClientFormModal (mesmo componente para criar e editar), sem Modal/form inline', async () => {
  const contents = await source('ClientesPage.jsx');
  assert.match(contents, /import ClientFormModal from '\.\/clientes\/ClientFormModal\.jsx'/);
  assert.match(contents, /<ClientFormModal/);
  assert.doesNotMatch(contents, /<Modal[\s>]/);
  assert.doesNotMatch(contents, /<form[\s>]/);
});

test('arquivamento usa confirmação inline de dois passos, conectado a clientState.archiveClient', async () => {
  const contents = await source('ClientesPage.jsx');
  assert.match(contents, /clientState\.archiveClient\(clientId\)/);
  assert.match(contents, /pendingArchiveId/);
  assert.match(contents, /Confirmar arquivamento/);
  assert.doesNotMatch(contents, /window\.confirm/);
});

test('desarquivamento é conectado a clientState.unarchiveClient, sem confirmação adicional', async () => {
  const contents = await source('ClientesPage.jsx');
  assert.match(contents, /clientState\.unarchiveClient\(clientId\)/);
  assert.match(contents, /function handleUnarchive\(clientId\) \{\n\s*if \(isBusy\) return;/);
});

test('exclusão só aparece na visualização de clientes arquivados, via ClientDeleteConfirmModal', async () => {
  const contents = await source('ClientesPage.jsx');
  assert.match(contents, /import ClientDeleteConfirmModal from '\.\/clientes\/ClientDeleteConfirmModal\.jsx'/);
  assert.match(contents, /<ClientDeleteConfirmModal/);
  assert.doesNotMatch(contents, /window\.confirm/);

  const activeBranchEnd = contents.indexOf("{view === 'active' ? (");
  const archivedBranchStart = contents.indexOf(') : (', activeBranchEnd);
  const activeBranch = contents.slice(activeBranchEnd, archivedBranchStart);
  assert.doesNotMatch(activeBranch, /Excluir/);
});

test('exclusão respeita canDelete (owner/admin) e fica oculta durante o carregamento do papel', async () => {
  const contents = await source('ClientesPage.jsx');
  assert.match(contents, /workspaceRole\.canDelete/);
  assert.match(contents, /!workspaceRole\.isLoading && workspaceRole\.canDelete/);
});

test('ações mutáveis (arquivar/desarquivar) respeitam canUpdate e ficam desabilitadas durante o carregamento do papel', async () => {
  const contents = await source('ClientesPage.jsx');
  assert.match(contents, /workspaceRole\.canUpdate/);
  assert.match(contents, /workspaceRole\.isLoading/);
});

test('ClientesPage nao implementa exclusao em massa nem arquivamento em massa (busca/ordenacao simples sao escopo da 7.5.10)', async () => {
  const contents = await source('ClientesPage.jsx');
  assert.doesNotMatch(contents, /selecionarTodos/i);
  assert.doesNotMatch(contents, /bulk/i);
  assert.doesNotMatch(contents, /pagina[çc][ãa]o|paginacao/i);
});

test('erros de ação (arquivar/desarquivar/papel) usam uma área de feedback dedicada, limpa antes de cada nova ação', async () => {
  const contents = await source('ClientesPage.jsx');
  assert.match(contents, /actionError/);
  assert.match(contents, /roleErrorMessage/);
  assert.match(contents, /setActionError\(null\)/);
});

test('ClientFormModal usa Modal/Input reais do Design System e reutiliza o mesmo formulário para criar e editar', async () => {
  const contents = await source('clientes/ClientFormModal.jsx');
  assert.match(contents, /from '\.\.\/\.\.\/components\/ui\/Modal'/);
  assert.match(contents, /from '\.\.\/\.\.\/components\/ui\/Input'/);
  assert.match(contents, /isEditing = Boolean\(client\)/);
  assert.match(contents, /saveClient/);
});

test('ClientFormModal não expõe assigned_user_id, workspace_id ou created_by', async () => {
  const contents = await source('clientes/ClientFormModal.jsx');
  assert.doesNotMatch(contents, /assigned_user_id/);
  assert.doesNotMatch(contents, /workspace_id/);
  assert.doesNotMatch(contents, /created_by/);
});

test('ClientFormModal bloqueia fechamento e novo submit durante isMutating', async () => {
  const contents = await source('clientes/ClientFormModal.jsx');
  assert.match(contents, /if \(isMutating\) return;/);
  assert.match(contents, /closeOnOverlayClick=\{!isMutating\}/);
  assert.match(contents, /closeOnEsc=\{!isMutating\}/);
});

test('ClientFormModal valida explicitamente antes de chamar saveClient (não depende só de required/min/disabled)', async () => {
  const contents = await source('clientes/ClientFormModal.jsx');
  assert.match(contents, /validateClientForm\(form\)/);
  assert.match(contents, /if \(validationMessage\)/);
});

test('ClientFormModal usa datetime-local (não date) para last_contact_at, com conversão explícita', async () => {
  const contents = await source('clientes/ClientFormModal.jsx');
  assert.match(contents, /type="datetime-local"/);
  assert.doesNotMatch(contents, /type="date"/);
});

test('ClientesPage consulta o papel do usuário via useWorkspaceRole, com owner_user_id e user id reais', async () => {
  const contents = await source('ClientesPage.jsx');
  assert.match(contents, /useWorkspaceRole/);
  assert.match(contents, /ownerUserId: workspace\?\.owner_user_id/);
  assert.match(contents, /userId: user\?\.id/);
});

test('ClientesPage mapeia campos reais do schema (lifecycle_stage, estimated_value, last_contact_at)', async () => {
  const contents = await source('ClientesPage.jsx');
  assert.match(contents, /lifecycle_stage/);
  assert.match(contents, /estimated_value/);
  assert.match(contents, /last_contact_at/);
  assert.match(contents, /getLifecycleStageLabel/);
  assert.match(contents, /getLifecycleStageVariant/);
});

test('clientService e useClients seguem o padrao existente (accountService/useAccounts)', async () => {
  const service = await readFile(new URL('../services/clientService.js', ROOT), 'utf8');
  const hook = await readFile(new URL('../hooks/useClients.js', ROOT), 'utf8');

  assert.match(service, /export async function listClients/);
  assert.match(service, /export async function createClient/);
  assert.match(service, /export async function updateClient/);
  assert.match(service, /export function archiveClient/);
  assert.match(service, /export function unarchiveClient/);
  assert.match(service, /export async function deleteClient/);

  assert.match(hook, /includeArchived: true/);
  assert.match(hook, /activeClients/);
  assert.match(hook, /is_archived === false/);
});

// --- Subfase 9.2: robustez de useClients (mutationRef) -----------------------------

test('useClients preserva a API publica (saveClient/archiveClient/unarchiveClient/removeClient/refresh/clearError) apos o refactor', async () => {
  const hook = await readFile(new URL('../hooks/useClients.js', ROOT), 'utf8');
  assert.match(hook, /archiveClient: archiveClientRecord,/);
  assert.match(hook, /unarchiveClient: unarchiveClientRecord,/);
  assert.match(hook, /removeClient,/);
  assert.match(hook, /saveClient,/);
  assert.match(hook, /refresh,/);
  assert.match(hook, /clearError: \(\) => setError\(null\),/);
});

test('useClients usa mutationRef como trava sincrona -- mesmo padrao de useCrmPipeline.js/useAgenda.js', async () => {
  const hook = await readFile(new URL('../hooks/useClients.js', ROOT), 'utf8');
  assert.match(hook, /const mutationRef = useRef\(false\);/);
});

test('mutacao concorrente e bloqueada: se mutationRef.current for true, performMutation retorna CLIENT_MUTATION_IN_PROGRESS sem chamar mutationFn', async () => {
  const hook = await readFile(new URL('../hooks/useClients.js', ROOT), 'utf8');
  assert.match(
    hook,
    /if \(mutationRef\.current\) \{\s*\n\s*return \{\s*\n\s*data: null,\s*\n\s*error: \{\s*\n\s*code: 'CLIENT_MUTATION_IN_PROGRESS',/,
  );
});

test('a trava e liberada em finally -- tanto apos sucesso quanto apos erro (mutationRef.current = false incondicional)', async () => {
  const hook = await readFile(new URL('../hooks/useClients.js', ROOT), 'utf8');
  assert.match(
    hook,
    /\} finally \{\s*\n\s*mutationRef\.current = false;\s*\n\s*setIsMutating\(false\);\s*\n\s*\}/,
  );
});

test('performMutation centraliza as 4 mutacoes -- nenhuma delas repete setIsMutating\\/setError\\/finally manualmente', async () => {
  const hook = await readFile(new URL('../hooks/useClients.js', ROOT), 'utf8');
  const occurrences = hook.match(/setIsMutating\(true\)/g) ?? [];
  assert.equal(occurrences.length, 1);
});

test('nenhuma mutacao chama refresh() apos sucesso -- comportamento anterior preservado (upsert/remocao local apenas)', async () => {
  const hook = await readFile(new URL('../hooks/useClients.js', ROOT), 'utf8');
  assert.doesNotMatch(hook, /applyLocalUpdate[\s\S]{0,80}refresh\(\)/);
});

test('service clientService.js permanece intocado pelo refactor do hook', async () => {
  const service = await readFile(new URL('../services/clientService.js', ROOT), 'utf8');
  assert.match(service, /export async function listClients/);
  assert.match(service, /export async function createClient/);
  assert.match(service, /export async function updateClient/);
  assert.match(service, /export function archiveClient/);
  assert.match(service, /export function unarchiveClient/);
  assert.match(service, /export async function deleteClient/);
});

// --- Subfase 7.5.10: busca, ordenacao e contadores de Clientes ------------------------

test('1/2. input de busca existe com label acessivel', async () => {
  const contents = await source('ClientesPage.jsx');
  assert.match(contents, /id="clientes-search"/);
  assert.match(contents, /type="search"/);
  assert.match(contents, /label="Buscar clientes"/);
});

test('usa normalizeSearchText de src\\/utils\\/searchText.js, nao importa de Financeiro', async () => {
  const contents = await source('ClientesPage.jsx');
  assert.match(contents, /import \{ normalizeSearchText \} from '\.\.\/utils\/searchText\.js';/);
  assert.doesNotMatch(contents, /financeiro/i);
});

test('3-7. matchesClientSearch cobre nome, contato, e-mail, telefone e documento', async () => {
  const contents = await source('ClientesPage.jsx');
  assert.match(
    contents,
    /\[client\.name, client\.primary_contact_name, client\.email, client\.phone, client\.document_number\]/,
  );
});

test('8/9. busca e case-insensitive e ignora espacos extras (via normalizeSearchText em ambos os lados)', async () => {
  const contents = await source('ClientesPage.jsx');
  assert.match(contents, /normalizeSearchText\(field\)\.includes\(normalizedQuery\)/);
  assert.match(contents, /const normalizedSearchQuery = normalizeSearchText\(searchQuery\);/);
});

test('10/11/12. busca e aplicada depois da separacao ativos\\/arquivados, sem misturar os grupos', async () => {
  const contents = await source('ClientesPage.jsx');
  assert.match(
    contents,
    /const searchedClients = useMemo\(\s*\n\s*\(\) => visibleClients\.filter\(\(client\) => matchesClientSearch\(client, normalizedSearchQuery\)\),\s*\n\s*\[visibleClients, normalizedSearchQuery\],/,
  );
});

test('13/14. busca nao chama refresh nem reload', async () => {
  const contents = await source('ClientesPage.jsx');
  assert.doesNotMatch(contents, /\.refresh\(\)/);
  assert.doesNotMatch(contents, /window\.location|location\.reload/);
});

test('15. estado de busca sem resultado usa mensagem propria, diferente do vazio geral', async () => {
  const contents = await source('ClientesPage.jsx');
  assert.match(contents, /Nenhum cliente encontrado para esta busca\./);
  assert.match(contents, /Nenhum cliente ativo cadastrado ainda\./);
  assert.match(contents, /Nenhum cliente arquivado\./);
});

test('16/17/18. ordenacao local por Mais recentes, Nome A–Z e Maior valor estimado', async () => {
  const contents = await source('ClientesPage.jsx');
  assert.match(
    contents,
    /const CLIENT_SORT_OPTIONS = \[\s*\n\s*\{ value: 'recent', label: 'Mais recentes' \},\s*\n\s*\{ value: 'name', label: 'Nome A–Z' \},\s*\n\s*\{ value: 'value', label: 'Maior valor estimado' \},/,
  );
  assert.match(contents, /toSafeTimestamp\(b\.created_at\) - toSafeTimestamp\(a\.created_at\)/);
  assert.match(contents, /\(a\.name \?\? ''\)\.localeCompare\(b\.name \?\? '', 'pt-BR'\)/);
  assert.match(contents, /toSafeNumber\(b\.estimated_value\) - toSafeNumber\(a\.estimated_value\)/);
});

test('19. sortClients nao muta o array original (usa [...clients])', async () => {
  const contents = await source('ClientesPage.jsx');
  assert.match(contents, /function sortClients\(clients, sortOrder\) \{\s*\n\s*const sorted = \[\.\.\.clients\];/);
});

test('20. valor/data invalidos nao quebram a ordenacao (toSafeNumber/toSafeTimestamp tratam como zero)', async () => {
  const contents = await source('ClientesPage.jsx');
  assert.match(
    contents,
    /function toSafeNumber\(value\) \{\s*\n\s*if \(value === null \|\| value === undefined \|\| value === ''\) return 0;/,
  );
  assert.match(
    contents,
    /function toSafeTimestamp\(value\) \{\s*\n\s*if \(!value\) return 0;/,
  );
});

test('21/22. contador mostra total ou "filtrados de total" conforme ha busca ativa', async () => {
  const contents = await source('ClientesPage.jsx');
  assert.match(
    contents,
    /\{normalizedSearchQuery\s*\n\s*\? `\$\{sortedClients\.length\} de \$\{visibleClients\.length\} clientes`\s*\n\s*: `\$\{visibleClients\.length\} clientes`\}/,
  );
});

test('busca/ordenacao nao resetam ao trocar de aba (mesmo padrao ja existente de outcomeFilter no CRM)', async () => {
  const contents = await source('ClientesPage.jsx');
  const changeViewFn = contents.slice(
    contents.indexOf('function handleChangeView'),
    contents.indexOf('function handleRequestArchive'),
  );
  assert.doesNotMatch(changeViewFn, /setSearchQuery|setSortOrder/);
});

test('lista renderizada usa sortedClients (busca + ordenacao), nao mais visibleClients diretamente', async () => {
  const contents = await source('ClientesPage.jsx');
  assert.match(contents, /\{sortedClients\.map\(\(client\) => \(/);
});
