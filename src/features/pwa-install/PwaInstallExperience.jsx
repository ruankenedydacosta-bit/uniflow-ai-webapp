import { useEffect, useState } from 'react';
import { PWA_INSTALL_ENABLED } from './pwaInstallConfig.js';
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
  const [isVisible, setIsVisible] = useState(true);
  const [isInstalling, setIsInstalling] = useState(false);
  const platform = detectPwaInstallPlatform();
  const canOffer = PWA_INSTALL_ENABLED
    && !isStandaloneDisplay()
    && !readPwaInstallCooldown(globalThis.sessionStorage)
    && platform !== PWA_INSTALL_PLATFORM.UNSUPPORTED;

  useEffect(() => subscribeToPwaInstallPrompt(setDeferredPrompt), []);

  useEffect(() => {
    const handleInstalled = () => setIsVisible(false);
    globalThis.addEventListener?.('appinstalled', handleInstalled);
    return () => globalThis.removeEventListener?.('appinstalled', handleInstalled);
  }, []);

  function dismiss() {
    persistPwaInstallCooldown(globalThis.sessionStorage);
    setIsVisible(false);
  }

  async function install() {
    if (!deferredPrompt) return;
    setIsInstalling(true);
    const result = await requestCapturedPwaInstall();
    setIsInstalling(false);
    if (result.outcome !== 'accepted') persistPwaInstallCooldown(globalThis.sessionStorage);
    setIsVisible(false);
  }

  if (!canOffer || !isVisible) return null;

  const isIos = platform === PWA_INSTALL_PLATFORM.IOS_SAFARI;
  const canInstallDirectly = Boolean(deferredPrompt);
  return (
    <aside className={styles.prompt} aria-labelledby="pwa-install-title" data-pwa-install-prompt>
      <button type="button" className={styles.closeButton} onClick={dismiss} aria-label="Lembrar mais tarde">
        ×
      </button>
      <div className={styles.icon} aria-hidden="true">↓</div>
      <div className={styles.content}>
        <span className={styles.eyebrow}>Acesso mais rápido</span>
        <h2 id="pwa-install-title">Leve a UniFlow com você</h2>
        {isIos ? (
          <p>Instale com segurança pelo Safari: toque em <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>.</p>
        ) : canInstallDirectly ? (
          <p>Abra sua vida financeira com um toque, direto pela tela inicial do dispositivo.</p>
        ) : (
          <p>No Chrome, abra o menu <strong>⋮</strong> e escolha <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.</p>
        )}
        <small>Instalação segura pelo navegador, sem APK externo.</small>
      </div>
      {isIos || !canInstallDirectly ? (
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
