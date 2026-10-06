import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const SRC = new URL('../../', import.meta.url);
const source = (path) => readFile(new URL(path, SRC), 'utf8');

test('tema Claro possui papéis semânticos completos de texto, superfície, navegação e overlay', async () => {
  const css = await source('styles/theme.css');
  const light = css.slice(css.indexOf('/* --- Tema CLARO'), css.indexOf('/* --- Tema ESCURO'));

  for (const token of [
    '--text-primary', '--text-secondary', '--text-muted', '--text-on-accent',
    '--text-danger', '--text-success', '--text-link', '--uf-app-panel',
    '--uf-app-nav-surface', '--uf-app-nav-scrim', '--uf-app-card-premium',
    '--uf-app-card-row', '--uf-app-field-panel', '--uf-app-overlay-panel',
    '--uf-app-voice-surface', '--uf-app-voice-text',
  ]) {
    assert.match(light, new RegExp(token.replaceAll('-', '\\-')));
  }
});

test('Escuro preserva os literais históricos das superfícies migradas', async () => {
  const css = await source('styles/theme.css');
  const dark = css.slice(css.indexOf('/* --- Tema ESCURO'), css.indexOf('/* --- Tema UNIFLOW'));

  assert.match(dark, /--uf-app-nav-surface:\s+rgba\(3,10,26,\.96\)/);
  assert.match(dark, /--uf-app-panel:\s+rgba\(4,13,33,\.92\)/);
  assert.match(dark, /--uf-app-card-premium:\s+linear-gradient\(145deg, rgba\(15,30,58,\.88\), rgba\(5,14,34,\.95\)\)/);
  assert.match(dark, /--uf-app-card-row:\s+linear-gradient\(105deg, rgba\(11,26,54,\.9\), rgba\(5,14,32,\.97\)\)/);
});

test('UniFlow segue a direção "Uni no centro": fundo quieto, superfície lisa e marca como linha e brilho', async () => {
  const css = await source('styles/theme.css');
  const uniflow = css.slice(css.indexOf('/* --- Tema UNIFLOW'), css.indexOf('/* ============================================================================\n   19.'));

  assert.match(uniflow, /--uf-app-canvas:\s+#161826;/);
  assert.match(uniflow, /--uf-app-card-bg:\s+#1F2130;/);
  assert.match(uniflow, /--uf-app-card-row:\s+#1F2130;/);
  assert.match(uniflow, /--uf-app-line-brand:\s+linear-gradient\(90deg, #1D4EDB, #7C3AED 55%, #10B981\);/);
  for (const token of ['--uf-app-glow-brand', '--uf-app-rule-fade', '--uf-app-card-uni', '--uf-app-card-uni-border']) {
    assert.match(uniflow, new RegExp(`${token}:`));
  }
  // Superfícies lisas: nada do gradiente azul-marinho antigo nos cards.
  assert.doesNotMatch(uniflow, /rgba\(14,31,62|rgba\(4,13,33|#030B1D/);
});

test('Home e navegação consomem superfícies temáticas, nunca os painéis escuros fixos', async () => {
  const css = await source('features/simplified-app/simplifiedApp.module.css');
  assert.match(css, /background:\s*var\(--uf-app-nav-surface\)/);
  assert.match(css, /background:\s*var\(--uf-app-nav-scrim\)/);
  assert.match(css, /background:\s*var\(--uf-app-panel\)/);
  assert.match(css, /linear-gradient\(var\(--uf-app-voice-surface\), var\(--uf-app-voice-surface\)\) padding-box/);
  assert.doesNotMatch(css, /background:\s*rgba\(3, 10, 26, \.96\)/);
  assert.doesNotMatch(css, /background:\s*rgba\(4, 14, 33, \.9\)/);
});

test('Registros e Agenda usam cards claros no Claro e mantêm semântica por tokens', async () => {
  const [records, agenda] = await Promise.all([
    source('features/simplified-app/simplifiedRecords.module.css'),
    source('features/simplified-app/simplifiedAgenda.module.css'),
  ]);
  assert.match(records, /\.categoryCard[\s\S]*?background:\s*var\(--uf-app-card-premium\)/);
  assert.match(records, /\.transactionRow[\s\S]*?background:\s*var\(--uf-app-card-row\)/);
  assert.match(records, /\.historyFilters[\s\S]*?background:\s*var\(--uf-app-field-panel\)/);
  assert.match(agenda, /\.monthLabel[\s\S]*?background:\s*var\(--uf-app-panel-muted\)/);
  assert.match(agenda, /\.itemButton[\s\S]*?background:\s*var\(--uf-app-card-row\)/);
  assert.match(agenda, /color-scheme:\s*var\(--uf-app-color-scheme\)/);
});

test('Tema Claro recebe cartões próprios sem alterar o estilo base de Escuro e UniFlow', async () => {
  const css = await source('features/simplified-app/simplifiedTheme.module.css');
  assert.match(css, /:global\(\[data-theme='light'\]\) \.option/);
  assert.match(css, /:global\(\[data-theme='light'\]\) \.optionCopy/);
  assert.match(css, /:global\(\[data-theme='light'\]\) \.uniIdentity/);
  assert.doesNotMatch(css, /:global\(\[data-theme='(?:dark|uniflow)'\]\)/);
});

test('Chat Claro preserva contraste da bolha colorida e da resposta da Uni', async () => {
  const css = await source('features/uni-chat/components/MessageBubble.module.css');
  assert.match(css, /:global\(\[data-theme='light'\]\) \.bubble \.text/);
  assert.match(css, /:global\(\[data-theme='light'\]\) \.bubble \.text p/);
  assert.match(css, /color:\s*inherit/);
  assert.doesNotMatch(css, /:global\(\[data-theme='(?:dark|uniflow)'\]\) \.bubble/);
});

test('tema Sistema foi removido -- resolver nunca mais depende de dispositivo/matchMedia', async () => {
  const resolver = await source('features/theme/themeResolver.js');
  assert.doesNotMatch(resolver, /THEME_IDS\.SYSTEM|systemTheme|matchMedia/);
});
