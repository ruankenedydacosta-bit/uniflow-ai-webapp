import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// Sem infraestrutura de renderização React neste repositório -- cobertura
// por leitura de código-fonte para wiring/garantias estruturais, mesmo
// padrão já usado em todo o projeto. Nota: MobileAppShell.test.jsx e
// MoreMenu.test.jsx (extensão .jsx) não são executáveis por `node --test`
// (extensão de arquivo desconhecida) e não estão registrados em
// package.json -- CFG2 não expande esse problema pré-existente, apenas usa
// a extensão .js real do resto do projeto para este novo arquivo.

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('shell mobile preserva conteúdo acima da navegação e bloqueia overflow horizontal', async () => {
  const css = await source('MobileAppShell.module.css');
  assert.match(css, /padding-bottom: calc\(var\(--uf-space-96\) \+ env\(safe-area-inset-bottom/);
  assert.match(css, /\.content \{[\s\S]*?overflow-x: hidden;/);
  assert.match(css, /\.bottomNavigation \{[\s\S]*?position: fixed;/);
});

test('modal usa viewport dinâmica e safe areas em telas móveis', async () => {
  const css = await source('../../components/ui/Modal/Modal.module.css');
  assert.match(css, /max-height: calc\(100dvh - var\(--uf-space-24\)\)/);
  assert.match(css, /env\(safe-area-inset-bottom/);
  assert.match(css, /overflow: auto/);
});

// ============================================================================
// CFG2 -- logout funcional (mobile + desktop)
// ============================================================================

test('AuthenticatedLayout obtem signOut de useSession() (mesma fonte real, nenhuma chamada direta a Supabase/authService)', async () => {
  const content = await source('AuthenticatedLayout.jsx');
  assert.match(content, /signOut,\s*\n\s*switchWorkspace,/);
  assert.doesNotMatch(content, /supabase|authService/i);
});

test('handleSignOut usa uma trava sincrona (signOutRef) contra chamadas concorrentes', async () => {
  const content = await source('AuthenticatedLayout.jsx');
  assert.match(content, /const signOutRef = useRef\(false\);/);
  assert.match(content, /const handleSignOut = async \(\) => \{\s*\n\s*if \(signOutRef\.current\) return;/);
  assert.match(content, /signOutRef\.current = true;/);
  assert.match(content, /signOutRef\.current = false;/);
});

test('handleSignOut trata erro do resultado sem lancar excecao e mantem o usuario autenticado (sem logout otimista)', async () => {
  const content = await source('AuthenticatedLayout.jsx');
  const fnBody = content.slice(content.indexOf('const handleSignOut = async'), content.indexOf('// support permanece'));
  assert.match(fnBody, /const result = await signOut\(\);/);
  assert.match(fnBody, /if \(result\?\.error\) \{\s*\n\s*setSignOutError\(result\.error\);/);
  assert.match(fnBody, /\} catch \{/);
  assert.match(fnBody, /\} finally \{/);
  assert.doesNotMatch(fnBody, /navigate\(|window\.location|localStorage/);
});

test('handleSignOut nao navega manualmente -- depende do guard de autenticacao existente em App.jsx', async () => {
  const content = await source('AuthenticatedLayout.jsx');
  assert.match(content, /o guard de autenticacao existente em App\.jsx/);
});

test('handleShellAction roteia exatamente sign-out para handleSignOut e open-notifications para o painel, sem implementar autenticacao em MoreMenu', async () => {
  const content = await source('AuthenticatedLayout.jsx');
  const fnBody = content.slice(content.indexOf('function handleShellAction'), content.indexOf('const profileName'));
  assert.match(fnBody, /if \(action === 'sign-out'\) \{\s*\n\s*void handleSignOut\(\);\s*\n\s*return;\s*\n\s*\}/);
  assert.match(fnBody, /if \(action === 'open-notifications'\) \{\s*\n\s*setIsNotificationsOpen\(true\);\s*\n\s*\}/);
});

test('acao do shell "support" permanece sem efeito, sem lancar erro', async () => {
  const content = await source('AuthenticatedLayout.jsx');
  const fnBody = content.slice(content.indexOf('function handleShellAction'), content.indexOf('const profileName'));
  // 'sign-out' e 'open-notifications' sao tratados explicitamente; qualquer
  // outra acao (ex.: 'support') cai no no-op implicito -- nunca lanca excecao.
  assert.doesNotMatch(fnBody, /throw /);
});

test('MobileAppShell recebe onAction=handleShellAction (mobile)', async () => {
  const content = await source('AuthenticatedLayout.jsx');
  assert.match(content, /<MobileAppShell\s*\n\s*title=\{mobileTitle \?\? title\}\s*\n\s*immersive=\{immersive\}\s*\n\s*onAction=\{handleShellAction\}/);
});

test('AppShell (desktop) recebe onSignOut/isSigningOut/signOutError/profileEmail/activeContext/onToggleWorkspace/isSwitchingWorkspace/contextNotice -- signOut e troca de workspace centralizados em AuthenticatedLayout, nunca em AppShell/Topbar/Sidebar', async () => {
  const content = await source('AuthenticatedLayout.jsx');
  const fnBody = content.slice(content.indexOf('if (!isMobile) {'), content.indexOf('const missingWorkspaceType'));
  assert.match(
    fnBody,
    /<AppShell\s*\n\s*title=\{title\}\s*\n\s*profileName=\{profileName\}\s*\n\s*profileEmail=\{profileEmail\}\s*\n\s*activeContext=\{activeContext\}\s*\n\s*onToggleWorkspace=\{handleToggleWorkspace\}\s*\n\s*isSwitchingWorkspace=\{isSwitchingWorkspace\}\s*\n\s*onSignOut=\{handleSignOut\}\s*\n\s*isSigningOut=\{isSigningOut\}\s*\n\s*signOutError=\{signOutError\}\s*\n\s*contextNotice=\{contextNotice\}\s*\n\s*>/,
  );
});

test('AppShell (desktop) recebe o mesmo profileName (profile.full_name, com fallback "UniFlow") ja usado pelo Avatar mobile -- fonte unica, sem busca duplicada', async () => {
  const content = await source('AuthenticatedLayout.jsx');
  assert.match(content, /const profileName = profile\?\.full_name \?\? 'UniFlow';/);
  // Uma unica ocorrencia da expressao: mobile e desktop reaproveitam a mesma variavel.
  const occurrences = content.match(/profile\?\.full_name \?\? 'UniFlow'/g) ?? [];
  assert.equal(occurrences.length, 1);
});

test('activeContext/handleContextChange sao hoisted (fora do bloco mobile-only) para que o AppShell desktop use o MESMO fluxo real de troca de workspace do mobile, sem duplicar logica', async () => {
  const content = await source('AuthenticatedLayout.jsx');
  const beforeIsMobile = content.slice(0, content.indexOf('if (!isMobile)'));
  assert.match(beforeIsMobile, /const activeContext = confirmedWorkspaceType === 'business' \? 'PJ' : 'PF';/);
  assert.match(beforeIsMobile, /const handleContextChange = async \(context\) => \{/);
  assert.match(beforeIsMobile, /await switchWorkspace\(nextWorkspaceType\);/);
  assert.match(beforeIsMobile, /const handleToggleWorkspace = \(\) => \{/);
});

test('AUTH3: contexto ativo (Sidebar/AccountMenu/MobileHeader) deriva SEMPRE do workspace confirmado -- nunca de selectedWorkspaceType (seleção otimista)', async () => {
  const content = await source('AuthenticatedLayout.jsx');
  assert.match(content, /const confirmedWorkspaceType = workspace\?\.workspace_type \?\? access\.currentWorkspace;/);
  assert.match(content, /const activeContext = confirmedWorkspaceType === 'business' \? 'PJ' : 'PF';/);
  assert.match(content, /const workspaceLabel = getWorkspaceContextLabel\(confirmedWorkspaceType\);/);
});

test('AUTH3: indicador transitório "Alterando para..." só existe durante isSwitchingWorkspace com destino divergente do confirmado -- nunca decide autorização/exibição de módulos', async () => {
  const content = await source('AuthenticatedLayout.jsx');
  assert.match(
    content,
    /const pendingWorkspaceType = isSwitchingWorkspace\s*\n\s*&& selectedWorkspaceType\s*\n\s*&& selectedWorkspaceType !== confirmedWorkspaceType\s*\n\s*\? selectedWorkspaceType\s*\n\s*: null;/,
  );
  assert.match(content, /const switchingNotice = pendingWorkspaceType/);
});

test('AUTH3: defesa extra na UI -- handleContextChange ignora novo clique enquanto isSwitchingWorkspace já é true', async () => {
  const content = await source('AuthenticatedLayout.jsx');
  const fnBody = content.slice(content.indexOf('const handleContextChange = async'), content.indexOf('const handleToggleWorkspace'));
  assert.match(fnBody, /if \(isSwitchingWorkspace\) return;/);
});

test('nenhum componente visual (AppShell/Topbar/Sidebar/MobileAppShell/MoreMenu) importa SessionContext diretamente', async () => {
  const files = [
    '../../components/layout/AppShell/AppShell.jsx',
    '../../components/layout/Topbar/Topbar.jsx',
    '../../components/layout/Sidebar/Sidebar.jsx',
    './MobileAppShell.jsx',
    './MoreMenu.jsx',
  ];
  for (const file of files) {
    const content = await source(file);
    assert.doesNotMatch(content, /SessionContext/, `${file} nao deve importar SessionContext`);
  }
});

// ============================================================================
// Regressão -- comportamento preexistente preservado
// ============================================================================

test('renderiza somente um shell por viewport (AppShell OU MobileAppShell, nunca os dois)', async () => {
  const content = await source('AuthenticatedLayout.jsx');
  assert.match(content, /if \(!isMobile\)/);
  assert.equal((content.match(/<AppShell\b/g) ?? []).length, 1);
  assert.equal((content.match(/<MobileAppShell/g) ?? []).length, 1);
});

test('modo imersivo, titulo e headerProps de workspace continuam intactos', async () => {
  const content = await source('AuthenticatedLayout.jsx');
  assert.match(content, /immersive=\{immersive\}/);
  assert.match(content, /subtitle: workspaceLabel,/);
  assert.match(content, /activeContext,/);
  assert.match(content, /onContextChange: handleContextChange,/);
});

test('fluxo de criacao de perfil PF\\/PJ (handleCreateProfile) permanece inalterado', async () => {
  const content = await source('AuthenticatedLayout.jsx');
  assert.match(content, /const handleCreateProfile = async \(\) => \{/);
  assert.match(content, /navigate\('\/financeiro', \{ replace: true \}\);/);
});

test('estado de workspace ausente (shouldHidePreviousWorkspace) continua renderizado sem alteracao', async () => {
  const content = await source('AuthenticatedLayout.jsx');
  assert.match(content, /shouldHidePreviousWorkspace \? \(/);
  assert.match(content, /role="status" aria-live="polite"/);
});

// ============================================================================
// UX2 -- avatar mobile executa navegacao real para /configuracoes
// ============================================================================

test('headerProps.onAvatarPress navega para /configuracoes -- corrige o clique morto do avatar mobile (achado P0 da UX1)', async () => {
  const content = await source('AuthenticatedLayout.jsx');
  const headerPropsBlock = content.slice(
    content.indexOf('headerProps={{'),
    content.indexOf('}}\n    >'),
  );
  assert.match(headerPropsBlock, /onAvatarPress: \(\) => navigate\('\/configuracoes'\),/);
});

// ============================================================================
// UX5 -- clareza de contexto PF/PJ: identidade do espaço, explicação na
// troca e aviso de módulo bloqueado (redirecionamento deixou de ser
// silencioso).
// ============================================================================

test('subtitle do header mobile usa o rótulo único getWorkspaceContextLabel -- nunca um texto local duplicado', async () => {
  const content = await source('AuthenticatedLayout.jsx');
  assert.match(content, /import \{ getWorkspaceContextLabel, getWorkspaceTypeFromContext \} from '\.\.\/\.\.\/app\/workspaceSelection\.js';/);
  assert.match(content, /const workspaceLabel = getWorkspaceContextLabel\(confirmedWorkspaceType\);/);
  assert.match(content, /subtitle: workspaceLabel,/);
});

test('handleContextChange aguarda switchWorkspace e só mostra a explicação em caso de sucesso (nunca em erro)', async () => {
  const content = await source('AuthenticatedLayout.jsx');
  const fnBody = content.slice(content.indexOf('const handleContextChange'), content.indexOf('const handleToggleWorkspace'));
  assert.match(fnBody, /const result = await switchWorkspace\(nextWorkspaceType\);/);
  assert.match(fnBody, /if \(result\?\.error\) return;/);
});

test('explicação de troca usa readWorkspaceContextHintSeen/writeWorkspaceContextHintSeen -- aparece uma vez por espaço, nunca repetida à exaustão', async () => {
  const content = await source('AuthenticatedLayout.jsx');
  assert.match(content, /if \(readWorkspaceContextHintSeen\(nextWorkspaceType\)\) \{/);
  assert.match(content, /writeWorkspaceContextHintSeen\(nextWorkspaceType\);/);
});

test('switchWorkspace re-sincroniza a sessão e pode desmontar/remontar o componente -- a intenção de mostrar a explicação sobrevive via variável de módulo, não só via setState (que viraria no-op na instância antiga)', async () => {
  const content = await source('AuthenticatedLayout.jsx');
  assert.match(content, /let pendingWorkspaceSwitchNotice = null;/);
  assert.match(content, /const \[switchNotice, setSwitchNotice\] = useState\(\(\) => pendingWorkspaceSwitchNotice\);/);
  assert.match(content, /pendingWorkspaceSwitchNotice = notice;\s*\n\s*setSwitchNotice\(notice\);/);
});

test('variável de módulo é limpa uma única vez via useEffect (não é setState, então não viola react-hooks/set-state-in-effect)', async () => {
  const content = await source('AuthenticatedLayout.jsx');
  assert.match(content, /useEffect\(\(\) => \{\s*\n\s*pendingWorkspaceSwitchNotice = null;\s*\n\s*\}, \[\]\);/);
});

test('textos de explicação nunca afirmam que dados foram apagados ou misturados -- sempre "continuam separados"', async () => {
  const content = await source('AuthenticatedLayout.jsx');
  const explanationsBlock = content.slice(
    content.indexOf('const WORKSPACE_SWITCH_EXPLANATIONS'),
    content.indexOf('function getModuleLabel'),
  );
  assert.match(explanationsBlock, /continuam separados, nenhum foi apagado/);
  assert.doesNotMatch(explanationsBlock, /foram apagados|dados.*misturad[oa]/i);
});

test('aviso de módulo bloqueado usa o moduleId vindo de location.state (App.jsx), nunca da URL', async () => {
  const content = await source('AuthenticatedLayout.jsx');
  assert.match(content, /const location = useLocation\(\);/);
  assert.match(content, /const blockedModuleId = location\.state\?\.blockedModuleId \?\? null;/);
});

test('aviso de bloqueio só é mostrado enquanto o usuário permanece no Espaço Pessoal -- some sozinho ao trocar para Empresa', async () => {
  const content = await source('AuthenticatedLayout.jsx');
  assert.match(content, /const showBlockedNotice = Boolean\(blockedModuleId\) && confirmedWorkspaceType === WORKSPACE_TYPES\.PERSONAL;/);
});

test('ação "Ir para Espaço Empresa" só aparece se o usuário realmente tem um workspace empresarial, e usa o MESMO handleContextChange (switchWorkspace) do seletor -- nunca troca sozinha sem clique', async () => {
  const content = await source('AuthenticatedLayout.jsx');
  assert.match(content, /const canGoToBusinessSpace = availableWorkspaceTypes\.includes\(WORKSPACE_TYPES\.BUSINESS\);/);
  const fnBody = content.slice(content.indexOf('const handleGoToBusinessSpace'), content.indexOf('const handleGoToBusinessSpace') + 200);
  assert.match(fnBody, /void handleContextChange\('PJ'\);/);
});

test('aviso é removido ao ser dispensado via navegação real (limpa location.state) -- nunca via estado local, que seria perdido no remonte causado pelo próprio switchWorkspace', async () => {
  const content = await source('AuthenticatedLayout.jsx');
  const fnBody = content.slice(content.indexOf('const clearBlockedNotice'), content.indexOf('const clearBlockedNotice') + 150);
  assert.match(fnBody, /navigate\(location\.pathname, \{ replace: true, state: \{\} \}\);/);
  assert.match(content, /onDismiss=\{clearBlockedNotice\}/);
});

test('"Ir para Espaço Empresa" também limpa o aviso de bloqueio antes de trocar -- não fica preso ao location.state antigo depois de resolvido', async () => {
  const content = await source('AuthenticatedLayout.jsx');
  const fnBody = content.slice(content.indexOf('const handleGoToBusinessSpace'), content.indexOf('const handleGoToBusinessSpace') + 200);
  assert.match(fnBody, /clearBlockedNotice\(\);/);
});

test('prioridade: indicador "Alterando..." (AUTH3) > aviso de bloqueio (acionável) > explicação de troca (informativa) -- nunca mais de um ao mesmo tempo', async () => {
  const content = await source('AuthenticatedLayout.jsx');
  assert.match(content, /const contextNotice = switchingNotice \? \(/);
  assert.match(content, /\) : showBlockedNotice \? \(/);
});

test('desktop e mobile recebem o MESMO contextNotice -- sem lógica duplicada de aviso por plataforma', async () => {
  const content = await source('AuthenticatedLayout.jsx');
  assert.match(content, /contextNotice=\{contextNotice\}/);
  assert.match(content, /\{contextNotice\}\s*\n\s*\{shouldHidePreviousWorkspace/);
});
