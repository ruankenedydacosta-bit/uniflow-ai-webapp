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
  assert.match(page, /title: 'Já tenho conta',\s*\n\s*description: 'Entre com seu e-mail ou com o Google\.',\s*\n\s*to: '\/login',/);
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
// "Já tenho conta" abre a tela de login (/login), onde há e-mail e senha e o
// Google. Antes o card chamava o Google direto: quem usa e-mail e senha não
// tinha como entrar, e o card ficava preso em "Abrindo Google..." quando o
// redirecionamento não acontecia (por exemplo, sem Supabase configurado).
// ============================================================================

test('"Já tenho conta" navega para /login levando o destino de retorno -- nunca dispara o OAuth na própria tela', async () => {
  const page = await source('./pages/WelcomeDecisionPage.jsx');
  const clickHandlerBody = page.slice(
    page.indexOf('function handleExistingUserClick'),
    page.indexOf('return (\n    <main'),
  );
  assert.match(clickHandlerBody, /navigate\(EXISTING_ACCOUNT_OPTION\.to, \{ state: \{ from: location\.state\?\.from \} \}\);/);
  assert.match(page, /data-option=\{EXISTING_ACCOUNT_OPTION\.id\}[\s\S]{0,80}onClick=\{handleExistingUserClick\}/);
  assert.doesNotMatch(page, /useGoogleAuthRedirect|startGoogleAuth|Abrindo Google|isGoogleLoading/);
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

test('useGoogleAuthRedirect é a ÚNICA implementação real do OAuth Google -- LoginPage.jsx usa o hook e nenhuma tela chama o Supabase direto', async () => {
  const hook = await source('./useGoogleAuthRedirect.js');
  assert.match(hook, /import { useSession } from '\.\.\/\.\.\/app\/SessionContext\.jsx';/);
  assert.match(hook, /const \{ signInWithGoogle \} = useSession\(\);/);
  assert.match(hook, /await signInWithGoogle\(\)/);
  assert.match(hook, /getGoogleAuthFeedback\(result\?\.error \?\? \(unavailable \? \{ code: 'UNAVAILABLE' \} : null\)\)/);

  const loginPage = await source('../../pages/LoginPage.jsx');
  const welcomePage = await source('./pages/WelcomeDecisionPage.jsx');
  assert.match(loginPage, /from '\.\.\/features\/auth-mobile\/useGoogleAuthRedirect\.js';/);
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

// Sem Supabase configurado, signInWithGoogle devolve isConfigured: false e
// nenhum erro. O hook transforma isso em mensagem; sem ela, a tela de login
// ficava esperando um redirecionamento que nunca acontece.
test('Google indisponível (isConfigured: false) vira mensagem e limpa o marcador do GA4 -- a tela nunca fica esperando', async () => {
  const hook = await source('./useGoogleAuthRedirect.js');
  assert.match(hook, /const unavailable = result\?\.isConfigured === false;/);
  assert.match(hook, /if \(result\?\.error \|\| unavailable\) clearPendingGa4GoogleAuth\(\);/);
});

test('11. usuário sem sessão (bfcache reset ou não) nunca é enviado para /plano-pessoal -- só App.jsx decide isso, sempre depois de sessão real confirmada', async () => {
  const app = await readFile(new URL('../../app/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /if \(isSupabaseConfigured\) \{\s*\n\s*if \(!session \|\| sessionError\) \{/);
  const loginGuardIdx = app.indexOf('if (!session || sessionError) {');
  const personalPlanGuardIdx = app.indexOf('presentationUserId\n    && !personalPlanUnlocked\n    && !isPersonalPlanRoute');
  assert.ok(loginGuardIdx !== -1 && personalPlanGuardIdx !== -1 && loginGuardIdx < personalPlanGuardIdx);
});
