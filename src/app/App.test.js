import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

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
