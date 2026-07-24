import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// NOTIF1 -- NotificationBell.jsx (sino desktop, Topbar). Autocontido via
// useNotifications() -- sem props threading pelo AppShell/AuthenticatedLayout.
// ============================================================================

test('sino e um <button type="button"> com aria-label "Notificações" (sem badge) ou com contagem quando ha nao lidas', async () => {
  const content = await source('NotificationBell.jsx');
  assert.match(content, /<button\s*\n\s*type="button"\s*\n\s*className=\{styles\.trigger\}/);
  assert.match(
    content,
    /aria-label=\{unreadCount > 0 \? `Notificações, \$\{unreadCount\} não lidas` : 'Notificações'\}/,
  );
});

test('badge so renderiza quando unreadCount > 0 -- some quando zerado', async () => {
  const content = await source('NotificationBell.jsx');
  assert.match(
    content,
    /\{unreadCount > 0 \? \(\s*\n\s*<span className=\{styles\.badge\} aria-hidden="true">\{badgeLabel\}<\/span>\s*\n\s*\) : null\}/,
  );
});

test('badge mostra "9+" acima de 9 nao lidas, nunca um numero de 2+ digitos cru', async () => {
  const content = await source('NotificationBell.jsx');
  assert.match(content, /const badgeLabel = unreadCount > 9 \? '9\+' : String\(unreadCount\);/);
});

test('usa useNotifications() diretamente -- fonte unica de lista/contagem, sem duplicar estado', async () => {
  const content = await source('NotificationBell.jsx');
  assert.match(content, /import \{ useNotifications \} from '\.\/useNotifications\.js';/);
  assert.match(
    content,
    /const \{\s*\n\s*notifications, unreadCount, isLoading, error, refresh, markAsRead, markAllAsRead,\s*\n\s*\} = useNotifications\(\);/,
  );
});

test('painel abre num Modal acessivel (role dialog nativo do componente Modal), reaproveitado do design system', async () => {
  const content = await source('NotificationBell.jsx');
  assert.match(content, /import Modal from '\.\.\/\.\.\/components\/ui\/Modal\/Modal\.jsx';/);
  assert.match(content, /<Modal\s*\n\s*open=\{isOpen\}\s*\n\s*onClose=\{\(\) => setIsOpen\(false\)\}/);
});

test('onNavigate fecha o painel e navega via react-router (nunca window.location)', async () => {
  const content = await source('NotificationBell.jsx');
  assert.match(content, /onNavigate=\{\(url\) => \{\s*\n\s*setIsOpen\(false\);\s*\n\s*navigate\(url\);\s*\n\s*\}\}/);
  assert.doesNotMatch(content, /window\.location/);
});
