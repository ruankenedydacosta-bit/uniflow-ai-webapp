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
    content.indexOf('<NotificationList\n'),
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

// Tela 13 v2: o ícone do tipo volta à esquerda (IconBox) e o X sai de lá.
// O ícone já diz o tipo, então o rótulo ("Agenda") sai da linha.
test('itens mostram o tipo pelo ícone à esquerda (IconBox), sem o rótulo do tipo na linha', async () => {
  const content = await source('NotificationsPanel.jsx');
  assert.match(content, /const \{ Icon, tone \} = resolveTypePresentation\(notification\.type\);/);
  assert.match(content, /<IconBox tone=\{unread && tone \? tone : undefined\}/);
  assert.doesNotMatch(content, /getNotificationTypeLabel/);
  assert.doesNotMatch(content, /styles\.itemType/);
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

test('cada item mostra hora de chegada, titulo, mensagem e indicador de nao-lida, agrupado por dia', async () => {
  const content = await source('NotificationsPanel.jsx');
  assert.match(content, /const dayGroups = groupNotificationsByDay\(notifications\);/);
  assert.match(content, /formatNotificationDate\(notification\.created_at\)/);
  assert.match(content, /<span className=\{styles\.itemTitle\}>\s*\n\s*\{notification\.title\}/);
  assert.match(content, /const message = getNotificationMessage\(notification\);/);
  assert.match(content, /<span className=\{styles\.itemMessage\}>\{message\}<\/span>/);
  assert.match(content, /\{unread \? <span className=\{styles\.unreadDot\} aria-hidden="true" \/> : null\}/);
});

// Tela 13 v2: não lida tem um sinal só (ponto roxo + título no tom cheio).
// Sai o fundo, a borda e a barra lateral.
test('não lida não tem fundo, borda nem barra lateral; a lida apaga o título', async () => {
  const css = await source('NotificationsPanel.module.css');
  assert.doesNotMatch(css, /\.itemUnread/);
  assert.doesNotMatch(css, /box-shadow: inset 3px/);
  assert.match(css, /\.item\[data-unread="false"\] \.itemTitle \{\s*\n\s*color: var\(--uf-app-text-2\);/);
  assert.match(css, /font-variant-numeric: tabular-nums;/);
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/);
});

// Leitor de tela: "(não lida)" como texto oculto dentro do botão, nunca um
// aria-label que esconderia mensagem e hora.
test('item da lista e um <button type="button"> com "(não lida)" só para o leitor de tela -- acessivel por teclado', async () => {
  const content = await source('NotificationsPanel.jsx');
  assert.match(content, /<button\s*\n\s*type="button"\s*\n\s*className=\{styles\.item\}/);
  assert.match(content, /<span className=\{styles\.srOnly\}> \(não lida\)<\/span>/);
  assert.doesNotMatch(content, /aria-label=\{`\$\{notification\.title\}/);
});

test('"N não lidas" sai do topo e fica só para o leitor de tela; X de fechar só no toque', async () => {
  const content = await source('NotificationsPanel.jsx');
  assert.match(content, /<span className=\{styles\.srOnly\} role="status">/);
  assert.match(content, /aria-label="Fechar notificações"/);
  const css = await source('NotificationsPanel.module.css');
  assert.match(css, /@media \(hover: hover\) and \(pointer: fine\) \{\s*\n\s*\.close \{\s*\n\s*display: none;/);
});

// ============================================================================
// NOTIF2 -- dispensar (excluir) uma notificação nunca afeta o
// compromisso/registro de origem. Tela 13 v2: com mouse, X à direita no
// hover e no foco do teclado; no toque, arrastar pra qualquer lado com fade
// gradiente, igual ao gesto nativo de celular.
// ============================================================================

test('X de dispensar aparece só no hover (mouse) e no foco do teclado, no lugar da hora', async () => {
  const css = await source('NotificationsPanel.module.css');
  const base = css.slice(css.indexOf('.itemDismiss {'));
  const baseRule = base.slice(0, base.indexOf('}'));
  assert.match(baseRule, /opacity: 0;/);
  assert.match(baseRule, /pointer-events: none;/);
  assert.match(css, /\.itemDismiss:focus-visible \{\s*\n\s*opacity: 1;/);
  assert.match(css, /@media \(hover: hover\) and \(pointer: fine\) \{[\s\S]*?\.itemRow:hover \.itemDismiss \{\s*\n\s*opacity: 1;\s*\n\s*pointer-events: auto;/);
  assert.match(css, /\.itemRow:hover \.itemMeta \{\s*\n\s*visibility: hidden;/);
});

test('arrastar revela "Dispensar" por baixo da linha', async () => {
  const content = await source('NotificationsPanel.jsx');
  assert.match(content, /<span className=\{styles\.swipeHint\} data-side=\{dragX < 0 \? 'end' : 'start'\} aria-hidden="true">/);
});

test('cada item tem um botao de dispensar (X) que chama onDismiss e nunca navega (stopPropagation)', async () => {
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
