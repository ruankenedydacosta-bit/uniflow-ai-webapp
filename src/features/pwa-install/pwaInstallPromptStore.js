import { PWA_INSTALL_ENABLED } from './pwaInstallConfig.js';

let deferredPrompt = null;
let removeCaptureListeners = null;
const subscribers = new Set();

function notifySubscribers() {
  for (const subscriber of subscribers) subscriber(deferredPrompt);
}

export function getDeferredPwaInstallPrompt() {
  return deferredPrompt;
}

export function subscribeToPwaInstallPrompt(subscriber) {
  if (typeof subscriber !== 'function') return () => {};
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
}

export function initializePwaInstallCapture({ runtime = globalThis, enabled = PWA_INSTALL_ENABLED } = {}) {
  if (!enabled || removeCaptureListeners || typeof runtime?.addEventListener !== 'function') {
    return () => {};
  }

  function handleBeforeInstallPrompt(event) {
    event.preventDefault?.();
    deferredPrompt = event;
    notifySubscribers();
  }

  function handleAppInstalled() {
    deferredPrompt = null;
    notifySubscribers();
  }

  runtime.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  runtime.addEventListener('appinstalled', handleAppInstalled);
  removeCaptureListeners = () => {
    runtime.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    runtime.removeEventListener('appinstalled', handleAppInstalled);
    removeCaptureListeners = null;
    deferredPrompt = null;
    notifySubscribers();
  };
  return removeCaptureListeners;
}

export async function requestCapturedPwaInstall() {
  const prompt = deferredPrompt;
  if (!prompt || typeof prompt.prompt !== 'function') return Object.freeze({ outcome: 'unavailable' });

  try {
    await prompt.prompt();
    const choice = await prompt.userChoice;
    deferredPrompt = null;
    notifySubscribers();
    return Object.freeze({ outcome: choice?.outcome === 'accepted' ? 'accepted' : 'dismissed' });
  } catch {
    deferredPrompt = null;
    notifySubscribers();
    return Object.freeze({ outcome: 'error' });
  }
}

export function resetPwaInstallPromptStoreForTests() {
  removeCaptureListeners?.();
  deferredPrompt = null;
  subscribers.clear();
}
