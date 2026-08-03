import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// NOTIF1 -- NotificationsPanel.jsx, componente compartilhado entre o sino
// desktop e o painel mobile (mesma lista/acoes, sem duplicacao).
// ============================================================================

test('estado de loading mostra mensagem com role="status", nunca a lista nem o erro', async () => {
  const content = await source('NotificationsPanel.jsx');
  const block = content.slice(content.indexOf('{isLoading ? ('), content.indexOf(') : error ? ('));
  assert.match(block, /role="status"/);
  assert.match(block, /Carregando notificações/);
});

test('estado de erro mostra role="alert" com botao "Tentar novamente" chamando onRetry', async () => {
  const content = await source('NotificationsPanel.jsx');
  const block = content.slice(content.indexOf(') : error ? ('), content.indexOf(') : notifications.length === 0 ? ('));
  assert.match(block, /role="alert"/);
  assert.match(block, /onClick=\{\(\) => onRetry\?\.\(\)\}/);
  assert.match(block, /Tentar novamente/);
});

test('estado vazio mostra mensagem clara com role="status", nunca uma lista vazia sem contexto', async () => {
  const content = await source('NotificationsPanel.jsx');
  const block = content.slice(
    content.indexOf(') : notifications.length === 0 ? ('),
    content.indexOf('<ul className={styles.list}'),
  );
  assert.match(block, /role="status"/);
  assert.match(block, /Nenhuma notificação por enquanto\./);
});

test('"Marcar todas como lidas" só aparece quando há não lidas e fica desabilitado durante loading', async () => {
  const content = await source('NotificationsPanel.jsx');
  assert.match(content, /\{unreadCount > 0 \? \(/);
  assert.match(content, /disabled=\{isLoading\}/);
  assert.match(content, /onClick=\{\(\) => onMarkAllAsRead\?\.\(\)\}/);
});

test('estado vazio tem ícone, título e orientação útil sem inventar notificação', async () => {
  const content = await source('NotificationsPanel.jsx');
  assert.match(content, /className=\{styles\.emptyIcon\}/);
  assert.match(content, /Nenhuma notificação por enquanto\./);
  assert.match(content, /Toda informação importante sobre sua conta aparecerá aqui\./);
});

test('itens reais exibem indicador visual por categoria', async () => {
  const content = await source('NotificationsPanel.jsx');
  assert.match(content, /const TYPE_ICONS = Object\.freeze/);
  assert.match(content, /data-type=\{notification\.type\}/);
});

test('clicar num item nao lido chama onMarkAsRead; clicar num ja lido nao chama de novo', async () => {
  const content = await source('NotificationsPanel.jsx');
  const fnBody = content.slice(
    content.indexOf('function handleItemActivate'),
    content.indexOf('return ('),
  );
  assert.match(
    fnBody,
    /if \(isNotificationUnread\(notification\)\) \{\s*\n\s*onMarkAsRead\?\.\(notification\.id\);\s*\n\s*\}/,
  );
});

test('so navega quando action_url passa por isSafeInternalUrl -- bloqueia URL externa arbitraria', async () => {
  const content = await source('NotificationsPanel.jsx');
  const fnBody = content.slice(
    content.indexOf('function handleItemActivate'),
    content.indexOf('return ('),
  );
  assert.match(
    fnBody,
    /if \(isSafeInternalUrl\(notification\.action_url\)\) \{\s*\n\s*onNavigate\?\.\(notification\.action_url\);\s*\n\s*\}/,
  );
  assert.match(content, /import \{[\s\S]*?isSafeInternalUrl,?[\s\S]*?\} from '\.\/notificationFormatting\.js';/);
});

test('cada item mostra tipo, data, titulo, mensagem e indicador de nao-lida (todos os campos exigidos)', async () => {
  const content = await source('NotificationsPanel.jsx');
  assert.match(content, /getNotificationTypeLabel\(notification\.type\)/);
  assert.match(content, /formatNotificationDate\(notification\.created_at\)/);
  assert.match(content, /<strong className=\{styles\.itemTitle\}>\{notification\.title\}<\/strong>/);
  assert.match(content, /notification\.message/);
  assert.match(content, /unread \? <span className=\{styles\.unreadDot\}/);
});

test('item da lista e um <button type="button"> com aria-label indicando titulo e estado nao-lida -- acessivel por teclado', async () => {
  const content = await source('NotificationsPanel.jsx');
  assert.match(content, /<button\s*\n\s*type="button"\s*\n\s*className=\{`\$\{styles\.item\}/);
  assert.match(content, /aria-label=\{`\$\{notification\.title\}\$\{unread \? ' \(não lida\)' : ''\}`\}/);
});
