import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  DEFAULT_THEME,
  SYSTEM_THEME_QUERY,
  THEME_IDS,
  THEME_OPTIONS,
  THEME_STORAGE_KEY,
  isThemePreference,
  normalizeThemePreference,
} from './themeConstants.js';
import {
  applyThemeToRoot,
  resolveEffectiveTheme,
  resolveSystemTheme,
  subscribeToSystemTheme,
} from './themeResolver.js';
import { readThemePreference, writeThemePreference } from './themeStorage.js';

const FEATURE_URL = new URL('.', import.meta.url);
const SRC_URL = new URL('../../', import.meta.url);

function createStorage(initialValue = null) {
  const values = new Map();
  if (initialValue !== null) values.set(THEME_STORAGE_KEY, initialValue);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    value: () => values.get(THEME_STORAGE_KEY),
  };
}

test('padrão inicial é Claro e catálogo público é imutável', () => {
  assert.equal(DEFAULT_THEME, THEME_IDS.LIGHT);
  assert.deepEqual(THEME_OPTIONS.map(({ label }) => label), ['Claro', 'Escuro', 'UniFlow', 'Sistema']);
  assert.ok(Object.isFrozen(THEME_OPTIONS));
  assert.ok(THEME_OPTIONS.every(Object.isFrozen));
});

test('todas as preferências válidas são preservadas', () => {
  Object.values(THEME_IDS).forEach((theme) => {
    assert.equal(isThemePreference(theme), true);
    assert.equal(normalizeThemePreference(theme), theme);
  });
});

test('valor inválido gera fallback seguro para Claro', () => {
  assert.equal(normalizeThemePreference('auto'), THEME_IDS.LIGHT);
  assert.equal(normalizeThemePreference(null), THEME_IDS.LIGHT);
  assert.equal(readThemePreference(createStorage('invalid-theme')), THEME_IDS.LIGHT);
});

test('preferência é lida e persistida somente pela chave visual', () => {
  const storage = createStorage(THEME_IDS.DARK);
  assert.equal(readThemePreference(storage), THEME_IDS.DARK);
  assert.equal(writeThemePreference(THEME_IDS.UNIFLOW, storage), THEME_IDS.UNIFLOW);
  assert.equal(storage.value(), THEME_IDS.UNIFLOW);
  assert.equal(THEME_STORAGE_KEY, 'uniflow.theme.preference');
});

test('falha de storage não interrompe a aplicação', () => {
  const storage = {
    getItem: () => { throw new Error('unavailable'); },
    setItem: () => { throw new Error('unavailable'); },
  };
  assert.equal(readThemePreference(storage), THEME_IDS.LIGHT);
  assert.equal(writeThemePreference(THEME_IDS.DARK, storage), THEME_IDS.DARK);
});

test('Sistema resolve corretamente para claro e escuro', () => {
  assert.equal(resolveSystemTheme(() => ({ matches: false })), THEME_IDS.LIGHT);
  assert.equal(resolveSystemTheme(() => ({ matches: true })), THEME_IDS.DARK);
  assert.equal(resolveEffectiveTheme(THEME_IDS.SYSTEM, THEME_IDS.LIGHT), THEME_IDS.LIGHT);
  assert.equal(resolveEffectiveTheme(THEME_IDS.SYSTEM, THEME_IDS.DARK), THEME_IDS.DARK);
  assert.equal(resolveEffectiveTheme(THEME_IDS.UNIFLOW, THEME_IDS.LIGHT), THEME_IDS.UNIFLOW);
});

test('mudança do sistema é observada em tempo real e listener é removido', () => {
  let listener = null;
  let removedListener = null;
  const observed = [];
  const mediaQueryList = {
    matches: false,
    addEventListener: (event, nextListener) => {
      assert.equal(event, 'change');
      listener = nextListener;
    },
    removeEventListener: (event, nextListener) => {
      assert.equal(event, 'change');
      removedListener = nextListener;
    },
  };

  const cleanup = subscribeToSystemTheme(
    (theme) => observed.push(theme),
    (query) => {
      assert.equal(query, SYSTEM_THEME_QUERY);
      return mediaQueryList;
    },
  );

  listener({ matches: true });
  listener({ matches: false });
  cleanup();

  assert.deepEqual(observed, [THEME_IDS.DARK, THEME_IDS.LIGHT]);
  assert.equal(removedListener, listener);
});

test('atributos de preferência e tema efetivo são aplicados separadamente', () => {
  const attributes = new Map();
  const root = { setAttribute: (name, value) => attributes.set(name, value) };
  applyThemeToRoot(root, THEME_IDS.SYSTEM, THEME_IDS.DARK);
  assert.equal(attributes.get('data-theme-preference'), THEME_IDS.SYSTEM);
  assert.equal(attributes.get('data-theme'), THEME_IDS.DARK);
});

test('resolver não modifica entradas recebidas', () => {
  const preference = Object.freeze({ value: THEME_IDS.LIGHT });
  const snapshot = structuredClone(preference);
  normalizeThemePreference(preference.value);
  assert.deepEqual(preference, snapshot);
});

test('provider mantém selectedTheme e effectiveTheme e aplica antes da pintura', async () => {
  const source = await readFile(new URL('ThemeProvider.jsx', FEATURE_URL), 'utf8');
  assert.match(source, /useLayoutEffect/);
  assert.match(source, /selectedTheme/);
  assert.match(source, /effectiveTheme/);
  assert.match(source, /subscribeToSystemTheme/);
  assert.match(source, /return subscribeToSystemTheme\(setSystemTheme\)/);
});

test('ThemeSelector reflete seleção ativa e oferece controles acessíveis', async () => {
  const source = await readFile(new URL('components/ThemeSelector.jsx', FEATURE_URL), 'utf8');
  assert.match(source, /checked=\{isSelected\}/);
  assert.match(source, /type="radio"/);
  assert.match(source, /aria-label=\{`Usar tema \$\{option\.label\}`\}/);
  assert.match(source, /Selecionado/);
  assert.match(source, /Seguindo o sistema/);
});

test('tokens, raiz e Configurações estão conectados sem API externa', async () => {
  const [themeCss, mainSource, settingsSource, providerSource, storageSource] = await Promise.all([
    readFile(new URL('styles/theme.css', SRC_URL), 'utf8'),
    readFile(new URL('main.jsx', SRC_URL), 'utf8'),
    readFile(new URL('pages/SettingsPage.jsx', SRC_URL), 'utf8'),
    readFile(new URL('ThemeProvider.jsx', FEATURE_URL), 'utf8'),
    readFile(new URL('themeStorage.js', FEATURE_URL), 'utf8'),
  ]);

  assert.match(themeCss, /:root,\s*\n\[data-theme="light"\]/);
  assert.match(themeCss, /\[data-theme="dark"\]/);
  assert.match(themeCss, /\[data-theme="uniflow"\]/);
  assert.match(themeCss, /--uf-color-overlay:/);
  assert.match(themeCss, /--uf-gradient-brand:/);
  assert.match(mainSource, /<ThemeProvider>/);
  assert.match(settingsSource, /<ThemeSelector \/>/);
  assert.doesNotMatch(`${providerSource}\n${storageSource}`, /fetch\(|axios|supabase|XMLHttpRequest/i);
});

test('seletor respeita toque mínimo, foco e redução de movimento', async () => {
  const css = await readFile(new URL('components/ThemeSelector.module.css', FEATURE_URL), 'utf8');
  assert.match(css, /min-height: 76px/);
  assert.match(css, /:focus-within/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});
