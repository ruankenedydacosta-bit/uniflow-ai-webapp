import { PWA_INSTALL_COOLDOWN_MS, PWA_INSTALL_DISMISS_KEY } from './pwaInstallConfig.js';

export const PWA_INSTALL_PLATFORM = Object.freeze({
  IOS_SAFARI: 'ios-safari',
  // IPHONE-INSTALL1: iOS + um navegador que NÃO é Safari (Chrome/Firefox/
  // Edge/Opera para iOS). Nenhum deles consegue completar "Adicionar à
  // Tela de Início" como app -- todos rodam sobre o motor da Apple, que
  // não expõe esse fluxo fora do próprio Safari. Precisa de um estado
  // PRÓPRIO (nunca cair em CHROMIUM): a UI para este caso é "abra no
  // Safari", nunca o guia de 3 passos nem um beforeinstallprompt que
  // jamais vai disparar nesse navegador.
  IOS_OTHER_BROWSER: 'ios-other-browser',
  CHROMIUM: 'chromium',
  UNSUPPORTED: 'unsupported',
});

export function isStandaloneDisplay(runtime = globalThis) {
  return runtime?.matchMedia?.('(display-mode: standalone)')?.matches === true
    || runtime?.navigator?.standalone === true;
}

export function detectPwaInstallPlatform(runtime = globalThis) {
  const navigator = runtime?.navigator;
  const userAgent = String(navigator?.userAgent ?? '');
  const isTouchMac = navigator?.platform === 'MacIntel' && Number(navigator?.maxTouchPoints) > 1;
  const isIos = /iPad|iPhone|iPod/i.test(userAgent) || isTouchMac;
  const isAlternativeIosBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/i.test(userAgent);

  // IPHONE-INSTALL1: todo iOS precisa cair em um dos dois estados iOS --
  // NUNCA passar adiante para a checagem de Chromium abaixo, mesmo que a
  // UA contenha "CriOS"/"EdgiOS" (que também casariam com aquele regex).
  if (isIos) {
    return isAlternativeIosBrowser ? PWA_INSTALL_PLATFORM.IOS_OTHER_BROWSER : PWA_INSTALL_PLATFORM.IOS_SAFARI;
  }
  if (/Chrome|Chromium|CriOS|EdgA|EdgiOS/i.test(userAgent)) return PWA_INSTALL_PLATFORM.CHROMIUM;
  return PWA_INSTALL_PLATFORM.UNSUPPORTED;
}

export function readPwaInstallCooldown(storage, now = Date.now()) {
  try {
    const dismissedUntil = Number(storage?.getItem(PWA_INSTALL_DISMISS_KEY));
    return Number.isFinite(dismissedUntil) && dismissedUntil > now;
  } catch {
    return false;
  }
}

export function persistPwaInstallCooldown(storage, now = Date.now()) {
  try {
    storage?.setItem(PWA_INSTALL_DISMISS_KEY, String(now + PWA_INSTALL_COOLDOWN_MS));
    return true;
  } catch {
    return false;
  }
}
