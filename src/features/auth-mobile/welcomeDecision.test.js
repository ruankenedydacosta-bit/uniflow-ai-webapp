import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path) {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

// ============================================================================
// SIMPLIFICAÇÃO DA PRIMEIRA TELA: /welcome deixou de ser um redirect para
// /login e passou a ser a própria tela de decisão -- exatamente dois cards
// grandes ("Já tenho conta" / "Criar conta"). O usuário decide O QUE quer
// fazer antes de decidir COMO (Google/e-mail), nunca o contrário. A escolha
// de provedor só aparece depois, já dentro de /login ou /cadastro.
// ============================================================================

test('WelcomeDecisionPage tem exatamente dois cards de decisão, com título/descrição aprovados', async () => {
  const page = await source('./pages/WelcomeDecisionPage.jsx');
  assert.match(page, /data-option="existing"/);
  assert.match(page, /<strong>Já tenho conta<\/strong>/);
  assert.match(page, /title: 'Criar conta',\s*\n\s*description: 'Crie sua conta gratuitamente e comece agora mesmo\.',\s*\n\s*to: '\/cadastro',/);
  const cardMatches = page.match(/data-option=/g) ?? [];
  assert.equal(cardMatches.length, 2, 'deve haver exatamente dois cards de decisão');
});

test('WelcomeDecisionPage mantém a identidade visual -- reaproveita AuthBrandExperience (logo/SmartTech/ondas/benefícios) e PartnershipFooter, nunca duplica', async () => {
  const page = await source('./pages/WelcomeDecisionPage.jsx');
  assert.match(page, /import AuthBrandExperience from '\.\.\/components\/AuthBrandExperience\.jsx';/);
  assert.match(page, /import PartnershipFooter from '\.\.\/components\/PartnershipFooter\.jsx';/);
  assert.match(page, /<AuthBrandExperience \/>/);
  assert.match(page, /<PartnershipFooter \/>/);
  // Mesmo módulo de estilos do restante do fluxo de auth (paleta, ondas,
  // tipografia premium) -- nunca um CSS module paralelo divergente.
  assert.match(page, /import styles from '\.\.\/authMobile\.module\.css';/);
});

// ============================================================================
// GOOGLE DIRETO NA TELA DE BOAS-VINDAS: "Já tenho conta" chama o Google
// imediatamente (mesma função real de OAuth já usada por LoginPage.jsx,
// via useGoogleAuthRedirect -- nunca uma segunda implementação), sem passar
// por /login antes. "Criar conta" continua abrindo /cadastro (que reabre
// MobileAuthPage já em modo signup).
// ============================================================================

test('"Já tenho conta" chama startGoogleAuth diretamente -- nunca navega para /login antes', async () => {
  const page = await source('./pages/WelcomeDecisionPage.jsx');
  assert.match(page, /import { useGoogleAuthRedirect } from '\.\.\/useGoogleAuthRedirect\.js';/);
  assert.match(page, /const \{ startGoogleAuth \} = useGoogleAuthRedirect\(\);/);
  const clickHandlerBody = page.slice(
    page.indexOf('async function handleExistingUserClick'),
    page.indexOf('return (\n    <main'),
  );
  assert.match(clickHandlerBody, /const result = await startGoogleAuth\(location\.state\?\.from\);/);
  assert.doesNotMatch(clickHandlerBody, /navigate\(('|"|`)\/login/);
});

test('card "Já tenho conta" chama handleExistingUserClick no onClick -- nunca um segundo clique num botão "Continuar com Google" separado', async () => {
  const page = await source('./pages/WelcomeDecisionPage.jsx');
  assert.match(page, /data-option="existing"[\s\S]{0,200}onClick={handleExistingUserClick}/);
});

test('duplo clique não inicia duas chamadas OAuth -- handleExistingUserClick retorna cedo se isGoogleLoading já for true', async () => {
  const page = await source('./pages/WelcomeDecisionPage.jsx');
  const clickHandlerBody = page.slice(
    page.indexOf('async function handleExistingUserClick'),
    page.indexOf('return (\n    <main'),
  );
  assert.match(clickHandlerBody, /if \(isGoogleLoading\) return;/);
  // O card também fica `disabled` durante o loading -- dupla proteção
  // (clique programático e nativo do navegador).
  assert.match(page, /data-option="existing"[\s\S]{0,150}disabled={isGoogleLoading}/);
});

test('loading mostra "Abrindo Google..." no próprio card durante a chamada', async () => {
  const page = await source('./pages/WelcomeDecisionPage.jsx');
  assert.match(page, /isGoogleLoading \? 'Abrindo Google\.\.\.' :/);
});

test('erro do OAuth (falha síncrona, rede, Supabase) restaura o card (isGoogleLoading=false) e mostra mensagem recuperável', async () => {
  const page = await source('./pages/WelcomeDecisionPage.jsx');
  const clickHandlerBody = page.slice(
    page.indexOf('async function handleExistingUserClick'),
    page.indexOf('return (\n    <main'),
  );
  assert.match(clickHandlerBody, /if \(result\.message\) \{\s*\n\s*setFeedback\(result\.message\);\s*\n\s*setIsGoogleLoading\(false\);/);
  assert.match(clickHandlerBody, /catch \{\s*\n\s*setFeedback\('Não foi possível entrar com o Google\. Tente novamente\.'\);\s*\n\s*setIsGoogleLoading\(false\);/);
});

test('cancelamento/erro do OAuth (retorno via AuthCallbackPage com state.oauthFailed) mostra mensagem ao montar -- nunca envia para /plano-pessoal sem sessão', async () => {
  const page = await source('./pages/WelcomeDecisionPage.jsx');
  assert.match(
    page,
    /location\.state\?\.oauthFailed\s*\n\s*\? 'Não foi possível entrar com o Google\. Tente novamente\.'\s*\n\s*: ''/,
  );
  // A tela nunca navega sozinha para /plano-pessoal -- só App.jsx decide
  // isso, e só depois de sessão real confirmada.
  assert.doesNotMatch(page, /plano-pessoal/);
});

test('"Criar conta" continua navegando para /cadastro (abre direto no modo cadastro, nunca na aba Entrar)', async () => {
  const page = await source('./pages/WelcomeDecisionPage.jsx');
  assert.match(page, /data-option={NEW_ACCOUNT_OPTION\.id}[\s\S]{0,150}onClick={\(\) => navigate\(NEW_ACCOUNT_OPTION\.to\)}/);
  assert.match(page, /to: '\/cadastro',/);
});

test('useGoogleAuthRedirect é a ÚNICA implementação real do OAuth Google -- LoginPage.jsx e WelcomeDecisionPage.jsx importam o mesmo hook, nenhuma duplicata', async () => {
  const hook = await source('./useGoogleAuthRedirect.js');
  assert.match(hook, /import { useSession } from '\.\.\/\.\.\/app\/SessionContext\.jsx';/);
  assert.match(hook, /const \{ signInWithGoogle \} = useSession\(\);/);
  assert.match(hook, /await signInWithGoogle\(\)/);
  assert.match(hook, /getGoogleAuthFeedback\(result\?\.error\)/);

  const loginPage = await source('../../pages/LoginPage.jsx');
  const welcomePage = await source('./pages/WelcomeDecisionPage.jsx');
  assert.match(loginPage, /from '\.\.\/features\/auth-mobile\/useGoogleAuthRedirect\.js';/);
  assert.match(welcomePage, /from '\.\.\/useGoogleAuthRedirect\.js';/);
  // Nenhuma das duas telas chama signInWithGoogle/supabase.auth diretamente.
  assert.doesNotMatch(loginPage, /signInWithGoogle\(\)|supabase\.auth/);
  assert.doesNotMatch(welcomePage, /signInWithGoogle\(\)|supabase\.auth/);
});

test('WelcomeDecisionPage é exportado pelo índice do módulo auth-mobile', async () => {
  const index = await source('./index.js');
  assert.match(index, /export \{ default as WelcomeDecisionPage \} from '\.\/pages\/WelcomeDecisionPage\.jsx';/);
});

test('routes.jsx: /welcome renderiza WelcomeDecisionPage (nunca mais redireciona direto para /login)', async () => {
  const routes = await readFile(new URL('../../app/routes.jsx', import.meta.url), 'utf8');
  const welcomeBlock = routes.slice(
    routes.indexOf("path: '/welcome'"),
    routes.indexOf("path: '/login'"),
  );
  assert.match(welcomeBlock, /element: <WelcomeDecisionPage \/>,/);
  assert.doesNotMatch(welcomeBlock, /<Navigate to="\/login"/);
});

test('routes.jsx: / continua redirecionando (agora para /welcome, a nova primeira tela -- nunca direto para /login)', async () => {
  const routes = await readFile(new URL('../../app/routes.jsx', import.meta.url), 'utf8');
  const rootBlock = routes.slice(
    routes.indexOf("path: '/',"),
    routes.indexOf("path: '/welcome'"),
  );
  assert.match(rootBlock, /<Navigate to="\/welcome" replace \/>/);
});

test('routes.jsx: /cadastro reaproveita o MobileAuthPage já existente via ?mode=signup -- nunca um formulário de cadastro duplicado', async () => {
  const routes = await readFile(new URL('../../app/routes.jsx', import.meta.url), 'utf8');
  const signupBlock = routes.slice(
    routes.indexOf("path: '/cadastro'"),
    routes.indexOf("path: '/cadastro'") + 200,
  );
  assert.match(signupBlock, /element: <Navigate to="\/login\?mode=signup" replace \/>,/);
});

test('/cadastro e /welcome estão registradas em publicRoutes -- acessíveis sem sessão', async () => {
  const routes = await readFile(new URL('../../app/routes.jsx', import.meta.url), 'utf8');
  const publicBlock = routes.slice(routes.indexOf('export const publicRoutes'), routes.indexOf('export const appRoutes'));
  assert.match(publicBlock, /path: '\/cadastro'/);
  assert.match(publicBlock, /path: '\/welcome'/);
});

// ============================================================================
// BUGFIX (estado preso ao voltar do Google): signInWithGoogle() navega o
// documento inteiro para accounts.google.com -- ao apertar "voltar" ANTES
// de concluir o OAuth, o Chromium (bfcache) restaura a página exatamente
// como estava, com isGoogleLoading ainda `true` -- o componente nunca
// desmonta/remonta, então um efeito de montagem comum nunca dispara. A
// correção ouve `pageshow` (event.persisted === true, sinal oficial do
// navegador para restauração via bfcache) e `visibilitychange` como rede
// de segurança, sempre no nível de window/document, com cleanup no
// unmount. Nenhum dos dois dispara um novo OAuth sozinho.
// ============================================================================

test('1. clique em "Já tenho conta" ativa isGoogleLoading antes de chamar startGoogleAuth', async () => {
  const page = await source('./pages/WelcomeDecisionPage.jsx');
  const clickHandlerBody = page.slice(
    page.indexOf('async function handleExistingUserClick'),
    page.indexOf('return (\n    <main'),
  );
  const loadingIdx = clickHandlerBody.indexOf('setIsGoogleLoading(true);');
  const callIdx = clickHandlerBody.indexOf('await startGoogleAuth(');
  assert.ok(loadingIdx !== -1 && callIdx !== -1 && loadingIdx < callIdx);
});

test('2. pageshow com event.persisted === true reseta isGoogleLoading para false', async () => {
  const page = await source('./pages/WelcomeDecisionPage.jsx');
  const effectBody = page.slice(page.indexOf('useEffect(() => {'), page.indexOf('}, []);'));
  assert.match(effectBody, /function handlePageShow\(event\) \{\s*\n\s*if \(event\.persisted\) \{\s*\n\s*resetGoogleLoadingState\(\);/);
  assert.match(effectBody, /function resetGoogleLoadingState\(\) \{\s*\n\s*setIsGoogleLoading\(\(wasLoading\) => \{[\s\S]*?return false;/);
  assert.match(effectBody, /window\.addEventListener\('pageshow', handlePageShow\);/);
});

test('3. retorno por bfcache desbloqueia os dois cards -- ambos usam disabled={isGoogleLoading}, nunca uma flag independente por card', async () => {
  const page = await source('./pages/WelcomeDecisionPage.jsx');
  const disabledMatches = page.match(/disabled={isGoogleLoading}/g) ?? [];
  assert.equal(disabledMatches.length, 2, 'os dois cards (existing e new) devem depender do mesmo isGoogleLoading');
});

test('4. "Criar conta" nunca fica preso -- seu onClick navega incondicionalmente para /cadastro, independente de qualquer estado de OAuth', async () => {
  const page = await source('./pages/WelcomeDecisionPage.jsx');
  assert.match(page, /data-option={NEW_ACCOUNT_OPTION\.id}[\s\S]{0,150}onClick={\(\) => navigate\(NEW_ACCOUNT_OPTION\.to\)}/);
});

test('5. depois do reset, "Já tenho conta" pode ser clicado de novo -- handleExistingUserClick só bloqueia enquanto isGoogleLoading for true', async () => {
  const page = await source('./pages/WelcomeDecisionPage.jsx');
  const clickHandlerBody = page.slice(
    page.indexOf('async function handleExistingUserClick'),
    page.indexOf('return (\n    <main'),
  );
  assert.match(clickHandlerBody, /if \(isGoogleLoading\) return;/);
});

test('6. pageshow SEM persisted (carregamento normal) nunca reseta loading nem dispara qualquer comportamento -- guard explícito em event.persisted', async () => {
  const page = await source('./pages/WelcomeDecisionPage.jsx');
  const effectBody = page.slice(page.indexOf('useEffect(() => {'), page.indexOf('}, []);'));
  // handlePageShow só chama resetGoogleLoadingState DENTRO do if
  // (event.persisted) -- nunca incondicionalmente.
  const handlePageShowBody = effectBody.slice(
    effectBody.indexOf('function handlePageShow'),
    effectBody.indexOf('function handleVisibilityChange'),
  );
  assert.doesNotMatch(handlePageShowBody.replace(/if \(event\.persisted\) \{[\s\S]*?\}/, ''), /resetGoogleLoadingState\(\)/);
});

test('7. listeners de pageshow e visibilitychange são removidos no cleanup do useEffect -- nunca duplicados entre montagens', async () => {
  const page = await source('./pages/WelcomeDecisionPage.jsx');
  const effectBody = page.slice(page.indexOf('useEffect(() => {'), page.indexOf('}, []);'));
  assert.match(effectBody, /return \(\) => \{\s*\n\s*window\.removeEventListener\('pageshow', handlePageShow\);\s*\n\s*document\.removeEventListener\('visibilitychange', handleVisibilityChange\);\s*\n\s*\};/);
  // Deps vazias -- o efeito roda uma única vez por montagem (nunca
  // re-adiciona listeners a cada render).
  assert.match(page, /\}, \[\]\);\s*\n\s*\n\s*\/\/ LOADING E DUPLO CLIQUE/);
});

test('8. duplo clique continua bloqueado durante a tentativa atual (comportamento pré-existente preservado)', async () => {
  const page = await source('./pages/WelcomeDecisionPage.jsx');
  assert.match(page, /data-option="existing"[\s\S]{0,150}disabled={isGoogleLoading}/);
});

test('9. erro normal do OAuth (catch/mensagem síncrona) também limpa isGoogleLoading -- mesmo caminho de reset usado nos dois cenários', async () => {
  const page = await source('./pages/WelcomeDecisionPage.jsx');
  const clickHandlerBody = page.slice(
    page.indexOf('async function handleExistingUserClick'),
    page.indexOf('return (\n    <main'),
  );
  assert.match(clickHandlerBody, /if \(result\.message\) \{\s*\n\s*setFeedback\(result\.message\);\s*\n\s*setIsGoogleLoading\(false\);/);
  assert.match(clickHandlerBody, /catch \{\s*\n\s*setFeedback\('Não foi possível entrar com o Google\. Tente novamente\.'\);\s*\n\s*setIsGoogleLoading\(false\);/);
});

test('10. autenticação concluída com sucesso não é afetada -- reset de bfcache só mexe em estado local (isGoogleLoading/feedback), nunca em sessão/callback', async () => {
  const page = await source('./pages/WelcomeDecisionPage.jsx');
  const effectBody = page.slice(page.indexOf('useEffect(() => {'), page.indexOf('}, []);'));
  assert.doesNotMatch(effectBody, /useSession|signOut|consumeAuthReturnPath|navigate\(/);
  // AuthCallbackPage.jsx continua sendo o único responsável por decidir o
  // destino pós-sessão -- não alterado por esta correção.
  const callback = await readFile(new URL('../../pages/AuthCallbackPage.jsx', import.meta.url), 'utf8');
  assert.match(callback, /const destination = consumeAuthReturnPath\(\);/);
});

test('12. nenhuma chamada OAuth é disparada automaticamente no retorno -- resetGoogleLoadingState nunca chama startGoogleAuth', async () => {
  const page = await source('./pages/WelcomeDecisionPage.jsx');
  const effectBody = page.slice(page.indexOf('useEffect(() => {'), page.indexOf('}, []);'));
  assert.doesNotMatch(effectBody, /startGoogleAuth/);
});

test('11. usuário sem sessão (bfcache reset ou não) nunca é enviado para /plano-pessoal -- só App.jsx decide isso, sempre depois de sessão real confirmada', async () => {
  const app = await readFile(new URL('../../app/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /if \(isSupabaseConfigured\) \{\s*\n\s*if \(!session \|\| sessionError\) \{/);
  const loginGuardIdx = app.indexOf('if (!session || sessionError) {');
  const personalPlanGuardIdx = app.indexOf('presentationUserId\n    && !personalPlanUnlocked\n    && !isPersonalPlanRoute');
  assert.ok(loginGuardIdx !== -1 && personalPlanGuardIdx !== -1 && loginGuardIdx < personalPlanGuardIdx);
});
