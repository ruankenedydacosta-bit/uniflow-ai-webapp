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

test('estado vazio tem ícone e título, compacto -- sem repetir a mesma ideia em várias frases', async () => {
  const content = await source('NotificationsPanel.jsx');
  assert.match(content, /className=\{styles\.emptyIcon\}/);
  assert.match(content, /Nenhuma notificação por enquanto\./);
  // NOTIF-UX3: a segunda frase (redundante com a primeira, e com
  // "Tudo em dia" já mostrado acima) foi removida -- empty state de UMA
  // única linha de mensagem, nunca três dizendo a mesma coisa.
  assert.doesNotMatch(content, /Toda informação importante sobre sua conta aparecerá aqui\./);
});

// NOTIF2 (ajuste visual): o ícone de tipo ("□" etc, um quadrado ao lado do
// nome da categoria) foi removido -- ele duplicava a informação já exibida
// em texto por .itemType e brigava visualmente com o botão de dispensar
// (X sobreposto de forma estranha). O tipo continua indicado só por texto.
test('itens reais exibem o tipo por texto (itemType/getNotificationTypeLabel), sem ícone de tipo separado', async () => {
  const content = await source('NotificationsPanel.jsx');
  assert.match(content, /className=\{styles\.itemType\}/);
  assert.doesNotMatch(content, /TYPE_ICONS/);
  assert.doesNotMatch(content, /styles\.itemIcon/);
  assert.doesNotMatch(content, /data-type=\{notification\.type\}/);
});

test('clicar num item nao lido chama onMarkAsRead; clicar num ja lido nao chama de novo', async () => {
  const content = await source('NotificationsPanel.jsx');
  const fnStart = content.indexOf('function handleItemActivate');
  const fnBody = content.slice(fnStart, content.indexOf('return (', fnStart));
  assert.match(
    fnBody,
    /if \(isNotificationUnread\(notification\)\) \{\s*\n\s*onMarkAsRead\?\.\(notification\.id\);\s*\n\s*\}/,
  );
});

test('so navega quando action_url passa por isSafeInternalUrl -- bloqueia URL externa arbitraria', async () => {
  const content = await source('NotificationsPanel.jsx');
  const fnStart = content.indexOf('function handleItemActivate');
  const fnBody = content.slice(fnStart, content.indexOf('return (', fnStart));
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
  assert.match(content, /const message = getNotificationMessage\(notification\);/);
  assert.match(content, /<span className=\{styles\.itemMessage\}>\{message\}<\/span>/);
  assert.match(content, /className=\{styles\.itemStatus\}/);
  assert.match(content, /unread \? <span className=\{styles\.unreadDot\} aria-hidden="true" \/>/);
  const css = await source('NotificationsPanel.module.css');
  const dotRule = css.slice(css.indexOf('.unreadDot {'));
  assert.doesNotMatch(dotRule.slice(0, dotRule.indexOf('}')), /position:\s*absolute/);
});

test('item da lista e um <button type="button"> com aria-label indicando titulo e estado nao-lida -- acessivel por teclado', async () => {
  const content = await source('NotificationsPanel.jsx');
  assert.match(content, /<button\s*\n\s*type="button"\s*\n\s*className=\{`\$\{styles\.item\}/);
  assert.match(content, /aria-label=\{`\$\{notification\.title\}\$\{unread \? ' \(não lida\)' : ''\}`\}/);
});

// ============================================================================
// NOTIF2 -- dispensar (excluir) uma notificação nunca afeta o
// compromisso/registro de origem; botão X sempre visível + arrastar pra
// qualquer lado com fade gradiente, igual ao gesto nativo de celular.
// ============================================================================

test('cada item tem um botao de dispensar (X) sempre visivel, que chama onDismiss e nunca navega (stopPropagation)', async () => {
  const content = await source('NotificationsPanel.jsx');
  assert.match(content, /className=\{styles\.itemDismiss\}/);
  assert.match(content, /aria-label=\{`Dispensar notificação: \$\{notification\.title\}`\}/);
  const dismissStart = content.indexOf('className={styles.itemDismiss}');
  const dismissBlock = content.slice(dismissStart - 200, dismissStart + 300);
  assert.match(dismissBlock, /event\.stopPropagation\(\);/);
  assert.match(dismissBlock, /commitDismiss\(\);/);
});

test('arrastar (esquerda ou direita) alem do limiar dispara commitDismiss -- nunca fica travado no meio do gesto', async () => {
  const content = await source('NotificationsPanel.jsx');
  assert.match(content, /const DISMISS_ACTIVATE_PX = 88;/);
  assert.match(content, /const DISMISS_MAX_PX = 160;/);
  assert.match(content, /if \(Math\.abs\(dragX\) >= DISMISS_ACTIVATE_PX\) \{\s*\n\s*commitDismiss\(\);\s*\n\s*\} else \{\s*\n\s*setDragX\(0\);\s*\n\s*\}/);
});

test('commitDismiss chama onDismiss(notification.id) -- so a notificacao some, nunca o compromisso/registro de origem', async () => {
  const content = await source('NotificationsPanel.jsx');
  const fnStart = content.indexOf('function commitDismiss()');
  const fnBody = content.slice(fnStart, content.indexOf('\n  }', fnStart));
  assert.match(fnBody, /window\.setTimeout\(\(\) => onDismiss\(notification\.id\), 180\);/);
});

test('opacidade cai gradualmente com a distancia arrastada (fade) -- nunca some abruptamente antes do limiar', async () => {
  const content = await source('NotificationsPanel.jsx');
  assert.match(content, /const opacity = isDismissing \? 0 : 1 - Math\.min\(1, Math\.abs\(dragX\) \/ DISMISS_MAX_PX\);/);
});

test('movimento vertical solta o gesto (rolagem da lista, nunca disputa com arrastar horizontal)', async () => {
  const content = await source('NotificationsPanel.jsx');
  assert.match(content, /drag\.locked = Math\.abs\(dx\) > Math\.abs\(dy\) \? 'x' : 'y';/);
  assert.match(content, /if \(drag\.locked === 'y'\) \{\s*\n\s*dragStateRef\.current = null;\s*\n\s*return;\s*\n\s*\}/);
});

test('NotificationsPanel repassa onDismiss para cada NotificationItem', async () => {
  const content = await source('NotificationsPanel.jsx');
  assert.match(content, /onDismiss=\{\(id\) => onDismiss\?\.\(id\)\}/);
});
