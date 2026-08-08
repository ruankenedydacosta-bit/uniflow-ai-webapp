import { useEffect, useState } from 'react';
import {
  PWA_INSTALL_ENABLED,
  PWA_INSTALL_INITIAL_DELAY_MS,
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
  requestCapturedPwaInstall,
  subscribeToPwaInstallPrompt,
} from './pwaInstallPromptStore.js';
import styles from './PwaInstallExperience.module.css';

function PwaInstallExperience() {
  const [deferredPrompt, setDeferredPrompt] = useState(() => getDeferredPwaInstallPrompt());
  const [isVisible, setIsVisible] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const platform = detectPwaInstallPlatform();
  const canOffer = PWA_INSTALL_ENABLED
    && !isStandaloneDisplay()
    && !readPwaInstallCooldown(globalThis.localStorage)
    && (platform === PWA_INSTALL_PLATFORM.IOS_SAFARI || Boolean(deferredPrompt));

  useEffect(() => subscribeToPwaInstallPrompt(setDeferredPrompt), []);

  useEffect(() => {
    if (!canOffer) return undefined;

    const timer = globalThis.setTimeout(() => setIsVisible(true), PWA_INSTALL_INITIAL_DELAY_MS);
    return () => globalThis.clearTimeout(timer);
  }, [canOffer]);

  function dismiss() {
    persistPwaInstallCooldown(globalThis.localStorage);
    setIsVisible(false);
  }

  async function install() {
    if (platform === PWA_INSTALL_PLATFORM.IOS_SAFARI) return;
    setIsInstalling(true);
    const result = await requestCapturedPwaInstall();
    setIsInstalling(false);
    if (result.outcome !== 'accepted') persistPwaInstallCooldown(globalThis.localStorage);
    setIsVisible(false);
  }

  if (!canOffer || !isVisible) return null;

  const isIos = platform === PWA_INSTALL_PLATFORM.IOS_SAFARI;
  return (
    <aside className={styles.prompt} aria-labelledby="pwa-install-title" data-pwa-install-prompt>
      <button type="button" className={styles.closeButton} onClick={dismiss} aria-label="Lembrar mais tarde">
        ×
      </button>
      <div className={styles.icon} aria-hidden="true">↓</div>
      <div className={styles.content}>
        <h2 id="pwa-install-title">Instalar a UniFlow AI</h2>
        {isIos ? (
          <p>No Safari, toque em <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>.</p>
        ) : (
          <p>Tenha acesso mais rápido pela tela inicial do seu dispositivo.</p>
        )}
      </div>
      {isIos ? (
        <button type="button" className={styles.secondaryButton} onClick={dismiss}>Entendi</button>
      ) : (
        <button type="button" className={styles.installButton} onClick={install} disabled={isInstalling}>
          {isInstalling ? 'Instalando...' : 'Instalar'}
        </button>
      )}
    </aside>
  );
}

export default PwaInstallExperience;
