import assert from 'node:assert/strict';
import test from 'node:test';
import { detectMobilePushCapabilities } from './mobilePushCapabilities.js';

function fakeNav(overrides = {}) {
  return { userAgent: '', ...overrides };
}

function fakeWin({ hasPushManager = false, hasNotification = false, permission = 'default', standalone = false } = {}) {
  const win = { matchMedia: () => ({ matches: standalone }) };
  if (hasPushManager) win.PushManager = function PushManager() {};
  if (hasNotification) win.Notification = { permission };
  return win;
}

test('navegador sem PushManager nunca e considerado suportado', () => {
  const result = detectMobilePushCapabilities({
    nav: fakeNav({ serviceWorker: undefined }),
    win: fakeWin({ hasPushManager: false, hasNotification: true }),
  });
  assert.equal(result.hasPushManager, false);
  assert.equal(result.isSupported, false);
});

test('navegador com todas as APIs e permission default e considerado suportado', () => {
  const result = detectMobilePushCapabilities({
    nav: { ...fakeNav(), serviceWorker: {} },
    win: fakeWin({ hasPushManager: true, hasNotification: true, permission: 'default' }),
  });
  assert.equal(result.isSupported, true);
  assert.equal(result.permission, 'default');
});

test('permission granted e refletida sem alterar isSupported', () => {
  const result = detectMobilePushCapabilities({
    nav: { ...fakeNav(), serviceWorker: {} },
    win: fakeWin({ hasPushManager: true, hasNotification: true, permission: 'granted' }),
  });
  assert.equal(result.permission, 'granted');
  assert.equal(result.isSupported, true);
});

test('permission denied e refletida sem alterar isSupported', () => {
  const result = detectMobilePushCapabilities({
    nav: { ...fakeNav(), serviceWorker: {} },
    win: fakeWin({ hasPushManager: true, hasNotification: true, permission: 'denied' }),
  });
  assert.equal(result.permission, 'denied');
  assert.equal(result.isSupported, true);
});

test('sem Notification API, permission e "unsupported" (nunca lanca)', () => {
  const result = detectMobilePushCapabilities({
    nav: { ...fakeNav(), serviceWorker: {} },
    win: fakeWin({ hasPushManager: true, hasNotification: false }),
  });
  assert.equal(result.permission, 'unsupported');
});

test('iOS fora do standalone precisa adicionar a Tela de Inicio', () => {
  const result = detectMobilePushCapabilities({
    nav: fakeNav({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', serviceWorker: {} }),
    win: fakeWin({ hasPushManager: false, hasNotification: false, standalone: false }),
  });
  assert.equal(result.isIOS, true);
  assert.equal(result.isStandalone, false);
  assert.equal(result.needsAddToHomeScreen, true);
});

test('iOS dentro do standalone (adicionado a Tela de Inicio) nao precisa de instrucao extra', () => {
  const result = detectMobilePushCapabilities({
    nav: fakeNav({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', serviceWorker: {}, standalone: true }),
    win: fakeWin({ hasPushManager: true, hasNotification: true, standalone: true }),
  });
  assert.equal(result.needsAddToHomeScreen, false);
});

test('Android nunca e classificado como iOS', () => {
  const result = detectMobilePushCapabilities({
    nav: fakeNav({ userAgent: 'Mozilla/5.0 (Linux; Android 14)', serviceWorker: {} }),
    win: fakeWin({ hasPushManager: true, hasNotification: true }),
  });
  assert.equal(result.isAndroid, true);
  assert.equal(result.isIOS, false);
  assert.equal(result.needsAddToHomeScreen, false);
});

test('desktop (nem iOS nem Android) e classificado corretamente', () => {
  const result = detectMobilePushCapabilities({
    nav: fakeNav({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', serviceWorker: {} }),
    win: fakeWin({ hasPushManager: true, hasNotification: true }),
  });
  assert.equal(result.isAndroid, false);
  assert.equal(result.isIOS, false);
});
