import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// CFG2 -- botao de logout no Topbar desktop
// ============================================================================

test('Topbar renderiza um botao real de logout (componente Button, semanticamente <button>)', async () => {
  const content = await source('Topbar.jsx');
  assert.match(content, /import Button from '\.\.\/\.\.\/ui\/Button';/);
  assert.match(content, /<Button\s*\n\s*variant="ghost"\s*\n\s*size="sm"\s*\n\s*loading=\{isSigningOut\}\s*\n\s*onClick=\{onSignOut\}\s*\n\s*aria-label="Sair da conta"/);
});

test('botao de logout chama onSignOut recebido por prop -- Topbar nunca chama signOut/Supabase diretamente', async () => {
  const content = await source('Topbar.jsx');
  assert.match(
    content,
    /function Topbar\(\{\s*\n\s*title,\s*\n\s*profileName = 'UniFlow',\s*\n\s*onSignOut = \(\) => \{\},\s*\n\s*isSigningOut = false,\s*\n\s*signOutError = null,\s*\n\s*\}\)/,
  );
  assert.doesNotMatch(content, /signOut\s*\(|supabase|SessionContext/i);
});

test('botao fica em estado loading (desabilitado) durante isSigningOut -- evita duplo clique', async () => {
  const content = await source('Topbar.jsx');
  assert.match(content, /loading=\{isSigningOut\}/);
});

test('erro de logout e exibido de forma minima (role="alert"), usando a mensagem real quando disponivel', async () => {
  const content = await source('Topbar.jsx');
  assert.match(content, /signOutError \? \(\s*\n\s*<span role="alert"/);
  assert.match(content, /\{signOutError\.message \?\? 'Não foi possível sair da conta\. Tente novamente\.'\}/);
});

test('onSignOut tem um default no-op seguro (Topbar nao quebra se usado sem a prop)', async () => {
  const content = await source('Topbar.jsx');
  assert.match(content, /onSignOut = \(\) => \{\}/);
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

// ============================================================================
// FIX1 -- Avatar exibe o nome real do perfil autenticado, nunca "UniFlow Demo"
// ============================================================================

test('Avatar usa profileName recebido por prop (perfil real), com fallback seguro "UniFlow" -- nunca hardcoded "UniFlow Demo"', async () => {
  const content = await source('Topbar.jsx');
  assert.match(content, /<Avatar name=\{profileName\} size="sm" status="online" \/>/);
  assert.doesNotMatch(content, /UniFlow Demo/);
});

test('profileName tem um default seguro (Topbar nao quebra se usado sem a prop)', async () => {
  const content = await source('Topbar.jsx');
  assert.match(content, /profileName = 'UniFlow',/);
});
