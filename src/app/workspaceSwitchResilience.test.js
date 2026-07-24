import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// AUTH3 -- resiliência da troca de workspace após falha de rede.
//
// Causa raiz corrigida: `effectiveWorkspaceType` (AuthenticatedLayout.jsx)
// priorizava `selectedWorkspaceType` (seleção otimista, atualizada ANTES de
// qualquer confirmação de rede) sobre o workspace confirmado. Uma troca que
// falhasse a meio caminho (queda de conexão) deixava essa seleção presa no
// destino pretendido para sempre -- o AccountMenu (que usava esse valor)
// mostrava um contexto diferente do que a Sidebar (que já usava
// access.currentWorkspace, sempre confirmado) exibia. Sem infraestrutura de
// renderização React neste repositório -- cobertura por leitura de
// código-fonte para wiring/garantias estruturais, mesmo padrão já usado em
// todo o projeto.
// ============================================================================

test('1/2. contexto ativo nunca muda antes da confirmação -- activeContext deriva do workspace confirmado, isSwitchingWorkspace não altera essa fonte', async () => {
  const content = await source('../layouts/mobile-app-shell/AuthenticatedLayout.jsx');
  // confirmedWorkspaceType não referencia isSwitchingWorkspace nem
  // selectedWorkspaceType -- continua sendo o mesmo valor (Empresa ou
  // Pessoal) do início ao fim de uma troca pendente, com sucesso ou falha.
  assert.match(content, /const confirmedWorkspaceType = workspace\?\.workspace_type \?\? access\.currentWorkspace;/);
  assert.doesNotMatch(
    content.slice(content.indexOf('const confirmedWorkspaceType'), content.indexOf('const activeContext') + 80),
    /isSwitchingWorkspace|selectedWorkspaceType/,
  );
});

test('3. sucesso atualiza o workspace confirmado (state.workspace) através de synchronizeSession -- seletor e módulos (Sidebar via access.currentWorkspace) passam a refletir o novo contexto juntos, na mesma fonte', async () => {
  const sessionSource = await source('./SessionContext.jsx');
  assert.match(sessionSource, /const synchronizationResult = await synchronizeSession\(state\.session\);/);
  // Só depois de synchronizeSession ter sucesso é que state.workspace muda
  // (dentro de synchronizeSession -- ver setState com workspace: workspaceResult.data),
  // que é a mesma fonte usada por access.currentWorkspace (AccessContext) e
  // por confirmedWorkspaceType (AuthenticatedLayout) -- nenhuma duplicação.
  assert.match(sessionSource, /workspace: workspaceResult\.data,/);
});

test('4/5. falha em qualquer direção (PF→PJ ou PJ→PF) reverte selectedWorkspaceType para o workspace confirmado anterior -- rollback simétrico, mesmo código para os dois sentidos', async () => {
  const content = await source('./SessionContext.jsx');
  const fnBody = content.slice(content.indexOf('const switchWorkspace = useCallback'), content.indexOf('const createWorkspaceProfile'));
  const rollbackOccurrences = fnBody.match(/setSelectedWorkspaceType\(previousWorkspaceType\);/g) ?? [];
  // 3 pontos de falha real de rede/persistência revertem: listWorkspaces,
  // updateProfile e synchronizeSession -- o mesmo previousWorkspaceType
  // (capturado uma única vez, antes da tentativa) cobre os dois sentidos.
  assert.equal(rollbackOccurrences.length, 3);
  assert.match(fnBody, /const previousWorkspaceType = state\.workspace\?\.workspace_type \?\? null;/);
});

test('6/7. mensagem de falha é clara (não técnica) e indica explicitamente qual espaço continua ativo', async () => {
  const content = await source('./SessionContext.jsx');
  assert.match(
    content,
    /const networkErrorMessage = `Não foi possível alterar o espaço\. Você continua no \$\{previousWorkspaceLabel\}\.`;/,
  );
  assert.match(content, /const previousWorkspaceLabel = getWorkspaceContextLabel\(previousWorkspaceType\);/);
});

test('8. nova tentativa é permitida após falha -- a trava (switchWorkspaceRef) é sempre liberada em todo caminho de retorno, inclusive nos de erro', async () => {
  const content = await source('./SessionContext.jsx');
  const fnBody = content.slice(content.indexOf('const switchWorkspace = useCallback'), content.indexOf('const createWorkspaceProfile'));
  const setTrue = (fnBody.match(/switchWorkspaceRef\.current = true;/g) ?? []).length;
  const setFalse = (fnBody.match(/switchWorkspaceRef\.current = false;/g) ?? []).length;
  assert.equal(setTrue, 1);
  // Um "false" para cada caminho de saída depois de setar true: falha em
  // listWorkspaces, WORKSPACE_NOT_FOUND, já no workspace, falha em
  // updateProfile, falha em synchronizeSession, e sucesso final = 6.
  assert.equal(setFalse, 6);
});

test('9. chamadas simultâneas são impedidas -- uma segunda chamada enquanto switchWorkspaceRef já está true retorna erro imediato, sem tocar workspaceSwitchState da chamada em andamento', async () => {
  const content = await source('./SessionContext.jsx');
  assert.match(
    content,
    /if \(switchWorkspaceRef\.current\) \{\s*\n\s*const error = \{ code: 'SWITCH_IN_PROGRESS', message: 'Já existe uma troca de espaço em andamento\.' \};\s*\n\s*return \{ data: null, error \};\s*\n\s*\}/,
  );
});

test('10. seletor (AccountMenu desktop) fica desabilitado durante isSwitchingWorkspace -- impede novo clique mesmo antes do mutex do SessionContext atuar', async () => {
  const content = await source('../components/layout/Topbar/AccountMenu.jsx');
  assert.match(content, /disabled=\{isSwitchingWorkspace\}\s*\n\s*onClick=\{\(\) => closeAnd\(onToggleWorkspace\)\}/);
});

test('10b. seletor mobile (ContextSegmentedControl) já ficava desabilitado durante isContextLoading -- comportamento preexistente preservado, agora alimentado por isSwitchingWorkspace real', async () => {
  const content = await source('../layouts/mobile-app-shell/ContextSegmentedControl.jsx');
  assert.match(content, /aria-disabled=\{isLoading \|\| isContextLocked\}/);
  assert.match(content, /if \(!isLoading && !isActive\) onChange\?\.\(context, \{ locked: isContextLocked \}\);/);
  const layoutContent = await source('../layouts/mobile-app-shell/AuthenticatedLayout.jsx');
  assert.match(layoutContent, /isContextLoading: isSwitchingWorkspace,/);
});

test('11. Sidebar nunca deriva de estado otimista -- usa access.currentWorkspace (AccessContext), que por sua vez deriva só do workspace CONFIRMADO da sessão, nunca de selectedWorkspaceType', async () => {
  const sidebarContent = await source('../components/layout/Sidebar/Sidebar.jsx');
  assert.doesNotMatch(sidebarContent, /selectedWorkspaceType/);
  assert.match(sidebarContent, /useAccess\(\)/);

  const accessContextContent = await source('./AccessContext.jsx');
  assert.doesNotMatch(accessContextContent, /selectedWorkspaceType/);
  assert.match(accessContextContent, /getAccessFromSession\(profile, workspace, subscription\)/);
});

test('12. menu mobile (headerProps.activeContext, MobileHeader/MoreMenu) nunca deriva de estado otimista -- recebe activeContext já resolvido do workspace confirmado', async () => {
  const layoutContent = await source('../layouts/mobile-app-shell/AuthenticatedLayout.jsx');
  const headerPropsBlock = layoutContent.slice(layoutContent.indexOf('headerProps={{'), layoutContent.indexOf('}}\n    >'));
  assert.match(headerPropsBlock, /activeContext,/);
  assert.doesNotMatch(headerPropsBlock, /selectedWorkspaceType/);

  const mobileHeaderContent = await source('../layouts/mobile-app-shell/MobileHeader.jsx');
  assert.doesNotMatch(mobileHeaderContent, /selectedWorkspaceType/);

  const moreMenuContent = await source('../layouts/mobile-app-shell/MoreMenu.jsx');
  assert.doesNotMatch(moreMenuContent, /selectedWorkspaceType/);
});

test('13. desmontagem durante a promise não gera atualização inválida -- switchWorkspace herda a proteção de isMountedRef já existente dentro de synchronizeSession (AUTH2), nenhuma chamada nova a setState fora dela ignora esse guard', async () => {
  const content = await source('./SessionContext.jsx');
  assert.match(content, /synchronizationId !== synchronizationIdRef\.current \|\|\s*\n\s*!isMountedRef\.current/);
});

test('14. erro de rede na troca de workspace nunca chama signOut', async () => {
  const content = await source('./SessionContext.jsx');
  const fnBody = content.slice(content.indexOf('const switchWorkspace = useCallback'), content.indexOf('const createWorkspaceProfile'));
  assert.doesNotMatch(fnBody, /signOut(?!Service)/);
});

test('15. erro de rede na troca de workspace não gera retry automático nem loop -- synchronizeSession é chamada no máximo uma vez por tentativa, sem laço de repetição', async () => {
  const content = await source('./SessionContext.jsx');
  const fnBody = content.slice(content.indexOf('const switchWorkspace = useCallback'), content.indexOf('const createWorkspaceProfile'));
  const synchronizeCalls = (fnBody.match(/synchronizeSession\(/g) ?? []).length;
  assert.equal(synchronizeCalls, 1);
  assert.doesNotMatch(fnBody, /while\s*\(|setInterval|setTimeout/);
});

test('16/17. aviso de sucesso da UX5 (switchNotice) só é setado depois de confirmar que switchWorkspace não retornou erro -- nunca após falha', async () => {
  const content = await source('../layouts/mobile-app-shell/AuthenticatedLayout.jsx');
  const fnBody = content.slice(content.indexOf('const handleContextChange = async'), content.indexOf('const handleToggleWorkspace'));
  assert.match(fnBody, /const result = await switchWorkspace\(nextWorkspaceType\);/);
  assert.match(fnBody, /if \(result\?\.error\) return;/);
  // O early-return por erro acontece ANTES de qualquer setSwitchNotice.
  const errorReturnIndex = fnBody.indexOf('if (result?.error) return;');
  const noticeIndex = fnBody.indexOf('setSwitchNotice(');
  assert.ok(errorReturnIndex < noticeIndex);
});

test('18. refresh preserva apenas o workspace CONFIRMADO -- a preferência local só é gravada (writeWorkspaceSelectionForUser) depois de synchronizeSession confirmar sucesso, nunca antes da tentativa', async () => {
  const content = await source('./SessionContext.jsx');
  const fnBody = content.slice(content.indexOf('const switchWorkspace = useCallback'), content.indexOf('const createWorkspaceProfile'));
  const writeOccurrences = (fnBody.match(/writeWorkspaceSelectionForUser\(/g) ?? []).length;
  assert.equal(writeOccurrences, 1);
  const writeIndex = fnBody.indexOf('writeWorkspaceSelectionForUser(');
  const synchronizeIndex = fnBody.indexOf('const synchronizationResult = await synchronizeSession');
  assert.ok(writeIndex > synchronizeIndex, 'a preferência só deve ser persistida depois da confirmação real');
});

test('WORKSPACE_NOT_FOUND é o único caso que preserva a seleção otimista (fluxo legítimo de "criar perfil ausente") -- todos os outros erros revertem', async () => {
  const content = await source('./SessionContext.jsx');
  const fnBody = content.slice(content.indexOf('const switchWorkspace = useCallback'), content.indexOf('const createWorkspaceProfile'));
  const notFoundBlock = fnBody.slice(fnBody.indexOf("code: 'WORKSPACE_NOT_FOUND'"), fnBody.indexOf("code: 'WORKSPACE_NOT_FOUND'") + 400);
  assert.doesNotMatch(notFoundBlock, /setSelectedWorkspaceType\(previousWorkspaceType\)/);
});

test('AUTH2 preservada: nenhum novo Supabase client, nenhuma chamada a onAuthStateChange dentro de switchWorkspace', async () => {
  const content = await source('./SessionContext.jsx');
  const fnBody = content.slice(content.indexOf('const switchWorkspace = useCallback'), content.indexOf('const createWorkspaceProfile'));
  assert.doesNotMatch(fnBody, /createClient|onAuthStateChange/);
});

test('indicador transitório "Alterando para..." usa WorkspaceContextNotice sem onDismiss -- não é dispensável, some sozinho quando a troca resolve', async () => {
  const content = await source('../layouts/mobile-app-shell/AuthenticatedLayout.jsx');
  assert.match(content, /const contextNotice = switchingNotice \? \(\s*\n\s*<WorkspaceContextNotice message=\{switchingNotice\} \/>/);
});

test('WorkspaceContextNotice: botão de dispensar só renderiza quando onDismiss é fornecido -- suporta o indicador transitório sem X', async () => {
  const content = await source('../components/workspace/WorkspaceContextNotice.jsx');
  assert.match(content, /\{onDismiss \? \(/);
});

// ============================================================================
// AUTH3 -- lacuna encontrada e corrigida durante a validação manual: o
// desktop não tinha NENHUM lugar para mostrar o feedback de falha
// (workspaceSwitchError só alimentava o mobile via headerProps.contextMessage).
// Confirmado ao vivo: sem esse aviso, a Sidebar preservava corretamente o
// contexto anterior em caso de falha, mas o usuário não recebia nenhuma
// explicação do porquê a troca não completou.
// ============================================================================

test('aviso de falha (desktop) aparece para qualquer erro de troca, exceto WORKSPACE_NOT_FOUND (que tem tratamento próprio via tela de "perfil ausente")', async () => {
  const content = await source('../layouts/mobile-app-shell/AuthenticatedLayout.jsx');
  assert.match(
    content,
    /const showSwitchErrorNotice = Boolean\(workspaceSwitchError\)\s*\n\s*&& workspaceSwitchError\.code !== 'WORKSPACE_NOT_FOUND'\s*\n\s*&& workspaceSwitchError !== dismissedSwitchError;/,
  );
});

test('aviso de falha é dispensável por identidade do objeto de erro -- uma NOVA falha (novo objeto) reabre o aviso mesmo que a mensagem seja igual', async () => {
  const content = await source('../layouts/mobile-app-shell/AuthenticatedLayout.jsx');
  assert.match(content, /const \[dismissedSwitchError, setDismissedSwitchError\] = useState\(null\);/);
  assert.match(content, /onDismiss=\{\(\) => setDismissedSwitchError\(workspaceSwitchError\)\}/);
});

test('prioridade final confirmada: "Alterando..." > erro de falha > bloqueio > explicação de sucesso', async () => {
  const content = await source('../layouts/mobile-app-shell/AuthenticatedLayout.jsx');
  assert.match(
    content,
    /const contextNotice = switchingNotice \? \([\s\S]{0,120}\) : showSwitchErrorNotice \? \([\s\S]{0,200}\) : showBlockedNotice \? \(/,
  );
});
