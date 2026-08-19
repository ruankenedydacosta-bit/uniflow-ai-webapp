import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  PWA_INSTALL_COOLDOWN_MS,
  PWA_INSTALL_FLAG_KEY,
  resolvePwaInstallEnabled,
} from './pwaInstallConfig.js';
import {
  detectPwaInstallPlatform,
  isStandaloneDisplay,
  persistPwaInstallCooldown,
  PWA_INSTALL_PLATFORM,
  readPwaInstallCooldown,
} from './pwaInstallPlatform.js';
import {
  getDeferredPwaInstallPrompt,
  initializePwaInstallCapture,
  requestCapturedPwaInstall,
  resetPwaInstallPromptStoreForTests,
} from './pwaInstallPromptStore.js';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test.afterEach(() => resetPwaInstallPromptStoreForTests());

test('feature nasce desligada e somente true literal habilita a experiência', () => {
  assert.equal(PWA_INSTALL_FLAG_KEY, 'VITE_PWA_INSTALL_PROMPT_ENABLED');
  assert.equal(resolvePwaInstallEnabled({}), false);
  assert.equal(resolvePwaInstallEnabled({ VITE_PWA_INSTALL_PROMPT_ENABLED: 'TRUE' }), false);
  assert.equal(resolvePwaInstallEnabled({ VITE_PWA_INSTALL_PROMPT_ENABLED: 'true' }), true);
});

test('detecta Safari no iPhone sem confundir navegadores alternativos', () => {
  const safari = { navigator: { userAgent: 'Mozilla/5.0 (iPhone) Version/18.0 Mobile Safari/604.1' } };
  const chrome = { navigator: { userAgent: 'Mozilla/5.0 (iPhone) CriOS/125.0 Mobile Safari/604.1' } };
  assert.equal(detectPwaInstallPlatform(safari), PWA_INSTALL_PLATFORM.IOS_SAFARI);
  assert.equal(detectPwaInstallPlatform(chrome), PWA_INSTALL_PLATFORM.CHROMIUM);
});

test('detecta modo instalado por display-mode ou navigator.standalone', () => {
  assert.equal(isStandaloneDisplay({ matchMedia: () => ({ matches: true }), navigator: {} }), true);
  assert.equal(isStandaloneDisplay({ matchMedia: () => ({ matches: false }), navigator: { standalone: true } }), true);
  assert.equal(isStandaloneDisplay({ matchMedia: () => ({ matches: false }), navigator: {} }), false);
});

test('dispensa persiste cooldown e falha de storage nunca quebra a aplicação', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
  };
  assert.equal(persistPwaInstallCooldown(storage, 1_000), true);
  assert.equal(readPwaInstallCooldown(storage, 1_000 + PWA_INSTALL_COOLDOWN_MS - 1), true);
  assert.equal(readPwaInstallCooldown(storage, 1_000 + PWA_INSTALL_COOLDOWN_MS), false);
  assert.equal(persistPwaInstallCooldown({ setItem: () => { throw new Error('blocked'); } }), false);
});

test('captura beforeinstallprompt somente quando habilitada e chama preventDefault', () => {
  const runtime = new EventTarget();
  let prevented = false;
  const event = Object.assign(new Event('beforeinstallprompt'), {
    preventDefault: () => { prevented = true; },
    prompt: async () => {},
    userChoice: Promise.resolve({ outcome: 'accepted' }),
  });
  initializePwaInstallCapture({ runtime, enabled: false });
  runtime.dispatchEvent(event);
  assert.equal(getDeferredPwaInstallPrompt(), null);

  initializePwaInstallCapture({ runtime, enabled: true });
  runtime.dispatchEvent(event);
  assert.equal(prevented, true);
  assert.equal(getDeferredPwaInstallPrompt(), event);
});

test('instalação Chromium acontece somente após ação explícita e trata aceite', async () => {
  const runtime = new EventTarget();
  let promptCalls = 0;
  const event = Object.assign(new Event('beforeinstallprompt'), {
    prompt: async () => { promptCalls += 1; },
    userChoice: Promise.resolve({ outcome: 'accepted' }),
  });
  initializePwaInstallCapture({ runtime, enabled: true });
  runtime.dispatchEvent(event);
  assert.equal(promptCalls, 0);
  assert.deepEqual(await requestCapturedPwaInstall(), { outcome: 'accepted' });
  assert.equal(promptCalls, 1);
  assert.equal(getDeferredPwaInstallPrompt(), null);
});

test('recusa e erro são resultados seguros, sem insistência automática', async () => {
  const runtime = new EventTarget();
  initializePwaInstallCapture({ runtime, enabled: true });
  runtime.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), {
    prompt: async () => {},
    userChoice: Promise.resolve({ outcome: 'dismissed' }),
  }));
  assert.deepEqual(await requestCapturedPwaInstall(), { outcome: 'dismissed' });
  assert.deepEqual(await requestCapturedPwaInstall(), { outcome: 'unavailable' });
});

test('appinstalled remove qualquer prompt pendente', () => {
  const runtime = new EventTarget();
  initializePwaInstallCapture({ runtime, enabled: true });
  runtime.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), { prompt: async () => {} }));
  assert.ok(getDeferredPwaInstallPrompt());
  runtime.dispatchEvent(new Event('appinstalled'));
  assert.equal(getDeferredPwaInstallPrompt(), null);
});

test('lifecycle PWA reutiliza o store único e nunca força reload em controllerchange', async () => {
  const lifecycle = await source('./pwaUpdateLifecycle.js');
  assert.match(lifecycle, /const manager = getPwaUpdateManager\(\);/);
  assert.match(lifecycle, /const stop = manager\.start\(\);/);
  assert.doesNotMatch(lifecycle, /controllerchange|location\.reload|UPDATE_RELOAD_KEY/);
});

test('lifecycle PWA expoe o diagnostico de build (3 identidades) so no console, nunca em nenhuma tela/fluxo do app', async () => {
  const [lifecycle, home, card] = await Promise.all([
    source('./pwaUpdateLifecycle.js'),
    source('../simplified-app/SimplifiedHomeView.jsx'),
    source('./PwaUpdateCard.jsx'),
  ]);
  assert.match(lifecycle, /runtime\.__uniflowPwaDiagnostic = \(\) => manager\.getDiagnosticSnapshot\(\);/);
  assert.doesNotMatch(home, /__uniflowPwaDiagnostic|getDiagnosticSnapshot/);
  assert.doesNotMatch(card, /__uniflowPwaDiagnostic|getDiagnosticSnapshot/);
});

test('lifecycle PWA remove o helper de console e para o manager no cleanup, sem vazar nenhum dos dois', async () => {
  const lifecycle = await source('./pwaUpdateLifecycle.js');
  assert.match(lifecycle, /return \(\) => \{\s*\n\s*stop\(\);\s*\n\s*removeConsoleHelper\(\);\s*\n\s*\};/);
});

test('UI aparece imediatamente, mesmo sem prompt nativo, e orienta Chrome e iOS', async () => {
  const [component, css] = await Promise.all([
    source('./PwaInstallExperience.jsx'),
    source('./PwaInstallExperience.module.css'),
  ]);
  assert.match(component, /Compartilhar/);
  assert.match(component, /Adicionar à Tela de Início/);
  assert.match(component, /Instalar app/);
  assert.match(component, /sem APK externo/);
  assert.match(component, /requestCapturedPwaInstall\(\)/);
  assert.match(component, /readPwaInstallCooldown/);
  assert.match(component, /globalThis\.sessionStorage/);
  assert.match(component, /isStandaloneDisplay\(\)/);
  assert.match(component, /platform !== PWA_INSTALL_PLATFORM\.UNSUPPORTED/);
  assert.doesNotMatch(component, /setTimeout|PWA_INSTALL_INITIAL_DELAY_MS/);
  assert.doesNotMatch(component, /&& \(platform === PWA_INSTALL_PLATFORM\.IOS_SAFARI \|\| Boolean\(deferredPrompt\)\)/);
  assert.match(component, /aria-labelledby="pwa-install-title"/);
  assert.doesNotMatch(component, /role="dialog"|aria-modal/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test('Home oferece instalação dentro do fluxo e a Conta não mantém uma cópia paralela', async () => {
  const [shell, home, main, config] = await Promise.all([
    source('../simplified-app/SimplifiedAppShell.jsx'),
    source('../simplified-app/SimplifiedHomeView.jsx'),
    source('../../main.jsx'),
    source('./pwaInstallConfig.js'),
  ]);
  assert.match(home, /<PwaInstallExperience \/>/);
  assert.ok(home.indexOf('<PwaInstallExperience />') < home.indexOf('<CompactResponse'));
  assert.doesNotMatch(shell, /PwaInstallExperience/);
  assert.match(main, /initializePwaInstallCapture\(\)/);
  assert.match(config, /PWA_INSTALL_ENABLED = resolvePwaInstallEnabled\(import\.meta\.env\)/);
});
