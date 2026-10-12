import { useEffect, useState } from 'react';
import IconBox from '../../components/ui/IconBox/IconBox.jsx';
import OutlineButton from '../../components/ui/OutlineButton/OutlineButton.jsx';
import { PhDownloadSimpleIcon, PhXIcon } from '../simplified-app/SimplifiedIcons.jsx';
import { PWA_INSTALL_ENABLED } from './pwaInstallConfig.js';
import {
  detectPwaInstallPlatform,
  isStandaloneDisplay,
  persistPwaInstallCooldown,
  PWA_INSTALL_PLATFORM,
  readPwaInstallCooldown,
  readPwaInstalledMark,
} from './pwaInstallPlatform.js';
import {
  getDeferredPwaInstallPrompt,
  requestCapturedPwaInstall,
  subscribeToPwaInstallPrompt,
} from './pwaInstallPromptStore.js';
import PwaIosInstallGuide from './PwaIosInstallGuide.jsx';
import styles from './PwaInstallExperience.module.css';

function PwaInstallExperience() {
  const [deferredPrompt, setDeferredPrompt] = useState(() => getDeferredPwaInstallPrompt());
  const [isVisible, setIsVisible] = useState(true);
  const [isInstalling, setIsInstalling] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const platform = detectPwaInstallPlatform();
  const canOffer = PWA_INSTALL_ENABLED
    && !isStandaloneDisplay()
    && !readPwaInstalledMark()
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

  // IPHONE-INSTALL1: os dois estados iOS (Safari real ou outro navegador
  // rodando sobre o mesmo motor) abrem o MESMO guia -- ele decide
  // internamente entre os 3 passos e a mensagem "abra no Safari", nunca
  // duas UIs de entrada distintas para o usuário escolher errado.
  const isIos = platform === PWA_INSTALL_PLATFORM.IOS_SAFARI || platform === PWA_INSTALL_PLATFORM.IOS_OTHER_BROWSER;
  const canInstallDirectly = Boolean(deferredPrompt);
  // Tela 22k: mesmo lugar e forma do aviso de minutos (tela 19), com borda
  // azul. No Android sem o pedido do navegador, o card só ensina o caminho
  // pelo menu do Chrome e oferece "Entendi".
  return (
    <>
      <aside className={styles.prompt} aria-labelledby="pwa-install-title" data-pwa-install-prompt>
        <div className={styles.body}>
          <IconBox tone="blue"><PhDownloadSimpleIcon /></IconBox>
          <div className={styles.content}>
            <h2 id="pwa-install-title">{isIos ? 'Instale a UniFlow no iPhone' : 'Instale a UniFlow'}</h2>
            {isIos || canInstallDirectly ? (
              <p>Abra o app direto da tela inicial. A instalação é feita pelo navegador.</p>
            ) : (
              <p>No Chrome, abra o menu <strong>⋮</strong> e escolha <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.</p>
            )}
          </div>
          <button type="button" className={styles.closeButton} onClick={dismiss} aria-label="Agora não">
            <PhXIcon />
          </button>
        </div>
        <div className={styles.actions}>
          {isIos ? (
            <>
              <OutlineButton variant="secondary" onClick={() => setGuideOpen(true)}>Instalar</OutlineButton>
              <OutlineButton variant="ghost" onClick={dismiss}>Agora não</OutlineButton>
            </>
          ) : !canInstallDirectly ? (
            <OutlineButton variant="ghost" onClick={dismiss}>Entendi</OutlineButton>
          ) : (
            <>
              <OutlineButton variant="secondary" onClick={install} loading={isInstalling}>Instalar</OutlineButton>
              <OutlineButton variant="ghost" onClick={dismiss} disabled={isInstalling}>Agora não</OutlineButton>
            </>
          )}
        </div>
      </aside>
      {isIos ? (
        <PwaIosInstallGuide
          open={guideOpen}
          onClose={() => setGuideOpen(false)}
          inSafari={platform === PWA_INSTALL_PLATFORM.IOS_SAFARI}
        />
      ) : null}
    </>
  );
}

export default PwaInstallExperience;
