import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { MOBILE_SHELL_BREAKPOINTS, MOBILE_SHELL_CONFIG } from './shellConfig.js';
import { isMobileViewport, MOBILE_SHELL_MEDIA_QUERY } from './useMobileViewport.js';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('configuracao publica do shell e profundamente imutavel', () => {
  assert.equal(Object.isFrozen(MOBILE_SHELL_CONFIG), true);
  assert.equal(Object.isFrozen(MOBILE_SHELL_CONFIG.pwa), true);
  assert.equal(Object.isFrozen(MOBILE_SHELL_BREAKPOINTS), true);
});

test('shell compoe conteudo sem conhecer paginas ou regras de negocio', async () => {
  const contents = await source('./MobileAppShell.jsx');
  assert.match(contents, /\{children\}/);
  assert.match(contents, /ShellProvider/);
  assert.doesNotMatch(contents, /Supabase|SessionContext|AccessContext|fetch\s*\(/i);
});

test('contrato responsivo cobre mobile, tablet e sidebar desktop', async () => {
  const css = await source('./MobileAppShell.module.css');
  assert.equal(MOBILE_SHELL_BREAKPOINTS.minimum, 320);
  assert.match(css, /min-width: 0/);
  assert.match(css, /max-width: 768px/);
  assert.match(css, /@media \(min-width: 768px\)/);
  assert.match(css, /\.desktopSidebar\s*\{[\s\S]*?display: none/);
});

test('breakpoint usa mobile abaixo de 768 e desktop a partir de 768', () => {
  [320, 360, 375, 390, 430, 767].forEach((width) => assert.equal(isMobileViewport(width), true));
  [768, 1024, 1280].forEach((width) => assert.equal(isMobileViewport(width), false));
  assert.equal(MOBILE_SHELL_MEDIA_QUERY, '(max-width: 767px)');
});

test('AuthenticatedLayout renderiza somente um shell por viewport', async () => {
  const contents = await source('./AuthenticatedLayout.jsx');
  assert.match(contents, /if \(!isMobile\)/);
  assert.match(contents, /if \(!isMobile\) \{\s*return <AppShell/);
  assert.equal((contents.match(/<AppShell /g) ?? []).length, 1);
  assert.equal((contents.match(/<MobileAppShell/g) ?? []).length, 1);
});

test('Home atual permanece filha unica do layout autenticado', async () => {
  const app = await source('../../app/App.jsx');
  assert.match(app, /<AuthenticatedLayout/);
  assert.match(app, /mobileTitle=\{location\.pathname === '\/dashboard' \? 'Home'/);
  assert.match(app, /appRoutes\.map/);
  assert.doesNotMatch(app, /<AppShell/);
});

test('guards protegidos continuam antes do layout autenticado', async () => {
  const app = await source('../../app/App.jsx');
  const guardPosition = app.indexOf("if (!session || sessionError)");
  const layoutPosition = app.indexOf('<AuthenticatedLayout');
  assert.equal(guardPosition >= 0 && guardPosition < layoutPosition, true);
  assert.match(app, /<Navigate to="\/login" replace/);
  assert.match(app, /<Navigate to="\/onboarding" replace/);
});

test('mobile recebe header e bottom navigation sem sidebar desktop', async () => {
  const layout = await source('./AuthenticatedLayout.jsx');
  const shell = await source('./MobileAppShell.jsx');
  assert.match(layout, /<MobileAppShell/);
  assert.doesNotMatch(layout, /sidebar=/);
  assert.match(shell, /<MobileHeader/);
  assert.match(shell, /<BottomNavigation/);
});

test('safe areas e viewport PWA estao preparados', async () => {
  const css = await source('./MobileAppShell.module.css');
  assert.match(css, /env\(safe-area-inset-top/);
  assert.match(css, /env\(safe-area-inset-bottom/);
  assert.match(css, /100svh/);
});
