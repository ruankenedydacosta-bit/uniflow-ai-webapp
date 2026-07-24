import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// UX3 -- avatar desktop vira um AccountMenu real (logout passa a viver la)
// ============================================================================

test('Topbar delega identidade/conta ao AccountMenu real, nao mais Avatar+Button soltos', async () => {
  const content = await source('Topbar.jsx');
  assert.match(content, /import AccountMenu from '\.\/AccountMenu\.jsx';/);
  assert.doesNotMatch(content, /import Avatar from/);
  assert.doesNotMatch(content, /import Button from/);
});

test('Topbar repassa profileName/profileEmail/activeContext/onToggleWorkspace/onSignOut/isSigningOut integralmente ao AccountMenu', async () => {
  const content = await source('Topbar.jsx');
  assert.match(
    content,
    /<AccountMenu\s*\n\s*profileName=\{profileName\}\s*\n\s*profileEmail=\{profileEmail\}\s*\n\s*activeContext=\{activeContext\}\s*\n\s*onToggleWorkspace=\{onToggleWorkspace\}\s*\n\s*onSignOut=\{onSignOut\}\s*\n\s*isSigningOut=\{isSigningOut\}\s*\n\s*\/>/,
  );
});

test('assinatura de props tem defaults seguros (Topbar nao quebra se usado sem elas)', async () => {
  const content = await source('Topbar.jsx');
  assert.match(
    content,
    /function Topbar\(\{\s*\n\s*title,\s*\n\s*profileName = 'UniFlow',\s*\n\s*profileEmail = '',\s*\n\s*activeContext,\s*\n\s*onToggleWorkspace = \(\) => \{\},\s*\n\s*onSignOut = \(\) => \{\},\s*\n\s*isSigningOut = false,\s*\n\s*signOutError = null,\s*\n\s*\}\)/,
  );
});

test('erro de logout e exibido de forma minima (role="alert"), usando a mensagem real quando disponivel', async () => {
  const content = await source('Topbar.jsx');
  assert.match(content, /signOutError \? \(\s*\n\s*<span role="alert"/);
  assert.match(content, /\{signOutError\.message \?\? 'Não foi possível sair da conta\. Tente novamente\.'\}/);
});

test('Topbar nunca chama signOut/Supabase diretamente -- so repassa props ao AccountMenu', async () => {
  const content = await source('Topbar.jsx');
  assert.doesNotMatch(content, /signOut\s*\(|supabase|SessionContext/i);
});

// ============================================================================
// Regressão -- Topbar preexistente preservado
// ============================================================================

test('titulo e badge "Uni ativa" continuam intactos', async () => {
  const content = await source('Topbar.jsx');
  assert.match(content, /Uni ativa/);
  assert.match(content, /<h1 className=\{styles\.title\}>\{title\}<\/h1>/);
});

test('AccessModeSwitcher continua renderizado sem alteracao', async () => {
  const content = await source('Topbar.jsx');
  assert.match(content, /<AccessModeSwitcher \/>/);
});

test('nunca renderiza o nome fictício "UniFlow Demo" (identidade agora e responsabilidade do AccountMenu)', async () => {
  const content = await source('Topbar.jsx');
  assert.doesNotMatch(content, /UniFlow Demo/);
});
