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

test('rota inválida nunca vira destino pós-login', async () => {
  const content = await source('App.jsx');
  assert.match(content, /const from = activeRoute[\s\S]*?: '\/dashboard';/);
  assert.match(content, /getSafeAuthReturnPath\(location\.state\?\.from\)/);
});

test('usuário autenticado no login retorna ao destino seguro ou passa pelo onboarding', async () => {
  const content = await source('App.jsx');
  assert.match(content, /to=\{needsOnboarding \? '\/onboarding' : requestedReturnPath\}/);
  assert.match(content, /state=\{needsOnboarding \? \{ returnTo: requestedReturnPath \} : undefined\}/);
});
