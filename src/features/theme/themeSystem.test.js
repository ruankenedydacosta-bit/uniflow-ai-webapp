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

test('padrão inicial é UniFlow (identidade da marca) e catálogo público é imutável', () => {
  // Todo usuário sem preferência salva entra no tema UniFlow -- nunca Claro.
  // Só muda se o próprio usuário escolher outro tema em Conta > Tema.
  assert.equal(DEFAULT_THEME, THEME_IDS.UNIFLOW);
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

test('valor inválido gera fallback seguro para UniFlow', () => {
  assert.equal(normalizeThemePreference('auto'), THEME_IDS.UNIFLOW);
  assert.equal(normalizeThemePreference(null), THEME_IDS.UNIFLOW);
  assert.equal(readThemePreference(createStorage('invalid-theme')), THEME_IDS.UNIFLOW);
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
  assert.equal(readThemePreference(storage), THEME_IDS.UNIFLOW);
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

// ============================================================================
// THEME SYSTEM V2 — os 4 temas passam a MUDAR a interface de verdade.
//
// Bug real relatado: trocar de tema não mudava nada em /app/*. A causa não
// estava no provider (que sempre aplicou data-theme corretamente), e sim na
// shell simplificada: ela declarava a paleta escura inteira em valores
// literais, e essa declaração local vencia o data-theme da raiz para todo o
// conteúdo dentro dela. Os testes abaixo travam as três condições que fazem
// a troca de tema funcionar de ponta a ponta.
// ============================================================================

const APP_TOKENS = Object.freeze([
  '--uf-app-canvas', '--uf-app-surface', '--uf-app-surface-2', '--uf-app-surface-3',
  '--uf-app-border', '--uf-app-border-strong',
  '--uf-app-text', '--uf-app-text-2', '--uf-app-text-3',
  '--uf-app-primary', '--uf-app-primary-text', '--uf-app-ai', '--uf-app-ai-text',
  '--uf-app-success', '--uf-app-success-text', '--uf-app-danger', '--uf-app-danger-text',
  '--uf-app-warning', '--uf-app-warning-text', '--uf-app-focus', '--uf-app-cyan',
  '--uf-app-on-accent', '--uf-app-card-bg', '--uf-app-shell-bg',
]);

// O mesmo seletor de tema aparece em mais de um bloco do arquivo (a camada
// --uf-color-* da seção 17 e a camada --uf-app-* da seção 18). `marker`
// escolhe o bloco certo em vez de pegar cegamente o primeiro.
function themeBlock(css, selector, marker = null) {
  let from = 0;
  for (;;) {
    const start = css.indexOf(selector, from);
    assert.notEqual(start, -1, `bloco ${selector}${marker ? ` contendo ${marker}` : ''} não encontrado`);
    const block = css.slice(start, css.indexOf('}', start));
    if (!marker || block.includes(marker)) return block;
    from = start + selector.length;
  }
}

test('V2: cada tema declara o conjunto completo de tokens da aplicação', async () => {
  const css = await readFile(new URL('styles/theme.css', SRC_URL), 'utf8');

  for (const selector of ['[data-theme="light"]', '[data-theme="dark"]', '[data-theme="uniflow"]']) {
    const block = themeBlock(css, selector, '--uf-app-canvas');
    for (const token of APP_TOKENS) {
      assert.ok(
        block.includes(`${token}:`),
        `${selector} não define ${token} — a troca de tema deixaria esse papel visual sem valor próprio`,
      );
    }
  }
});

test('V2: os três temas têm fundo e texto realmente distintos entre si', async () => {
  const css = await readFile(new URL('styles/theme.css', SRC_URL), 'utf8');
  const read = (selector, token) => {
    const match = themeBlock(css, selector, '--uf-app-canvas').match(new RegExp(`${token}:\\s*([^;]+);`));
    return match?.[1].trim().toLowerCase();
  };

  const canvases = ['light', 'dark', 'uniflow'].map((t) => read(`[data-theme="${t}"]`, '--uf-app-canvas'));
  const texts = ['light', 'dark', 'uniflow'].map((t) => read(`[data-theme="${t}"]`, '--uf-app-text'));

  assert.equal(new Set(canvases).size, 3, `fundos precisam ser distintos, veio ${canvases.join(' / ')}`);
  // Claro é o único com texto escuro: é o que caracteriza o tema como claro.
  assert.equal(texts[0], '#0f172a');
  assert.notEqual(texts[1], texts[0]);
  assert.notEqual(texts[2], texts[0]);
});

test('V2 (regressão do bug): a shell simplificada não fixa mais uma paleta própria', async () => {
  const css = await readFile(new URL('features/simplified-app/simplifiedApp.module.css', SRC_URL), 'utf8');
  const shell = themeBlock(css, '.shell {');

  // Toda cor de tema declarada pela shell tem que vir de um token; um valor
  // literal aqui é exatamente o que tornava o seletor de temas inerte.
  const literals = shell.match(/--uf-color-[\w-]+:\s*(#[0-9a-fA-F]{3,8}|rgba?\()/g) ?? [];
  assert.deepEqual(
    literals, [],
    `a shell voltou a fixar cor literal (${literals.join(', ')}) — isso anula data-theme dentro de /app/*`,
  );
  assert.match(shell, /--uf-color-bg-canvas:\s*var\(--uf-app-canvas\)/);
  assert.match(shell, /--uf-color-text-primary:\s*var\(--uf-app-text\)/);
});

test('V2: contraste texto/fundo cumpre WCAG AA nos três temas', async () => {
  const css = await readFile(new URL('styles/theme.css', SRC_URL), 'utf8');

  const channel = (value) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (hex) => {
    const normalized = hex.replace('#', '');
    const full = normalized.length === 3
      ? normalized.split('').map((c) => c + c).join('')
      : normalized;
    const [r, g, b] = [0, 2, 4].map((i) => channel(parseInt(full.slice(i, i + 2), 16)));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a, b) => {
    const [l1, l2] = [luminance(a), luminance(b)];
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };

  for (const theme of ['light', 'dark', 'uniflow']) {
    const block = themeBlock(css, `[data-theme="${theme}"]`, '--uf-app-canvas');
    const read = (token) => block.match(new RegExp(`${token}:\\s*(#[0-9a-fA-F]{3,8});`))?.[1];

    for (const background of ['--uf-app-canvas', '--uf-app-surface']) {
      const bg = read(background);
      // text-3 é texto de apoio (papel de UI): o mínimo aplicável é 3:1.
      for (const [token, minimum] of [
        ['--uf-app-text', 4.5], ['--uf-app-text-2', 4.5], ['--uf-app-text-3', 3],
        ['--uf-app-primary-text', 4.5], ['--uf-app-ai-text', 4.5],
        ['--uf-app-success-text', 4.5], ['--uf-app-danger-text', 4.5],
        ['--uf-app-warning-text', 4.5],
      ]) {
        const ratio = contrast(read(token), bg);
        assert.ok(
          ratio >= minimum,
          `${theme}: ${token} sobre ${background} tem ${ratio.toFixed(2)}:1, abaixo do mínimo ${minimum}:1 — seria texto difícil de ler`,
        );
      }
    }
  }
});

test('V2: troca de tema anima só cor, nunca layout, e respeita movimento reduzido', async () => {
  const [css, resolver, provider] = await Promise.all([
    readFile(new URL('styles/theme.css', SRC_URL), 'utf8'),
    readFile(new URL('themeResolver.js', FEATURE_URL), 'utf8'),
    readFile(new URL('ThemeProvider.jsx', FEATURE_URL), 'utf8'),
  ]);

  const block = themeBlock(css, '[data-theme-transition="active"]');
  for (const property of ['background-color', 'color', 'border-color', 'box-shadow']) {
    assert.ok(block.includes(property), `transição de tema deveria interpolar ${property}`);
  }
  // Interpolar geometria faria os cards se mexerem ao trocar de tema.
  for (const forbidden of ['width', 'height', 'margin', 'padding', 'transform', 'top', 'left']) {
    assert.ok(
      !new RegExp(`\\s${forbidden}\\s`).test(block),
      `transição de tema não pode animar ${forbidden} — moveria elementos na tela`,
    );
  }
  assert.match(css, /prefers-reduced-motion: reduce\)\{\s*\[data-theme-transition="active"\]/s);
  assert.match(resolver, /export function beginThemeTransition/);
  // A primeira pintura não pode animar: nasceria fazendo fade do tema errado.
  assert.match(provider, /hasPaintedRef/);
});

test('V2: Tema é alcançável dentro do app simplificado', async () => {
  // A experiência simplificada já tem sua própria página de troca de tema
  // (SimplifiedThemePage, /app/conta/tema) -- este teste apenas confirma que
  // ela continua conectada ao useTheme/ThemeProvider real (mesmo mecanismo
  // desta seção), sem duplicar uma segunda tela equivalente.
  const [routes, accountRoutes, accountPage, themePage] = await Promise.all([
    readFile(new URL('app/routes.jsx', SRC_URL), 'utf8'),
    readFile(new URL('features/simplified-app/simplifiedAccountRoutes.js', SRC_URL), 'utf8'),
    readFile(new URL('features/simplified-app/SimplifiedAccountPage.jsx', SRC_URL), 'utf8'),
    readFile(new URL('features/simplified-app/SimplifiedThemePage.jsx', SRC_URL), 'utf8'),
  ]);

  assert.match(accountRoutes, /THEME: 'theme'/);
  assert.match(accountRoutes, /path: '\/app\/conta\/tema'/);
  assert.match(routes, /element: <SimplifiedThemePage \/>/);
  assert.match(accountPage, /ACCOUNT_SUBROUTE_IDS\.THEME/);
  assert.match(themePage, /useTheme\(\)/);
});
