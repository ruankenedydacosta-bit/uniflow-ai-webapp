import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// CFG2 -- AppShell repassa onSignOut/isSigningOut/signOutError ao Topbar
// ============================================================================

test('AppShell aceita onSignOut/isSigningOut/signOutError e repassa integralmente ao Topbar', async () => {
  const content = await source('AppShell.jsx');
  assert.match(
    content,
    /function AppShell\(\{ title = 'Dashboard', onSignOut, isSigningOut = false, signOutError = null, children \}\)/,
  );
  assert.match(
    content,
    /<Topbar title=\{title\} onSignOut=\{onSignOut\} isSigningOut=\{isSigningOut\} signOutError=\{signOutError\} \/>/,
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

test('children continuam renderizados dentro de <main>', async () => {
  const content = await source('AppShell.jsx');
  assert.match(content, /<main className=\{styles\.main\}>\{children\}<\/main>/);
});
