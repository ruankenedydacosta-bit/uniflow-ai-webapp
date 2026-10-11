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
  assert.match(css, /background:\s*var\(--uf-app-nav-scrim\)/);
  assert.match(css, /background:\s*var\(--uf-app-panel\)/);
  assert.doesNotMatch(css, /background:\s*rgba\(3, 10, 26, \.96\)/);
  assert.doesNotMatch(css, /background:\s*rgba\(4, 14, 33, \.9\)/);
});

test('Registros e Agenda usam cards claros no Claro e mantêm semântica por tokens', async () => {
  const [records, agenda] = await Promise.all([
    source('features/simplified-app/simplifiedRecords.module.css'),
    source('features/simplified-app/simplifiedAgenda.module.css'),
  ]);
  // Fundo de cada regra vem de token do tema (ou é transparente), nunca de cor fixa.
  const fundo = (css, seletor) => css.match(new RegExp(`(^|\\n)\\.${seletor}\\s*\\{([^}]*)\\}`))?.[2]
    .match(/background:\s*([^;]+);/)?.[1];
  assert.equal(fundo(records, 'categoryCard'), 'var(--uf-app-card-surface)');
  assert.equal(fundo(records, 'transactionRow'), 'var(--uf-app-canvas)');
  assert.equal(fundo(agenda, 'monthLabel'), 'transparent');
  assert.equal(fundo(agenda, 'itemButton'), 'transparent');
  assert.match(agenda, /color-scheme:\s*var\(--uf-app-color-scheme\)/);
});

test('tema Sistema foi removido -- resolver nunca mais depende de dispositivo/matchMedia', async () => {
  const resolver = await source('features/theme/themeResolver.js');
  assert.doesNotMatch(resolver, /THEME_IDS\.SYSTEM|systemTheme|matchMedia/);
});
