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
  const fnBody = content.slice(content.indexOf('const handleSignOut = async'), content.indexOf('// notifications/support'));
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

test('handleShellAction roteia exatamente a acao sign-out para handleSignOut, sem implementar autenticacao em MoreMenu', async () => {
  const content = await source('AuthenticatedLayout.jsx');
  assert.match(
    content,
    /function handleShellAction\(action\) \{\s*\n\s*if \(action === 'sign-out'\) \{\s*\n\s*void handleSignOut\(\);\s*\n\s*\}\s*\n\s*\}/,
  );
});

test('outras acoes do shell (notifications/support) permanecem sem efeito, sem lancar erro', async () => {
  const content = await source('AuthenticatedLayout.jsx');
  const fnBody = content.slice(content.indexOf('function handleShellAction'), content.indexOf('if (!isMobile)'));
  // Somente 'sign-out' e tratado explicitamente; qualquer outra acao cai no
  // no-op implicito do if sem branch alternativo -- nunca lanca excecao.
  assert.match(fnBody, /if \(action === 'sign-out'\) \{/);
  assert.doesNotMatch(fnBody, /throw /);
});

test('MobileAppShell recebe onAction=handleShellAction (mobile)', async () => {
  const content = await source('AuthenticatedLayout.jsx');
  assert.match(content, /<MobileAppShell\s*\n\s*title=\{mobileTitle \?\? title\}\s*\n\s*immersive=\{immersive\}\s*\n\s*onAction=\{handleShellAction\}/);
});

test('AppShell (desktop) recebe onSignOut/isSigningOut/signOutError -- signOut centralizado em AuthenticatedLayout, nunca em AppShell/Topbar/Sidebar', async () => {
  const content = await source('AuthenticatedLayout.jsx');
  assert.match(
    content,
    /return <AppShell title=\{title\} onSignOut=\{handleSignOut\} isSigningOut=\{isSigningOut\} signOutError=\{signOutError\}>\{children\}<\/AppShell>;/,
  );
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
  assert.equal((content.match(/<AppShell /g) ?? []).length, 1);
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
