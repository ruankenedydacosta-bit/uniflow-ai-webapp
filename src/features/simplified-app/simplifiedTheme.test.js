import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { THEME_IDS, THEME_OPTIONS } from '../theme/themeConstants.js';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('tela simplificada reutiliza exclusivamente o ThemeProvider oficial', async () => {
  const page = await source('./SimplifiedThemePage.jsx');
  assert.match(page, /THEME_IDS, THEME_OPTIONS, useTheme/);
  assert.match(page, /const \{ selectedTheme, setTheme \} = useTheme\(\);/);
  assert.match(page, /onChange=\{\(\) => setTheme\(option\.id\)\}/);
  assert.doesNotMatch(page, /localStorage|sessionStorage|new ThemeProvider|createContext/);
});

test('oferece exatamente os dois temas oficiais -- UniFlow primeiro (padrão obrigatório), Claro como alternativa', () => {
  assert.deepEqual(THEME_OPTIONS.map(({ id }) => id), [
    THEME_IDS.UNIFLOW,
    THEME_IDS.LIGHT,
  ]);
  assert.equal(THEME_IDS.DARK, undefined);
  assert.equal(THEME_IDS.SYSTEM, undefined);
});

test('tema UniFlow preserva o id oficial e recebe identidade premium da marca', async () => {
  const page = await source('./SimplifiedThemePage.jsx');
  assert.match(page, /\[THEME_IDS\.UNIFLOW\]/);
  assert.match(page, /identidade premium da Uni/i);
  assert.match(page, /badge: 'Identidade Uni'/);
  assert.match(page, /<UniMark \/>/);
});

test('nenhuma lógica de Escuro/Sistema permanece na tela (cards removidos, sem resolvedor paralelo)', async () => {
  const page = await source('./SimplifiedThemePage.jsx');
  assert.doesNotMatch(page, /THEME_IDS\.DARK|THEME_IDS\.SYSTEM|matchMedia|prefers-color-scheme|effectiveTheme/);
});

test('controles são acessíveis e a escolha é anunciada', async () => {
  const page = await source('./SimplifiedThemePage.jsx');
  assert.match(page, /type="radio"/);
  assert.match(page, /aria-label=\{`Usar tema \$\{option\.label\}`\}/);
  assert.match(page, /aria-live="polite"/);
  assert.match(page, /aria-label="Voltar para Conta"/);
});

test('CSS cobre safe areas, 320px, foco e redução de movimento', async () => {
  const css = await source('./simplifiedTheme.module.css');
  assert.match(css, /env\(safe-area-inset-top\)/);
  assert.match(css, /@media \(max-width: 359px\)/);
  assert.match(css, /:has\(input:focus-visible\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(css, /overflow-x:\s*(auto|scroll)/);
});
