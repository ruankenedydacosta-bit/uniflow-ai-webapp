import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// CFG2 -- AppShell repassa onSignOut/isSigningOut/signOutError ao Topbar
// ============================================================================

test('AppShell aceita onSignOut/isSigningOut/signOutError/profileName/profileEmail/activeContext/onToggleWorkspace/isSwitchingWorkspace e repassa integralmente ao Topbar', async () => {
  const content = await source('AppShell.jsx');
  assert.match(
    content,
    /function AppShell\(\{\s*\n\s*title = 'Dashboard',\s*\n\s*profileName = 'UniFlow',\s*\n\s*profileEmail = '',\s*\n\s*activeContext,\s*\n\s*onToggleWorkspace = \(\) => \{\},\s*\n\s*isSwitchingWorkspace = false,\s*\n\s*onSignOut,\s*\n\s*isSigningOut = false,\s*\n\s*signOutError = null,\s*\n\s*contextNotice = null,\s*\n\s*children,\s*\n\s*\}\)/,
  );
  assert.match(
    content,
    /<Topbar\s*\n\s*title=\{title\}\s*\n\s*profileName=\{profileName\}\s*\n\s*profileEmail=\{profileEmail\}\s*\n\s*activeContext=\{activeContext\}\s*\n\s*onToggleWorkspace=\{onToggleWorkspace\}\s*\n\s*isSwitchingWorkspace=\{isSwitchingWorkspace\}\s*\n\s*onSignOut=\{onSignOut\}\s*\n\s*isSigningOut=\{isSigningOut\}\s*\n\s*signOutError=\{signOutError\}\s*\n\s*\/>/,
  );
});

test('AppShell nao implementa logout por conta propria -- apenas repassa props (nenhuma chamada a signOut/Supabase)', async () => {
  const content = await source('AppShell.jsx');
  assert.doesNotMatch(content, /signOut\s*\(|supabase|SessionContext/i);
});

// ============================================================================
// Regressão -- estrutura preexistente preservada
// ============================================================================

test('Sidebar continua renderizada sem alteracao, fora do fluxo de logout', async () => {
  const content = await source('AppShell.jsx');
  assert.match(content, /<Sidebar \/>/);
});

test('children continuam renderizados dentro de <main>, agora com um contextNotice opcional acima (UX5)', async () => {
  const content = await source('AppShell.jsx');
  assert.match(content, /<main className=\{styles\.main\}>\s*\n\s*\{contextNotice\}\s*\n\s*\{children\}\s*\n\s*<\/main>/);
});
