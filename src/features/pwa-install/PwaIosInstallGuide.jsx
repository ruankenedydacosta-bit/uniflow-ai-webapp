import { useState } from 'react';
import Button from '../../components/ui/Button/Button.jsx';
import Modal from '../../components/ui/Modal/Modal.jsx';
import styles from './PwaIosInstallGuide.module.css';

// IPHONE-INSTALL1: 3 desenhos simples e esquemáticos (nunca uma captura de
// tela do Safari, que quebraria a cada versão de iOS/idioma) -- só as
// formas que identificam cada ação: o ícone real de "Compartilhar" do
// iOS (quadrado com seta saindo por cima), um retângulo com "+" (Adicionar
// à Tela de Início) e um cartão de app com check (instalado/Adicionar).
function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={styles.stepIcon}>
      <path d="M12 3v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.5 7.5 12 3l4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 12v6.5A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AddToHomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={styles.stepIcon}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" stroke="currentColor" strokeWidth="2" />
      <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ConfirmAddIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={styles.stepIcon}>
      <rect x="3.5" y="5.5" width="17" height="13" rx="3" stroke="currentColor" strokeWidth="2" />
      <path d="M8 9.5h8M8 12.5h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M14.5 16.5l1.6 1.6L19.5 14.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const STEPS = [
  {
    icon: ShareIcon,
    title: 'Toque no ícone Compartilhar',
    description: 'Na barra do Safari, toque no ícone de compartilhar.',
  },
  {
    icon: AddToHomeIcon,
    title: 'Escolha "Adicionar à Tela de Início"',
    description: 'Role a lista de opções até encontrar esse item.',
  },
  {
    icon: ConfirmAddIcon,
    title: 'Ative "Abrir como App da Web" e toque em Adicionar',
    description: 'Pronto -- a UniFlow aparece na sua tela inicial.',
  },
];

/**
 * IPHONE-INSTALL1: Safari/iOS não oferece instalação de PWA via
 * beforeinstallprompt (nenhum navegador iOS oferece, mesmo os que usam
 * outra marca -- todos rodam sobre o motor da Apple). Este guia nunca
 * finge que a UniFlow consegue instalar sozinha: só ensina os passos
 * reais, com desenhos esquemáticos (nunca screenshot fixa, que quebraria
 * a cada versão/idioma do Safari).
 *
 * `inSafari=false` cobre o caso de um iPhone rodando outro navegador
 * (Chrome/Firefox/Edge para iOS) -- nenhum deles consegue completar este
 * fluxo, então orientamos abrir no Safari em vez de mostrar passos que
 * não existem ali. Nunca usamos um URL scheme privado para forçar o
 * Safari a abrir -- só copiamos o link para o usuário colar onde quiser.
 */
function PwaIosInstallGuide({ open, onClose, inSafari = true }) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await globalThis.navigator?.clipboard?.writeText?.(globalThis.location?.href ?? '');
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={inSafari ? 'Instale a UniFlow no seu iPhone' : 'Abra no Safari para instalar'}
      description={inSafari ? 'Leva menos de 20 segundos.' : undefined}
      footer={<Button variant="ghost" onClick={onClose}>Fechar</Button>}
    >
      {inSafari ? (
        <ol className={styles.steps}>
          {STEPS.map((step, index) => {
            const StepIcon = step.icon;
            return (
              <li key={step.title} className={styles.step}>
                <span className={styles.stepNumber} aria-hidden="true">{index + 1}</span>
                <span className={styles.stepIconWrap}><StepIcon /></span>
                <span className={styles.stepText}>
                  <strong>{step.title}</strong>
                  <span>{step.description}</span>
                </span>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className={styles.notSafari}>
          <p>Abra esta página no Safari para instalar a UniFlow.</p>
          <Button variant="secondary" fullWidth onClick={copyLink}>
            {copied ? 'Link copiado!' : 'Copiar link'}
          </Button>
        </div>
      )}
    </Modal>
  );
}

export default PwaIosInstallGuide;
