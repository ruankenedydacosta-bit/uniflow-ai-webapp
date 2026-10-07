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

test('feature é uma decisão de produto ligada por padrão -- só "false" literal (kill switch) desliga', () => {
  assert.equal(PWA_INSTALL_FLAG_KEY, 'VITE_PWA_INSTALL_PROMPT_ENABLED');
  assert.equal(resolvePwaInstallEnabled({}), true, 'sem a env var definida (caso real do Vercel hoje) precisa continuar ligada');
  assert.equal(resolvePwaInstallEnabled({ VITE_PWA_INSTALL_PROMPT_ENABLED: 'true' }), true);
  assert.equal(resolvePwaInstallEnabled({ VITE_PWA_INSTALL_PROMPT_ENABLED: 'FALSE' }), true, 'só o literal exato "false" desliga -- nunca variações de caixa');
  assert.equal(resolvePwaInstallEnabled({ VITE_PWA_INSTALL_PROMPT_ENABLED: 'false' }), false);
});

test('detecta Safari no iPhone e separa (nunca confunde com Chromium) qualquer outro navegador iOS', () => {
  const safari = { navigator: { userAgent: 'Mozilla/5.0 (iPhone) Version/18.0 Mobile Safari/604.1' } };
  const chromeIos = { navigator: { userAgent: 'Mozilla/5.0 (iPhone) CriOS/125.0 Mobile Safari/604.1' } };
  const firefoxIos = { navigator: { userAgent: 'Mozilla/5.0 (iPhone) FxiOS/125.0 Mobile Safari/604.1' } };
  const edgeIos = { navigator: { userAgent: 'Mozilla/5.0 (iPhone) EdgiOS/125.0 Mobile Safari/604.1' } };
  const operaIos = { navigator: { userAgent: 'Mozilla/5.0 (iPhone) OPiOS/125.0 Mobile Safari/604.1' } };
  const chromeAndroid = { navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/125.0 Mobile Safari/537.36' } };
  const chromeDesktop = { navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/125.0 Safari/537.36' } };

  assert.equal(detectPwaInstallPlatform(safari), PWA_INSTALL_PLATFORM.IOS_SAFARI);
  // BUG REAL corrigido: CriOS/FxiOS/EdgiOS/OPiOS num iPhone rodam sobre o
  // motor da Apple -- nenhum deles consegue "Adicionar à Tela de Início"
  // como app. Antes desta correção, o regex de Chromium casava com
  // "CriOS"/"EdgiOS" e mostrava o fluxo/copy ERRADO (beforeinstallprompt
  // que nunca dispara nesse navegador).
  for (const runtime of [chromeIos, firefoxIos, edgeIos, operaIos]) {
    assert.equal(detectPwaInstallPlatform(runtime), PWA_INSTALL_PLATFORM.IOS_OTHER_BROWSER);
  }
  assert.equal(detectPwaInstallPlatform(chromeAndroid), PWA_INSTALL_PLATFORM.CHROMIUM);
  assert.equal(detectPwaInstallPlatform(chromeDesktop), PWA_INSTALL_PLATFORM.CHROMIUM);
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
  const [lifecycle, home, blockHook] = await Promise.all([
    source('./pwaUpdateLifecycle.js'),
    source('../simplified-app/SimplifiedHomeView.jsx'),
    source('./usePwaAutoUpdateBlock.js'),
  ]);
  assert.match(lifecycle, /runtime\.__uniflowPwaDiagnostic = \(\) => manager\.getDiagnosticSnapshot\(\);/);
  assert.doesNotMatch(home, /__uniflowPwaDiagnostic|getDiagnosticSnapshot/);
  assert.doesNotMatch(blockHook, /__uniflowPwaDiagnostic|getDiagnosticSnapshot/);
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
  assert.match(component, /Instalar app/);
  assert.match(component, /sem APK externo/);
  assert.match(component, /requestCapturedPwaInstall\(\)/);
  assert.match(component, /readPwaInstallCooldown/);
  assert.match(component, /globalThis\.sessionStorage/);
  // TESTE IPHONE INSTALL 4: standalone precisa fazer parte da condição de
  // exibição -- nunca mostrar o CTA para quem já instalou.
  assert.match(component, /!isStandaloneDisplay\(\)/);
  assert.match(component, /platform !== PWA_INSTALL_PLATFORM\.UNSUPPORTED/);
  assert.doesNotMatch(component, /setTimeout|PWA_INSTALL_INITIAL_DELAY_MS/);
  assert.match(component, /aria-labelledby="pwa-install-title"/);
  // O card em si nunca é o dialog -- role="dialog"/aria-modal só existe
  // dentro de PwaIosInstallGuide.jsx (via Modal), nunca duplicado aqui.
  assert.doesNotMatch(component, /role="dialog"|aria-modal/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

// TESTE IPHONE INSTALL 1+2+6: CTA "Instalar UniFlow no iPhone" só existe
// para os 2 estados iOS, e abre o guia -- nunca aparece a mesma copy em
// Android/desktop (lá o fluxo é beforeinstallprompt, sem menção a iPhone).
test('CTA de iPhone abre o guia (nunca a copy generica de Chrome), e desktop/Android nunca veem a copy de iPhone', async () => {
  const component = await source('./PwaInstallExperience.jsx');
  assert.match(component, /const isIos = platform === PWA_INSTALL_PLATFORM\.IOS_SAFARI \|\| platform === PWA_INSTALL_PLATFORM\.IOS_OTHER_BROWSER;/);
  assert.match(component, /Instalar UniFlow no iPhone/);
  assert.match(component, /onClick=\{\(\) => setGuideOpen\(true\)\}/);
  assert.match(component, /<PwaIosInstallGuide/);
  assert.match(component, /inSafari=\{platform === PWA_INSTALL_PLATFORM\.IOS_SAFARI\}/);
  // A copy "Instalar UniFlow no iPhone" só é alcançável dentro do ramo
  // `isIos ? ... : ...` -- em qualquer outra plataforma (Chromium/desktop)
  // o componente cai nos ramos de deferredPrompt/menu do Chrome abaixo.
  const iosCopyIndex = component.indexOf('Instalar UniFlow no iPhone');
  const isIosDeclarationIndex = component.indexOf('const isIos =');
  assert.ok(iosCopyIndex > isIosDeclarationIndex);
});

// TESTE IPHONE INSTALL 7: fechar o guia só limpa estado local (setGuideOpen),
// nunca navega/desmonta o resto da página.
test('fechar o guia é só um setGuideOpen(false) local -- nunca navega nem desmonta a Home', async () => {
  const component = await source('./PwaInstallExperience.jsx');
  assert.match(component, /onClose=\{\(\) => setGuideOpen\(false\)\}/);
  assert.doesNotMatch(component, /navigate\(|window\.location/);
});

// ============================================================================
// TESTES IPHONE INSTALL -- guia de instalação (PwaIosInstallGuide.jsx)
// ============================================================================

test('guia iOS (Safari) mostra os 3 passos corretos, com desenhos esquemáticos (nunca screenshot)', async () => {
  const guide = await source('./PwaIosInstallGuide.jsx');
  assert.match(guide, /Instale a UniFlow no seu iPhone/);
  assert.match(guide, /Leva menos de 20 segundos\./);
  assert.match(guide, /Toque no ícone Compartilhar/);
  assert.match(guide, /Escolha "Adicionar à Tela de Início"/);
  assert.match(guide, /Ative "Abrir como App da Web" e toque em Adicionar/);
  assert.match(guide, /<svg /);
  assert.doesNotMatch(guide, /\.(png|jpe?g|webp)['"]/, 'nunca uma imagem/screenshot fixa do Safari');
});

test('guia usa o componente Modal compartilhado (role="dialog"/aria-modal vive lá, nunca duplicado)', async () => {
  const guide = await source('./PwaIosInstallGuide.jsx');
  assert.match(guide, /import Modal from '\.\.\/\.\.\/components\/ui\/Modal\/Modal\.jsx';/);
  assert.doesNotMatch(guide, /role="dialog"|aria-modal/);
});

test('guia detecta "não está no Safari" e oferece Copiar link -- nunca um URL scheme privado para forçar o Safari', async () => {
  const guide = await source('./PwaIosInstallGuide.jsx');
  assert.match(guide, /Abra esta página no Safari para instalar a UniFlow\./);
  assert.match(guide, /Copiar link/);
  assert.match(guide, /navigator\?\.clipboard\?\.writeText\?\.\(globalThis\.location\?\.href/);
  assert.doesNotMatch(guide, /safari-http|x-web-search|window\.open/);
});

test('guia é acionado por inSafari -- nunca mistura os passos do Safari com a mensagem de outro navegador', async () => {
  const guide = await source('./PwaIosInstallGuide.jsx');
  assert.match(guide, /inSafari = true/);
  assert.match(guide, /\{inSafari \? \(/);
});

test('Home oferece instalação dentro do fluxo e a Conta não mantém uma cópia paralela', async () => {
  const [shell, home, main, config] = await Promise.all([
    source('../simplified-app/SimplifiedAppShell.jsx'),
    source('../simplified-app/SimplifiedHomeView.jsx'),
    source('../../main.jsx'),
    source('./pwaInstallConfig.js'),
  ]);
  assert.match(home, /<PwaInstallExperience \/>/);
  // A resposta é montada numa constante e renderizada neste ponto da Home.
  assert.ok(home.indexOf('<PwaInstallExperience />') < home.indexOf('{isVoiceModeOpen ? null : compactResponse}'));
  assert.doesNotMatch(shell, /PwaInstallExperience/);
  assert.match(main, /initializePwaInstallCapture\(\)/);
  assert.match(config, /PWA_INSTALL_ENABLED = resolvePwaInstallEnabled\(import\.meta\.env\)/);
});
