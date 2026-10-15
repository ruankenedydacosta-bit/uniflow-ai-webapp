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

// Fase 3 do redesign (#90): a aba Preferências da tela 14 lista os temas
// como rádios simples (Claro, UniFlow), sem banner nem selo de identidade.
test('lista só os dois temas oficiais como rádios, na ordem da tela 14 (Claro, UniFlow), sem banner de identidade', async () => {
  const page = await source('./SimplifiedThemePage.jsx');
  assert.match(page, /const THEME_ORDER = Object\.freeze\(\[THEME_IDS\.LIGHT, THEME_IDS\.UNIFLOW\]\);/);
  assert.match(page, /THEME_OPTIONS\.find\(\(option\) => option\.id === id\)/);
  assert.doesNotMatch(page, /UniMark|Identidade Uni|identidade premium/);
});

test('cabeçalho Configurações com as abas Perfil, Preferências e Segurança (aba Preferências ativa)', async () => {
  const page = await source('./SimplifiedThemePage.jsx');
  assert.match(page, /title="Configurações"/);
  assert.match(page, /<SimplifiedSettingsTabs active=\{ACCOUNT_SUBROUTE_IDS\.THEME\} \/>/);
  const tabs = await source('./SimplifiedSettingsTabs.jsx');
  assert.match(tabs, /label: 'Perfil'/);
  assert.match(tabs, /label: 'Preferências'/);
  assert.match(tabs, /label: 'Segurança'/);
});

test('grupo Uni: só o que existe (Estilo das respostas); nenhum "Em breve", interruptor sem efeito ou linha sem feature', async () => {
  const page = await source('./SimplifiedThemePage.jsx');
  assert.match(page, /navigate\(ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.VOICE\]\.path\)/);
  assert.doesNotMatch(page, /<Toggle|Em breve|Voz nas respostas da Uni|Animações do botão da Uni|Escolher o que avisar/);
});

test('"Trocar senha por e-mail" só aparece para quem entra com senha (identidade email), nunca para quem entra só com Google', async () => {
  const page = await source('./SimplifiedThemePage.jsx');
  assert.match(page, /identity\?\.provider === 'email'/);
  assert.match(page, /\{hasPasswordIdentity \? \(/);
  assert.match(page, /Trocar senha por e-mail/);
  assert.match(page, /navigate\(ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.SECURITY\]\.path\)/);
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
  assert.match(page, /backLabel="Voltar para Mais"/);
});

// Fase 3 do redesign (#90): a safe-area do topo passou para o cabeçalho
// compartilhado das subpáginas; a página cuida das laterais e do rodapé.
test('CSS cobre safe areas, 320px, foco e redução de movimento', async () => {
  const css = await source('./simplifiedTheme.module.css');
  const header = await source('./simplifiedSubpageHeader.module.css');
  assert.match(header, /env\(safe-area-inset-top\)/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /@media \(max-width: 359px\)/);
  assert.match(css, /:has\(input:focus-visible\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(css, /overflow-x:\s*(auto|scroll)/);
});
