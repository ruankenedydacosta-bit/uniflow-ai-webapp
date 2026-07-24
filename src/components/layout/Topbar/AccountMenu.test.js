import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// UX3 -- avatar desktop vira um menu de conta real (era so decorativo, sem
// onClick). Sem infraestrutura de renderizacao React neste repositorio --
// cobertura por leitura de codigo-fonte, mesmo padrao ja usado no projeto.
// ============================================================================

test('trigger e um <button> acessivel (aria-haspopup/aria-expanded/aria-label), nunca um Avatar decorativo sem onClick', async () => {
  const content = await source('AccountMenu.jsx');
  assert.match(content, /<button\s*\n\s*ref=\{triggerRef\}\s*\n\s*type="button"\s*\n\s*className=\{styles\.trigger\}\s*\n\s*aria-haspopup="menu"\s*\n\s*aria-expanded=\{isOpen\}\s*\n\s*aria-label=\{`Menu da conta de \$\{profileName\}`\}\s*\n\s*onClick=\{\(\) => setIsOpen\(\(current\) => !current\)\}/);
});

test('painel so renderiza quando isOpen, com role="menu" e itens role="menuitem"', async () => {
  const content = await source('AccountMenu.jsx');
  assert.match(content, /\{isOpen \? \(\s*\n\s*<div className=\{styles\.panel\} role="menu" aria-label="Menu da conta">/);
  const menuItemOccurrences = content.match(/role="menuitem"/g) ?? [];
  assert.ok(menuItemOccurrences.length >= 5, 'Ver perfil, Configurações, Segurança, Trocar espaço e Sair devem ser role="menuitem"');
});

test('Escape fecha o menu e devolve o foco ao trigger', async () => {
  const content = await source('AccountMenu.jsx');
  const handler = content.slice(content.indexOf('function handleKeyDown'), content.indexOf('function handleKeyDown') + 400);
  assert.match(handler, /event\.key === 'Escape'/);
  assert.match(handler, /setIsOpen\(false\);/);
  assert.match(handler, /triggerRef\.current\?\.focus\(\);/);
});

test('clique fora fecha o menu (pointerdown fora de menuRef), mesmo padrao ja usado por AccessModeSwitcher', async () => {
  const content = await source('AccountMenu.jsx');
  assert.match(content, /document\.addEventListener\('pointerdown', handlePointerDown\);/);
  assert.match(content, /if \(!menuRef\.current\?\.contains\(event\.target\)\) \{\s*\n\s*setIsOpen\(false\);/);
});

test('"Ver perfil"/"Configurações"/"Segurança" navegam para /configuracoes com a section canonica correta', async () => {
  const content = await source('AccountMenu.jsx');
  assert.match(content, /navigate\('\/configuracoes\?section=perfil'\)/);
  assert.match(content, /navigate\('\/configuracoes\?section=preferencias'\)/);
  assert.match(content, /navigate\('\/configuracoes\?section=seguranca'\)/);
});

test('"Trocar espaço" chama onToggleWorkspace recebido por prop -- reaproveita o MESMO fluxo real do mobile, sem logica de workspace propria', async () => {
  const content = await source('AccountMenu.jsx');
  assert.match(content, /onClick=\{\(\) => closeAnd\(onToggleWorkspace\)\}/);
  assert.doesNotMatch(content, /switchWorkspace|SessionContext/);
});

test('"Sair" chama onSignOut recebido por prop, fica desabilitado durante isSigningOut -- AccountMenu nunca chama signOut/Supabase diretamente', async () => {
  const content = await source('AccountMenu.jsx');
  assert.match(content, /onClick=\{\(\) => closeAnd\(onSignOut\)\}/);
  assert.match(content, /disabled=\{isSigningOut\}/);
  assert.doesNotMatch(content, /signOut\s*\(|supabase|SessionContext/i);
});

test('cada opcao fecha o menu antes/ao executar a acao (closeAnd), nunca deixa o menu aberto apos navegar/agir', async () => {
  const content = await source('AccountMenu.jsx');
  const fnBody = content.slice(content.indexOf('function closeAnd'), content.indexOf('function closeAnd') + 150);
  assert.match(fnBody, /setIsOpen\(false\);/);
  assert.match(fnBody, /action\(\);/);
});

test('cabecalho do painel mostra nome/e-mail/contexto reais recebidos por prop, nunca dado fictício', async () => {
  const content = await source('AccountMenu.jsx');
  assert.match(content, /\{profileEmail \? <span className=\{styles\.profileEmail\}>\{profileEmail\}<\/span> : null\}/);
  // Recorte a partir da funcao (fora do comentario JSDoc do topo, que cita
  // "UniFlow Demo" só como contexto histórico da UX3) -- garante que o texto
  // fictício nunca aparece no JSX renderizado, não em prosa de comentário.
  const componentBody = content.slice(content.indexOf('function AccountMenu'));
  assert.doesNotMatch(componentBody, /UniFlow Demo/);
});

test('props tem defaults seguros (AccountMenu nao quebra se usado sem elas)', async () => {
  const content = await source('AccountMenu.jsx');
  assert.match(
    content,
    /function AccountMenu\(\{\s*\n\s*profileName = 'UniFlow',\s*\n\s*profileEmail = '',\s*\n\s*activeContext,\s*\n\s*onToggleWorkspace = \(\) => \{\},\s*\n\s*onSignOut = \(\) => \{\},\s*\n\s*isSigningOut = false,\s*\n\s*\}\)/,
  );
});
