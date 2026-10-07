import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('splash sai quando o React desenha, com fallback temporal e restauração pageshow para não prender a tela no Safari', async () => {
  const html = await source('../../index.html');
  assert.match(html, /window\.uniflowHideSplash = hideSplash;/);
  assert.match(html, /window\.addEventListener\('pageshow'/);
  assert.match(html, /if \(event\.persisted\) hideSplash\(\)/);
  assert.match(html, /window\.setTimeout\(hideSplash, 8000\)/);
  const app = await source('App.jsx');
  assert.match(app, /useEffect\(\(\) => \{\s*\n\s*window\.uniflowHideSplash\?\.\(\);\s*\n\s*\}, \[\]\);/);
});

test('splash mostra a Uni girando sem baixar imagem, com o fundo de cada tema', async () => {
  const html = await source('../../index.html');
  assert.doesNotMatch(html, /uniflow-splash\.png/);
  assert.match(html, /<span class="ring"><\/span>/);
  assert.match(html, /\[data-theme="light"\] #uniflow-splash \{ background: #F5F7FB; \}/);
  assert.match(html, /\[data-theme="dark"\] #uniflow-splash \{ background: #111318; \}/);
});

test('documento declara instalação standalone e ícone oficial para iOS', async () => {
  const html = await source('../../index.html');
  assert.match(html, /name="viewport"[\s\S]{0,100}viewport-fit=cover/);
  assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/);
  assert.match(html, /name="apple-mobile-web-app-status-bar-style" content="black-translucent"/);
  assert.match(html, /rel="apple-touch-icon" href="\/uniflow-app-icon\.png"/);
});

test('Vercel possui fallback SPA para deep links do React Router', async () => {
  const config = JSON.parse(await source('../../vercel.json'));
  assert.deepEqual(config.rewrites, [{ source: '/(.*)', destination: '/index.html' }]);

  const routes = await source('routes.jsx');
  for (const path of ['/login', '/uni-ai', '/suporte', '/financeiro']) {
    assert.ok(routes.includes(`path: '${path}'`));
  }
});

// ============================================================================
// MVP FECHAMENTO -- nenhuma rota legada (dashboard, financeiro, CRM,
// clientes, projetos, agenda, relatórios, configurações, seletor PF/PJ)
// pode renderizar, nem mesmo para quem já pagou. O antigo guard de
// contexto (canAccessRouteInContext/getFallbackRoute) e o render do
// <AuthenticatedLayout> legado foram REMOVIDOS de App.jsx -- toda rota que
// não é standalone (apresentação/Plano Pessoal) nem simplificada cai direto
// na Home simplificada. O código legado (routes.jsx, AuthenticatedLayout,
// accessRules.js, navigation.js) continua existindo no repo só para
// preservação futura, mas App.jsx nunca mais o renderiza.
// ============================================================================

test('guard de contexto (PF/PJ) legado foi removido de App.jsx -- nenhuma rota cai mais no AuthenticatedLayout/canAccessRouteInContext', async () => {
  const content = await source('App.jsx');
  assert.doesNotMatch(content, /canAccessRouteInContext\(|canAccessRoute\(|getFallbackRoute\(|<AuthenticatedLayout|navigationItems|activeNavigationItem/);
});

test('nenhuma troca de workspace automática acontece dentro do guard -- App.jsx só redireciona, nunca chama switchWorkspace', async () => {
  const content = await source('App.jsx');
  assert.doesNotMatch(content, /switchWorkspace/);
});

// ============================================================================
// UX6 -- fallback de rota legada/desconhecida (ex.: /dashboard, /crm, ou
// qualquer path removido). Autenticado com apresentação e assinatura em dia
// cai sempre na Home simplificada, NUNCA no dashboard legado; não-autenticado
// continua protegido pelo guard de login, que roda ANTES de qualquer
// wildcard -- sem tela branca, sem loop.
// ============================================================================

test('fallback final de App.jsx nunca é /dashboard -- qualquer rota legada ou desconhecida (com guards já resolvidos) volta para a Home simplificada', async () => {
  const content = await source('App.jsx');
  const finalReturnIdx = content.lastIndexOf('return <Navigate to={SIMPLIFIED_ROUTES.HOME} replace />;');
  assert.ok(finalReturnIdx > content.indexOf('if (activeRoute?.simplified)'));
  assert.doesNotMatch(content, /Navigate to="\/dashboard"|Navigate to=\{['"`]\/dashboard/);
});

test('guard de login roda ANTES do fallback final -- usuário não autenticado em rota inexistente nunca alcança a Home simplificada sem logar', async () => {
  const content = await source('App.jsx');
  const loginGuardIndex = content.indexOf("if (!session || sessionError)");
  const finalReturnIndex = content.lastIndexOf('return <Navigate to={SIMPLIFIED_ROUTES.HOME} replace />;');
  assert.ok(loginGuardIndex >= 0 && finalReturnIndex >= 0);
  assert.ok(loginGuardIndex < finalReturnIndex, 'guard de login deve vir antes do fallback final');
});

test('fallback nunca redireciona para a própria rota inexistente -- sem possibilidade de loop (Home simplificada é sempre um destino diferente e válido)', async () => {
  const content = await source('App.jsx');
  assert.doesNotMatch(content, /Navigate to=\{location\.pathname\}/);
});

// ============================================================================
// AUTH4 -- rota pública /auth/callback (retorno do login com Google) e label
// de loading mais preciso enquanto o OAuth está sendo processado. O guard de
// isSessionLoading em si (que já bloqueia toda a árvore de rotas durante o
// bootstrap) não foi restruturado -- só o label do Loader passou a variar
// por pathname.
// ============================================================================

test('/auth/callback está registrada em publicRoutes (routes.jsx), pública -- não exige sessão antes de processar o retorno do OAuth', async () => {
  const content = await source('routes.jsx');
  assert.match(
    content,
    /path: '\/auth\/callback',\s*\n\s*label: 'Concluindo acesso',\s*\n\s*title: 'Concluindo acesso',\s*\n\s*element: <AuthCallbackPage \/>,/,
  );
});

test('Loader mostra "Concluindo acesso…" especificamente em /auth/callback, sem alterar o guard de isSessionLoading', async () => {
  const content = await source('App.jsx');
  assert.match(content, /if \(isSupabaseConfigured && isSessionLoading\) \{/);
  assert.match(
    content,
    /label=\{location\.pathname === '\/auth\/callback' \? 'Concluindo acesso…' : 'Carregando sua sessão'\}/,
  );
});

test('guard preserva rota protegida e query string para retorno após login', async () => {
  const content = await source('App.jsx');
  assert.match(content, /const from = activeRoute/);
  assert.match(content, /`\$\{location\.pathname\}\$\{location\.search\}`/);
  assert.match(content, /<Navigate to="\/login" replace state=\{\{ from \}\} \/>/);
});

test('rota inválida nunca vira destino pós-login (nunca o dashboard legado)', async () => {
  const content = await source('App.jsx');
  assert.match(content, /const from = activeRoute[\s\S]*?: SIMPLIFIED_ROUTES\.HOME;/);
  assert.match(content, /getSafeAuthReturnPath\(location\.state\?\.from\)/);
});

test('usuário autenticado no login passa pela apresentação e pelo Plano Pessoal, sem questionário legado', async () => {
  const content = await source('App.jsx');
  assert.match(
    content,
    /personalPlanUnlocked[\s\S]{0,20}\? requestedReturnPath[\s\S]{0,20}: !presentationCompleted[\s\S]{0,20}\? PRESENTATION_ROUTE[\s\S]{0,20}: PERSONAL_PLAN_ROUTE/,
  );
  assert.doesNotMatch(content, /to=\{needsOnboarding \? '\/onboarding'/);
});

// ============================================================================
// GUARD FIX: personalPlanCompleted (localStorage) deixou de ser autorização
// -- App.jsx redirecionava alguns usuários direto para /app/home mesmo sem
// assinatura real em billing_customers/subscriptions. Única fonte de
// verdade agora é billing-get-subscription (via usePersonalPlanAccessGuard):
// internal_status === 'active' libera; exists:false/pending/canceled/
// expired/past_due/suspended bloqueia -- o cache local nunca decide (só
// usado como fallback no modo demo, sem Supabase configurado).
// ============================================================================

// GUARD FIX (troca de dispositivo/sessão restaurada): o guard NÃO depende
// mais de presentationCompleted -- um assinante ativo num navegador/
// dispositivo novo (cache limpo, reinstalação) precisa ter a assinatura
// consultada assim que a sessão é conhecida, nunca depois de uma
// apresentação que ele nunca viu ali. workspaceId também usa o resolver
// compartilhado (workspace do tipo "personal"), nunca o workspace
// "atual/ativo" (workspace.id), que pode divergir dele.
test('guard real: usePersonalPlanAccessGuard só roda com backend real configurado e sessão resolvida -- independe de presentationCompleted, usa o workspace pessoal', async () => {
  const content = await source('App.jsx');
  assert.match(content, /usePersonalPlanAccessGuard,\s*\n\} from '\.\.\/features\/personal-plan';/);
  assert.match(
    content,
    /const personalPlanGuardEnabled = Boolean\(\s*\n\s*isSupabaseConfigured && !isSessionLoading && presentationUserId,\s*\n\s*\);/,
  );
  assert.doesNotMatch(content, /personalPlanGuardEnabled = Boolean\([^)]*presentationCompleted/);
  assert.match(content, /const personalWorkspaceId = resolvePersonalWorkspaceId\(availableWorkspaces, workspace\);/);
  assert.match(content, /workspaceId: personalWorkspaceId,/);
  assert.match(content, /revalidateWhenLeavingRoute: isPersonalPlanRoute,/);
});

test('guard real: personalPlanUnlocked só é true com internal_status === "active" confirmado agora -- nunca com o cache local quando o backend está configurado', async () => {
  const content = await source('App.jsx');
  assert.match(
    content,
    /const personalPlanUnlocked = isSupabaseConfigured\s*\n\s*\? personalPlanAccessStatus === 'active'\s*\n\s*: personalPlanCompleted;/,
  );
});

test('guard real: "loading"/"idle" nunca decidem -- nem redirecionam para /plano-pessoal nem liberam /app/home antes da consulta real terminar (evita flicker)', async () => {
  const content = await source('App.jsx');
  assert.match(
    content,
    /const personalPlanAccessLoading = personalPlanGuardEnabled\s*\n\s*&& \(personalPlanAccessStatus === 'loading' \|\| personalPlanAccessStatus === 'idle'\);/,
  );
  // Bloco pós-login (/, /welcome, /login): loading nunca decide sozinho.
  assert.match(content, /if \(personalPlanAccessLoading\) \{\s*\n\s*return <AppBootScreen label="Verificando sua assinatura…" \/>;/);
  // Bloco de rotas protegidas: mesmo guard, agora incondicional a
  // presentationCompleted (ver GUARD FIX de troca de dispositivo).
  const idx = content.indexOf('// GUARD FIX (troca de dispositivo/sessão restaurada): a consulta de');
  assert.ok(idx !== -1);
  const slice = content.slice(idx, idx + 700);
  assert.match(slice, /personalPlanAccessLoading\s*\n\s*\) \{\s*\n\s*return <AppBootScreen label="Verificando sua assinatura…" \/>;/);
});

test('resolvePersonalPlanAccess: exists:false, pending, canceled, expired, past_due e suspended bloqueiam -- só "active" libera', async () => {
  const resolver = await source('../features/personal-plan/resolvePersonalPlanAccess.js');
  assert.match(resolver, /if \(!subscriptionData \|\| subscriptionData\.exists === false\) return 'blocked';/);
  assert.match(resolver, /return subscriptionData\.internal_status === 'active' \? 'active' : 'blocked';/);
});

test('usePersonalPlanAccessGuard: erro de rede/backend nunca libera acesso sem confirmação real', async () => {
  const hook = await source('../features/personal-plan/usePersonalPlanAccessGuard.js');
  assert.match(hook, /setStatus\(error \? 'blocked' : resolvePersonalPlanAccess\(data\)\);/);
});

// ============================================================================
// BUGFIX -- redirecionamento pós-login abrindo o shell legado (/dashboard,
// seletor PF/PJ, navegação Home/Financeiro/Uni/Agenda/Mais) em vez da
// experiência simplificada Pessoal. Causa raiz: DEFAULT_RETURN_PATH em
// authReturnPath.js apontava para '/dashboard' e não havia guard algum para
// o Plano Pessoal pendente -- qualquer usuário com apresentação concluída
// caía direto no shell antigo. Testes abaixo provam a resolução única
// pós-auth (apresentação -> plano pessoal -> Home simplificada).
// ============================================================================

test('REGRESSÃO: destino padrão pós-login nunca é o shell legado (/dashboard)', async () => {
  const content = await source('authReturnPath.js');
  assert.match(content, /const DEFAULT_RETURN_PATH = SIMPLIFIED_ROUTES\.HOME;/);
  assert.doesNotMatch(content, /const DEFAULT_RETURN_PATH = '\/dashboard';/);
});

test('rota de retorno pós-login aceita destinos simplificados (Home, Registros, Conta e subpáginas)', async () => {
  const content = await source('authReturnPath.js');
  assert.match(content, /import \{ SIMPLIFIED_ROUTES \} from '\.\.\/features\/simplified-app\/simplifiedRoutes\.js';/);
  assert.match(content, /import \{ ACCOUNT_SUBROUTES \} from '\.\.\/features\/simplified-app\/simplifiedAccountRoutes\.js';/);
  assert.match(content, /\.\.\.Object\.values\(SIMPLIFIED_ROUTES\),/);
  assert.match(content, /\.\.\.Object\.values\(ACCOUNT_SUBROUTES\)\.map\(\(subroute\) => subroute\.path\),/);
});

test('usuário com apresentação concluída e Plano Pessoal pendente é forçado para /plano-pessoal, nunca para o dashboard legado', async () => {
  const content = await source('App.jsx');
  assert.match(
    content,
    /if \(\s*\n\s*presentationUserId\s*\n\s*&& !personalPlanUnlocked\s*\n\s*&& !isPersonalPlanRoute\s*\n\s*&& !isPresentationRoute\s*\n\s*\) \{\s*\n\s*return <Navigate to=\{PERSONAL_PLAN_ROUTE\} replace \/>;/,
  );
});

test('revisitar /plano-pessoal já concluído nunca reabre o formulário -- vai direto para a Home simplificada', async () => {
  const content = await source('App.jsx');
  assert.match(
    content,
    /if \(isPersonalPlanRoute && personalPlanUnlocked\) \{\s*\n\s*return <Navigate to=\{SIMPLIFIED_ROUTES\.HOME\} replace \/>;/,
  );
});

// BLOCO ASAAS CHECKOUT: sem esta isenção, o usuário voltando do Checkout de
// cartão seria bounced de volta para /plano-pessoal ANTES de ver a
// confirmação -- o acesso só libera depois que a própria tela de retorno
// confirma o pagamento via billing-get-subscription.
test('rota de retorno do Checkout (/plano-pessoal/retorno) é isenta do guard de Plano Pessoal pendente -- nunca faz bounce antes de confirmar o pagamento', async () => {
  const content = await source('App.jsx');
  assert.match(content, /from '\.\.\/features\/personal-plan';\s*$/m);
  assert.match(
    content,
    /const isPersonalPlanRoute = location\.pathname === PERSONAL_PLAN_ROUTE\s*\n\s*\|\| location\.pathname === PERSONAL_PLAN_RETURN_ROUTE;/,
  );
});

test('Plano Pessoal concluído é persistido por usuário (mesmo padrão do presentationStorage.js), sem tocar em preço ou plano', async () => {
  const storage = await source('../features/personal-plan/personalPlanStorage.js');
  assert.match(storage, /export function isPersonalPlanCompleted\(/);
  assert.match(storage, /export function markPersonalPlanCompleted\(/);
  const page = await source('../features/personal-plan/PersonalPlanPage.jsx');
  const promotionCard = await source('../features/personal-plan/PlanPromotionCard.jsx');
  const config = await source('../features/personal-plan/personalPlanConfig.js');
  assert.match(page, /markPersonalPlanCompleted\(userId\)/);
  assert.match(promotionCard, /PERSONAL_PLAN_TIERS/);
  assert.match(config, /export const PERSONAL_PLAN_PRICE_LABEL = /);
});

test('guard do Plano Pessoal independe do workspace Business/PF-PJ -- workspace stale não altera o fluxo Pessoal (usa sempre o workspace pessoal resolvido)', async () => {
  const content = await source('App.jsx');
  const finalReturnIdx = content.lastIndexOf('return <Navigate to={SIMPLIFIED_ROUTES.HOME} replace />;');
  const guardBlock = content.slice(
    content.indexOf('if (\n    presentationUserId\n    && !isPersonalPlanRoute\n    && !isPresentationRoute\n    && personalPlanAccessLoading'),
    finalReturnIdx,
  );
  assert.ok(guardBlock.length > 0);
  assert.doesNotMatch(guardBlock, /currentWorkspace/);
});

test('guard do Plano Pessoal roda antes dos guards de standalone/simplificado/fallback final', async () => {
  const content = await source('App.jsx');
  const finalReturnIdx = content.lastIndexOf('return <Navigate to={SIMPLIFIED_ROUTES.HOME} replace />;');
  assert.ok(
    content.indexOf('!personalPlanUnlocked') < content.indexOf('activeRoute?.standalone'),
  );
  assert.ok(
    content.indexOf('!personalPlanUnlocked') < content.indexOf('activeRoute?.simplified'),
  );
  assert.ok(
    content.indexOf('!personalPlanUnlocked') < finalReturnIdx,
  );
});

test('rota catch-all autenticada da experiência simplificada nunca abre o shell legado', async () => {
  const content = await source('App.jsx');
  const finalReturnIdx = content.lastIndexOf('return <Navigate to={SIMPLIFIED_ROUTES.HOME} replace />;');
  const simplifiedBlock = content.slice(
    content.indexOf('if (activeRoute?.simplified)'),
    finalReturnIdx,
  );
  assert.match(simplifiedBlock, /<Route path="\*" element=\{<Navigate to=\{SIMPLIFIED_ROUTES\.HOME\} replace \/>\} \/>/);
  assert.doesNotMatch(simplifiedBlock, /Navigate to="\/dashboard"|Navigate to=\{['"`]\/dashboard/);
});

test('usuário sem sessão entra por / -> /welcome (tela de decisão) -> /login, sem renderizar a apresentação pública antiga', async () => {
  const routes = await source('routes.jsx');
  const rootRoute = routes.slice(routes.indexOf("path: '/'"), routes.indexOf("path: '/welcome'"));
  const welcomeRoute = routes.slice(routes.indexOf("path: '/welcome'"), routes.indexOf("path: '/login'"));
  assert.match(rootRoute, /<Navigate to="\/welcome" replace \/>/);
  assert.match(welcomeRoute, /<WelcomeDecisionPage \/>/);
  assert.doesNotMatch(routes, /MobileWelcomePage|WelcomeCarousel/);
});

test('remoção de /welcome preserva apresentação pós-login, Plano Pessoal e Home simplificada', async () => {
  const routes = await source('routes.jsx');
  assert.match(routes, /path: '\/apresentacao'/);
  assert.match(routes, /path: '\/plano-pessoal'/);
  assert.match(routes, /path: SIMPLIFIED_ROUTES\.HOME/);
  assert.match(routes, /path: SIMPLIFIED_ROUTES\.UNI/);
});

test('rotas legadas Business e Enterprise permanecem registradas', async () => {
  const routes = await source('routes.jsx');
  for (const path of ['/dashboard', '/uni-ai', '/financeiro', '/crm', '/clientes', '/projetos']) {
    assert.match(routes, new RegExp(`path: '${path.replace('/', '\\/')}'`));
  }
});

test('SessionContext persiste conversationStyle e reflete a resposta imediatamente no profile local', async () => {
  const session = await source('SessionContext.jsx');
  assert.match(session, /const updateConversationStyle = useCallback/);
  assert.match(session, /conversation_style: nextStyle/);
  assert.match(session, /setState\(\(currentState\) => \(\{/);
  assert.match(session, /conversation_style: conversationStyle/);
  assert.match(session, /updateConversationStyle,/);
});

test('SessionContext persiste provider de voz e estilo de conversa em uma única preferência', async () => {
  const session = await source('SessionContext.jsx');
  assert.match(session, /const updateVoicePreferences = useCallback/);
  assert.match(session, /conversation_style: conversationStyle/);
  assert.match(session, /voice_provider: voiceProvider/);
  assert.match(session, /voice_provider: resolveVoiceProvider\(result\.data\.voice_provider\)/);
  assert.match(session, /updateVoicePreferences,/);
});

test('apresentação é protegida, standalone e anterior ao fallback final', async () => {
  const app = await source('App.jsx');
  const routes = await source('routes.jsx');
  assert.match(routes, /path: '\/apresentacao'/);
  assert.match(routes, /standalone: true/);
  const finalReturnIdx = app.lastIndexOf('return <Navigate to={SIMPLIFIED_ROUTES.HOME} replace />;');
  assert.ok(app.indexOf('!presentationCompleted') < finalReturnIdx);
  assert.match(app, /if \(activeRoute\?\.standalone\)/);
});

// ============================================================================
// REMOÇÃO DO ONBOARDING LEGADO -- fluxo oficial e único: Login/Cadastro ->
// /apresentacao -> /plano-pessoal -> pagamento -> /app/home só com
// assinatura ativa. Nenhuma rota, guard, componente ou referência ao
// onboarding antigo (Boas-vindas, Modo de uso, Objetivo, Situação
// financeira, Tom da Uni, Resumo) pode sobreviver.
// ============================================================================

test('acesso manual a /onboarding nunca renderiza onboarding -- rota não existe mais e cai no catch-all público', async () => {
  const routes = await source('routes.jsx');
  const app = await source('App.jsx');
  assert.doesNotMatch(routes, /path: '\/onboarding'/);
  assert.doesNotMatch(routes, /OnboardingPage/);
  assert.doesNotMatch(app, /'\/onboarding'/);
  // /onboarding não está em publicRoutes nem em appRoutes, então cai no
  // catch-all "*" de publicRoutes (usuário sem sessão) ou no de appRoutes
  // (usuário autenticado) -- nunca em uma tela de onboarding.
  const publicBlock = routes.slice(routes.indexOf('export const publicRoutes'), routes.indexOf('export const appRoutes'));
  assert.doesNotMatch(publicBlock, /onboarding/i);
});

test('login/cadastro por e-mail ou Google decide o destino inicial apenas pelos guards atuais (apresentação -> Plano Pessoal -> Home só com assinatura ativa)', async () => {
  const app = await source('App.jsx');
  // O guard pós-login em App.jsx roda para QUALQUER sessão válida chegando
  // em /, /welcome ou /login -- independe do provedor (e-mail/senha ou
  // Google via /auth/callback), então cadastro por Google também cai aqui.
  assert.match(
    app,
    /\['\/', '\/welcome', '\/login'\]\.includes\(location\.pathname\)\s*\n\s*&& session\s*\n\s*&& !sessionError/,
  );
  assert.match(
    app,
    /personalPlanUnlocked[\s\S]{0,20}\? requestedReturnPath[\s\S]{0,20}: !presentationCompleted[\s\S]{0,20}\? PRESENTATION_ROUTE[\s\S]{0,20}: PERSONAL_PLAN_ROUTE/,
  );
  assert.doesNotMatch(app, /needsOnboarding|onboardingCompleted|onboardingService|onboardingConstants/);
});

test('SessionContext não expõe mais needsOnboarding -- workspace pessoal continua sendo criado automaticamente, sem perguntar nada ao usuário', async () => {
  const session = await source('SessionContext.jsx');
  assert.doesNotMatch(session, /needsOnboarding/);
  assert.doesNotMatch(session, /onboarding_completed/);
});

test('src/features/onboarding foi removido -- nenhum arquivo do onboarding legado (StepWelcome/StepMode/StepGoal/StepFinancial/StepTone/StepSummary) permanece no bundle', async () => {
  const { existsSync } = await import('node:fs');
  const featureDir = new URL('../features/onboarding', import.meta.url);
  assert.equal(existsSync(featureDir), false);
});

test('usuário 100% novo (Google ou e-mail) nunca alcança Dashboard/Home direto -- qualquer appRoute cai no guard de apresentação antes de renderizar', async () => {
  const app = await source('App.jsx');
  // Guard incondicional: roda para QUALQUER pathname protegido (não só
  // /dashboard ou /app/home) sempre que a apresentação não foi concluída
  // para o usuário autenticado -- não existe caminho de appRoutes que o
  // contorne, porque ele vem ANTES do bloco final que renderiza rotas.
  const presentationGuardIdx = app.indexOf(
    "presentationUserId\n    && !presentationCompleted\n    && !personalPlanUnlocked\n    && !isPresentationRoute",
  );
  const finalReturnIdx = app.lastIndexOf('return <Navigate to={SIMPLIFIED_ROUTES.HOME} replace />;');
  const simplifiedRenderIdx = app.indexOf('<SimplifiedAuthenticatedLayout>');
  const standaloneRenderIdx = app.indexOf('activeRoute?.standalone');
  assert.ok(presentationGuardIdx !== -1, 'guard de apresentação não encontrado em App.jsx');
  assert.ok(presentationGuardIdx < finalReturnIdx);
  assert.ok(presentationGuardIdx < simplifiedRenderIdx);
  assert.ok(presentationGuardIdx < standaloneRenderIdx);
  assert.match(app, /if \(\s*presentationUserId\s*&& !presentationCompleted\s*&& !personalPlanUnlocked\s*&& !isPresentationRoute\s*\) \{\s*return <Navigate to=\{PRESENTATION_ROUTE\} replace \/>;/);
});

test('usuário novo com apresentação concluída mas sem assinatura ativa nunca alcança Home direto -- guard de Plano Pessoal vem antes do fallback final', async () => {
  const app = await source('App.jsx');
  const personalPlanGuardIdx = app.indexOf(
    'presentationUserId\n    && !personalPlanUnlocked\n    && !isPersonalPlanRoute\n    && !isPresentationRoute',
  );
  const finalReturnIdx = app.lastIndexOf('return <Navigate to={SIMPLIFIED_ROUTES.HOME} replace />;');
  const simplifiedRenderIdx = app.indexOf('<SimplifiedAuthenticatedLayout>');
  assert.ok(personalPlanGuardIdx !== -1, 'guard de Plano Pessoal não encontrado em App.jsx');
  assert.ok(personalPlanGuardIdx < finalReturnIdx);
  assert.ok(personalPlanGuardIdx < simplifiedRenderIdx);
  assert.match(app, /if \(\s*presentationUserId\s*&& !personalPlanUnlocked\s*&& !isPersonalPlanRoute\s*&& !isPresentationRoute\s*\) \{\s*return <Navigate to=\{PERSONAL_PLAN_ROUTE\} replace \/>;/);
});

test('nenhum usuário autenticado, apresentado e assinante ativo alcança rota legada (dashboard/financeiro/crm/etc.) -- toda rota que não é standalone nem simplificada cai na Home simplificada', async () => {
  const app = await source('App.jsx');
  const simplifiedGuardIdx = app.indexOf('if (activeRoute?.simplified)');
  const finalReturnIdx = app.lastIndexOf('return <Navigate to={SIMPLIFIED_ROUTES.HOME} replace />;');
  assert.ok(simplifiedGuardIdx !== -1 && finalReturnIdx !== -1);
  assert.ok(simplifiedGuardIdx < finalReturnIdx, 'o fallback final deve vir depois do guard simplificado, cobrindo tudo que sobra');
  // O bloco entre o guard simplificado e o fallback final só pode conter o
  // guard standalone (apresentação/Plano Pessoal) -- nenhum outro render
  // (shell legado, guard de contexto PF/PJ) pode existir nesse meio.
  assert.doesNotMatch(app, /<AuthenticatedLayout|canAccessRouteInContext\(|canAccessRoute\(/);
});

test('acesso manual a /dashboard sem assinatura ativa redireciona corretamente (apresentação pendente -> /apresentacao; apresentação ok -> /plano-pessoal)', async () => {
  const app = await source('App.jsx');
  // activeRoute = appRoutes.find(route => route.path === location.pathname)
  // não depende do pathname especifico -- /dashboard é só mais um path que
  // cai em activeRoute?.standalone === undefined e activeRoute?.simplified
  // === undefined, então os guards de presentation/personal-plan (que
  // rodam ANTES de qualquer checagem de activeRoute) já decidem o destino
  // antes mesmo do pathname importar.
  const presentationGuardIdx = app.indexOf('if (\n    presentationUserId\n    && !presentationCompleted');
  const personalPlanGuardIdx = app.indexOf('if (\n    presentationUserId\n    && !personalPlanUnlocked\n    && !isPersonalPlanRoute\n    && !isPresentationRoute');
  const activeRouteCheckIdx = app.indexOf('if (activeRoute?.standalone)');
  assert.ok(presentationGuardIdx !== -1 && presentationGuardIdx < activeRouteCheckIdx);
  assert.ok(personalPlanGuardIdx !== -1 && personalPlanGuardIdx < activeRouteCheckIdx);
});

test('acesso manual a /app/home sem assinatura ativa redireciona para /plano-pessoal -- isPersonalPlanRoute nunca inclui a Home simplificada', async () => {
  const app = await source('App.jsx');
  assert.doesNotMatch(app, /isPersonalPlanRoute = location\.pathname === PERSONAL_PLAN_ROUTE\s*\n\s*\|\| location\.pathname === PERSONAL_PLAN_RETURN_ROUTE\s*\n\s*\|\| location\.pathname === SIMPLIFIED_ROUTES\.HOME/);
  assert.match(app, /const isPersonalPlanRoute = location\.pathname === PERSONAL_PLAN_ROUTE\s*\n\s*\|\| location\.pathname === PERSONAL_PLAN_RETURN_ROUTE;/);
});

test('componentes/rotas legados não aparecem na experiência simplificada -- SimplifiedAuthenticatedLayout não importa Sidebar/Topbar/AuthenticatedLayout/moduleAccess/accessRules legados', async () => {
  const { readdirSync } = await import('node:fs');
  const dir = new URL('../features/simplified-app/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.jsx') || f.endsWith('.js'));
  for (const file of files) {
    const content = await source(`../features/simplified-app/${file}`);
    assert.doesNotMatch(
      content,
      /from ['"].*layouts\/mobile-app-shell|from ['"].*components\/layout\/Sidebar|from ['"].*components\/layout\/Topbar|from ['"].*app\/accessRules|from ['"].*app\/navigation\.js|from ['"].*app\/moduleAccess/,
      `${file} não pode importar layout/nav/access legados`,
    );
  }
});

test('resolvePresentationUserId retorna o id real da sessão (Google e e-mail seguem o mesmo caminho) -- nunca null para uma sessão autenticada real', async () => {
  const config = await source('../features/presentation/presentationConfig.js');
  assert.match(
    config,
    /if \(!isSupabaseConfigured\) return PRESENTATION_DEMO_USER_ID;\s*\n\s*return typeof session\?\.user\?\.id === 'string' && session\.user\.id\s*\n\s*\? session\.user\.id\s*\n\s*: null;/,
  );
});

// ============================================================================
// BUG CRÍTICO CORRIGIDO: usuário compra o Plano Pessoal, usa normalmente,
// faz logout, fecha o navegador, abre de novo -- o app ia direto para
// /plano-pessoal e tentava cobrar de novo ao clicar em continuar. Causa
// raiz: o guard de assinatura só rodava DEPOIS de presentationCompleted
// (flag local, por navegador) resolver true, e usava workspace.id (o
// workspace "atual/ativo") em vez do workspace pessoal -- num navegador/
// dispositivo novo (cache limpo, reinstalação), presentationCompleted
// nunca tinha sido marcado ali, então a assinatura real nunca era
// consultada a tempo. Os testes abaixo travam a nova regra: sessão sempre
// decide primeiro; assinatura é sempre consultada no backend, nunca no
// local; dispositivo/navegador/cache nunca alteram o resultado.
// ============================================================================

test('logout limpa a sessão de verdade (supabase.auth.signOut) -- reabrir o domínio depois sem sessão sempre cai em /login para qualquer rota protegida', async () => {
  const authService = await source('../services/authService.js');
  assert.match(authService, /export async function signOut\(\) \{/);
  const signOutBody = authService.slice(authService.indexOf('export async function signOut'));
  assert.match(signOutBody, /await supabase\.auth\.signOut\(\);/);
  // App.jsx: !session redireciona para /login para QUALQUER rota
  // protegida, antes de qualquer guard de apresentação/assinatura.
  const app = await source('App.jsx');
  assert.match(app, /if \(!session \|\| sessionError\) \{/);
});

test('SEM SESSÃO, nenhuma URL (/, /welcome, /app/home, /plano-pessoal, /apresentacao, rota protegida qualquer) decide assinatura antes de exigir login', async () => {
  const app = await source('App.jsx');
  // isPublicRoute (/, /welcome, /login, /cadastro, /redefinir-senha,
  // /auth/callback) só decide destino pós-login quando session existe; sem
  // sessão, renderiza sempre as rotas públicas (login/cadastro/decisão).
  const publicBlockIdx = app.indexOf('if (isPublicRoute) {');
  const sessionCheckIdx = app.indexOf("['/', '/welcome', '/login'].includes(location.pathname)");
  assert.ok(publicBlockIdx !== -1 && sessionCheckIdx !== -1 && publicBlockIdx < sessionCheckIdx);
  // Qualquer rota protegida (appRoutes): !session sempre vira /login, ANTES
  // de qualquer guard de apresentação/assinatura (linhas seguintes).
  const loginGuardIdx = app.indexOf("if (!session || sessionError) {");
  const presentationGuardIdx = app.indexOf('presentationUserId\n    && !presentationCompleted\n    && !personalPlanUnlocked');
  assert.ok(loginGuardIdx !== -1 && presentationGuardIdx !== -1 && loginGuardIdx < presentationGuardIdx);
});

test('assinatura ativa: consultada assim que a sessão é conhecida, NUNCA depende de presentationCompleted -- troca de navegador/limpeza de cache/nova instalação nunca cobram de novo nem reapresentam', async () => {
  const app = await source('App.jsx');
  // personalPlanGuardEnabled não inclui presentationCompleted na condição.
  assert.match(
    app,
    /const personalPlanGuardEnabled = Boolean\(\s*\n\s*isSupabaseConfigured && !isSessionLoading && presentationUserId,\s*\n\s*\);/,
  );
  // Um assinante ativo nunca cai nos guards que mandam para apresentação ou
  // Plano Pessoal (ambos têm `&& !personalPlanUnlocked`).
  assert.match(app, /&& !presentationCompleted\s*\n\s*&& !personalPlanUnlocked\s*\n\s*&& !isPresentationRoute\s*\n\s*\) \{\s*\n\s*return <Navigate to=\{PRESENTATION_ROUTE\} replace \/>;/);
  assert.match(app, /&& !personalPlanUnlocked\s*\n\s*&& !isPersonalPlanRoute\s*\n\s*&& !isPresentationRoute\s*\n\s*\) \{\s*\n\s*return <Navigate to=\{PERSONAL_PLAN_ROUTE\} replace \/>;/);
});

test('assinatura sempre vinculada ao workspace pessoal real (resolvePersonalWorkspaceId), nunca ao workspace "atual/ativo" -- troca de contexto PF/PJ não afeta a checagem', async () => {
  const app = await source('App.jsx');
  assert.match(app, /const personalWorkspaceId = resolvePersonalWorkspaceId\(availableWorkspaces, workspace\);/);
  assert.match(app, /workspaceId: personalWorkspaceId,/);
  assert.doesNotMatch(app, /workspaceId: workspace\?\.id,/);
});

test('toda decisão pós-login (Caso 1/2/3) é tomada só depois do backend responder -- personalPlanAccessLoading bloqueia qualquer redirect antes disso', async () => {
  const app = await source('App.jsx');
  const postLoginBlockIdx = app.indexOf("['/', '/welcome', '/login'].includes(location.pathname)");
  const postLoginLoaderIdx = app.indexOf('if (personalPlanAccessLoading) {', postLoginBlockIdx);
  const postLoginNavigateIdx = app.indexOf('personalPlanUnlocked\n                ? requestedReturnPath', postLoginBlockIdx);
  assert.ok(postLoginBlockIdx !== -1 && postLoginLoaderIdx !== -1 && postLoginNavigateIdx !== -1);
  assert.ok(postLoginLoaderIdx < postLoginNavigateIdx, 'o loading guard precisa vir antes da decisão pós-login');
});

// ============================================================================
// GOOGLE DIRETO NA TELA DE BOAS-VINDAS -- depois que o Google conclui via
// /auth/callback (AuthCallbackPage), o destino final é decidido pelos
// MESMOS guards de App.jsx usados por qualquer outra sessão (e-mail
// incluído) -- nunca uma decisão especial só para OAuth. AuthCallbackPage
// só navega para o destino salvo; os guards abaixo, reaplicados a CADA
// navegação, decidem Home/Plano Pessoal/Apresentação de verdade.
// ============================================================================

test('Caso 1: conta Google existente + apresentação necessária -- guard de apresentação roda independente do provedor usado no login', async () => {
  const app = await source('App.jsx');
  // O guard usa presentationUserId (vem de resolvePresentationUserId,
  // idêntico para Google e e-mail -- já provado no teste de
  // resolvePresentationUserId acima) -- não há ramificação por provedor.
  assert.match(app, /const presentationUserId = resolvePresentationUserId\(session, isSupabaseConfigured\);/);
  assert.doesNotMatch(app, /provider === 'google'|isGoogleUser/);
});

test('Caso 2: conta Google existente + assinatura ativa -- vai para /app/home, nunca cobra de novo (mesmo guard personalPlanUnlocked)', async () => {
  const app = await source('App.jsx');
  const callback = await source('../pages/AuthCallbackPage.jsx');
  assert.match(callback, /const destination = consumeAuthReturnPath\(\);/);
  assert.match(callback, /return <Navigate to=\{destination\} replace \/>;/);
  // App.jsx reaplica o guard a cada navegação (inclusive a que
  // AuthCallbackPage dispara) -- personalPlanUnlocked decide Home/Plano
  // Pessoal independente de qual destino salvo o Navigate usou.
  assert.match(app, /if \(isPersonalPlanRoute && personalPlanUnlocked\) \{\s*\n\s*return <Navigate to=\{SIMPLIFIED_ROUTES\.HOME\} replace \/>;/);
});

test('Caso 3/4: conta Google sem assinatura ativa (existente ou recém-criada, sem perfil completo) -- nunca alcança Home, sempre cai em apresentação ou Plano Pessoal', async () => {
  const app = await source('App.jsx');
  assert.match(
    app,
    /if \(\s*\n\s*presentationUserId\s*\n\s*&& !personalPlanUnlocked\s*\n\s*&& !isPersonalPlanRoute\s*\n\s*&& !isPresentationRoute\s*\n\s*\) \{\s*\n\s*return <Navigate to=\{PERSONAL_PLAN_ROUTE\} replace \/>;/,
  );
  // presentationUserId não exige perfil/profile completo -- só
  // session.user.id (existe assim que o Google conclui o OAuth), então uma
  // conta Google "sem perfil válido" ainda cai corretamente no guard de
  // apresentação/Plano Pessoal, nunca passa direto para Home.
  const config = await source('../features/presentation/presentationConfig.js');
  assert.doesNotMatch(config, /profile\.|profileMissing/);
});

test('cores da splash batem com os tokens do theme.css', async () => {
  const html = await source('../../index.html');
  const theme = await source('../styles/theme.css');
  const token = (name) => theme.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`))[1].toUpperCase();
  const canvasIn = (selector) => {
    const block = theme.slice(theme.indexOf(`${selector}{`));
    return block.match(/--uf-color-bg-canvas:\s*(#[0-9A-Fa-f]{6})/)[1].toUpperCase();
  };
  const splashBg = (selector) => html.match(new RegExp(`${selector} #uniflow-splash \\{ background: (#[0-9A-Fa-f]{6}); \\}`))[1].toUpperCase();

  assert.equal(splashBg('\\[data-theme="light"\\]'), canvasIn('[data-theme="light"]'));
  assert.equal(splashBg('\\[data-theme="dark"\\]'), canvasIn('[data-theme="dark"]'));
  assert.match(html, new RegExp(`background: ${token('uf-gray-950')};`, 'i'));
  for (const name of ['uf-blue-700', 'uf-purple-600', 'uf-green-500']) {
    assert.ok(html.toUpperCase().includes(token(name)), `${name} ausente da splash`);
  }
});

test('o tema padrão do index.html é o mesmo do app, para a splash não piscar em outra cor', async () => {
  const html = await source('../../index.html');
  const constants = await source('../features/theme/themeConstants.js');
  assert.match(constants, /export const DEFAULT_THEME = THEME_IDS\.UNIFLOW;/);
  assert.match(html, /var pref = 'uniflow';/);
});
