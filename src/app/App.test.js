import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('Vercel possui fallback SPA para deep links do React Router', async () => {
  const config = JSON.parse(await source('../../vercel.json'));
  assert.deepEqual(config.rewrites, [{ source: '/(.*)', destination: '/index.html' }]);

  const routes = await source('routes.jsx');
  for (const path of ['/login', '/uni-ai', '/suporte', '/financeiro']) {
    assert.ok(routes.includes(`path: '${path}'`));
  }
});

// ============================================================================
// UX5 -- o redirecionamento de contexto (PF tentando abrir um módulo
// empresarial) deixa de ser silencioso: o moduleId bloqueado vai junto via
// state de navegação (nunca na URL), para que AuthenticatedLayout explique o
// que aconteceu. O guard de autorização em si (canAccessRouteInContext)
// continua idêntico -- só ganhou um `state` anexado ao <Navigate>.
// ============================================================================

test('guard de contexto (PF/PJ) redireciona anexando o moduleId bloqueado via state, nunca na URL', async () => {
  const content = await source('App.jsx');
  assert.match(
    content,
    /if \(activeRoute && !canAccessRouteInContext\(activeRoute, access\.currentWorkspace\)\) \{\s*\n\s*return \(\s*\n\s*<Navigate\s*\n\s*to=\{getFallbackRoute\(access\.currentWorkspace, navigationItems\)\}\s*\n\s*replace\s*\n\s*state=\{\{ blockedModuleId: activeRoute\.moduleId \}\}\s*\n\s*\/>/,
  );
});

test('state de bloqueio nunca vaza para a URL (sem query string nem hash construídos a partir dele)', async () => {
  const content = await source('App.jsx');
  assert.doesNotMatch(content, /blockedModuleId.*[?&]|window\.location.*blockedModuleId/);
});

test('guard de plano/modo (ortogonal, preexistente) continua sem state -- só o guard de CONTEXTO ganhou explicação', async () => {
  const content = await source('App.jsx');
  const planGuard = content.slice(
    content.indexOf('if (activeRoute && activeNavigationItem'),
    content.indexOf('if (activeRoute && activeNavigationItem') + 200,
  );
  assert.doesNotMatch(planGuard, /state=/);
});

test('nenhuma troca de workspace automática acontece dentro do guard -- App.jsx só redireciona, nunca chama switchWorkspace', async () => {
  const content = await source('App.jsx');
  assert.doesNotMatch(content, /switchWorkspace/);
});

// ============================================================================
// UX6 -- fallback de rota removida/inexistente (ex.: /uni-chat-proto após a
// remoção). Autenticado cai no dashboard; não-autenticado continua protegido
// pelo guard de login, que roda ANTES de qualquer wildcard -- sem tela
// branca, sem loop.
// ============================================================================

test('appRoutes tem um catch-all que redireciona para /dashboard -- rota inexistente/removida nunca resulta em tela branca', async () => {
  const content = await source('App.jsx');
  const authenticatedBlock = content.slice(content.indexOf('<AuthenticatedLayout'));
  assert.match(authenticatedBlock, /<Route path="\*" element=\{<Navigate to="\/dashboard" replace \/>\} \/>/);
});

test('guard de login roda ANTES do catch-all de appRoutes -- usuário não autenticado em rota inexistente nunca alcança o wildcard de /dashboard', async () => {
  const content = await source('App.jsx');
  const loginGuardIndex = content.indexOf("if (!session || sessionError)");
  const catchAllIndex = content.lastIndexOf('<Route path="*" element={<Navigate to="/dashboard" replace />} />');
  assert.ok(loginGuardIndex >= 0 && catchAllIndex >= 0);
  assert.ok(loginGuardIndex < catchAllIndex, 'guard de login deve vir antes do catch-all autenticado');
});

test('fallback nunca redireciona para a própria rota inexistente -- sem possibilidade de loop (/dashboard é sempre um destino diferente e válido)', async () => {
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
    /!presentationCompleted[\s\S]{0,20}\? PRESENTATION_ROUTE[\s\S]{0,20}: !personalPlanUnlocked[\s\S]{0,20}\? PERSONAL_PLAN_ROUTE[\s\S]{0,20}: requestedReturnPath/,
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

test('guard real: usePersonalPlanAccessGuard só roda com backend real configurado, sessão resolvida, apresentação concluída e workspace conhecido', async () => {
  const content = await source('App.jsx');
  assert.match(content, /usePersonalPlanAccessGuard,\s*\n\} from '\.\.\/features\/personal-plan';/);
  assert.match(
    content,
    /const personalPlanGuardEnabled = Boolean\(\s*\n\s*isSupabaseConfigured && !isSessionLoading && presentationUserId && presentationCompleted,\s*\n\s*\);/,
  );
  assert.match(content, /workspaceId: workspace\?\.id,/);
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
  assert.match(content, /if \(presentationCompleted && personalPlanAccessLoading\) \{\s*\n\s*return <Loader fullScreen label="Verificando sua assinatura…" \/>;/);
  const idx = content.indexOf('// GUARD FIX: enquanto a consulta real de assinatura ainda não resolveu,');
  const slice = content.slice(idx, idx + 500);
  assert.match(slice, /personalPlanAccessLoading\s*\n\s*\) \{\s*\n\s*return <Loader fullScreen label="Verificando sua assinatura…" \/>;/);
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
    /if \(\s*\n\s*presentationUserId\s*\n\s*&& presentationCompleted\s*\n\s*&& !personalPlanUnlocked\s*\n\s*&& !isPersonalPlanRoute\s*\n\s*\) \{\s*\n\s*return <Navigate to=\{PERSONAL_PLAN_ROUTE\} replace \/>;/,
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
  assert.match(page, /markPersonalPlanCompleted\(userId\)/);
  assert.match(page, /29,90/);
});

test('guard do Plano Pessoal independe do workspace Business/PF-PJ -- workspace stale não altera o fluxo Pessoal', async () => {
  const content = await source('App.jsx');
  const guardBlock = content.slice(
    content.indexOf('if (\n    presentationUserId\n    && presentationCompleted\n    && !isPersonalPlanRoute\n    && personalPlanAccessLoading'),
    content.indexOf('// Guard de CONTEXTO'),
  );
  assert.ok(guardBlock.length > 0);
  assert.doesNotMatch(guardBlock, /currentWorkspace/);
});

test('guard do Plano Pessoal roda antes dos guards de standalone/simplificado/contexto de workspace', async () => {
  const content = await source('App.jsx');
  assert.ok(
    content.indexOf('!personalPlanUnlocked') < content.indexOf('activeRoute?.standalone'),
  );
  assert.ok(
    content.indexOf('!personalPlanUnlocked') < content.indexOf('activeRoute?.simplified'),
  );
  assert.ok(
    content.indexOf('!personalPlanUnlocked') < content.indexOf('// Guard de CONTEXTO'),
  );
});

test('rota catch-all autenticada da experiência simplificada nunca abre o shell legado', async () => {
  const content = await source('App.jsx');
  const simplifiedBlock = content.slice(
    content.indexOf('if (activeRoute?.simplified)'),
    content.indexOf('// Guard de CONTEXTO'),
  );
  assert.match(simplifiedBlock, /<Route path="\*" element=\{<Navigate to=\{SIMPLIFIED_ROUTES\.HOME\} replace \/>\} \/>/);
  assert.doesNotMatch(simplifiedBlock, /\/dashboard/);
});

test('usuário sem sessão entra por Login em / e /welcome, sem renderizar a apresentação pública antiga', async () => {
  const routes = await source('routes.jsx');
  const rootRoute = routes.slice(routes.indexOf("path: '/'"), routes.indexOf("path: '/welcome'"));
  const welcomeRoute = routes.slice(routes.indexOf("path: '/welcome'"), routes.indexOf("path: '/login'"));
  assert.match(rootRoute, /<Navigate to="\/login" replace \/>/);
  assert.match(welcomeRoute, /<Navigate to="\/login" replace \/>/);
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

test('apresentação é protegida, standalone e anterior aos guards de workspace', async () => {
  const app = await source('App.jsx');
  const routes = await source('routes.jsx');
  assert.match(routes, /path: '\/apresentacao'/);
  assert.match(routes, /standalone: true/);
  assert.ok(app.indexOf('!presentationCompleted') < app.indexOf('// Guard de CONTEXTO'));
  assert.match(app, /if \(activeRoute\?\.standalone\)/);
});
