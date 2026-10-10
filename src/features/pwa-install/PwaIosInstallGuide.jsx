import { useState } from 'react';
import IconBox from '../../components/ui/IconBox/IconBox.jsx';
import Modal from '../../components/ui/Modal/Modal.jsx';
import OutlineButton from '../../components/ui/OutlineButton/OutlineButton.jsx';
import { PhCheckSquareIcon, PhExportIcon, PhPlusSquareIcon } from '../simplified-app/SimplifiedIcons.jsx';
import styles from './PwaIosInstallGuide.module.css';

// IPHONE-INSTALL1: ícones simples de cada ação (nunca uma captura de tela
// do Safari, que quebraria a cada versão de iOS/idioma): Compartilhar,
// Adicionar à Tela de Início e a confirmação. Tela 22j: ícones Phosphor
// (export, plus-square, check-square) numa caixa de 36px.
const STEPS = [
  {
    icon: PhExportIcon,
    tone: 'blue',
    title: 'Toque em Compartilhar',
    description: 'Fica na barra do Safari.',
  },
  {
    icon: PhPlusSquareIcon,
    tone: 'blue',
    title: 'Toque em Adicionar à Tela de Início',
    description: 'Role a lista até encontrar essa opção.',
  },
  {
    icon: PhCheckSquareIcon,
    tone: 'green',
    title: 'Ative Abrir como App da Web e toque em Adicionar',
    description: 'A UniFlow aparece na sua tela inicial.',
  },
];

/**
 * IPHONE-INSTALL1: Safari/iOS não oferece instalação de PWA via
 * beforeinstallprompt (nenhum navegador iOS oferece, mesmo os que usam
 * outra marca -- todos rodam sobre o motor da Apple). Este guia nunca
 * finge que a UniFlow consegue instalar sozinha: só ensina os passos
 * reais, com ícones simples (nunca screenshot fixa, que quebraria a cada
 * versão/idioma do Safari).
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
      title={inSafari ? 'Instale a UniFlow no iPhone' : 'Abra no Safari para instalar'}
      description={inSafari ? 'Leva menos de 20 segundos.' : undefined}
    >
      {inSafari ? (
        <div className={styles.content}>
          <ol className={styles.steps}>
            {STEPS.map((step, index) => {
              const StepIcon = step.icon;
              return (
                <li key={step.title} className={styles.step}>
                  <span className={styles.stepNumber} aria-hidden="true">{index + 1}</span>
                  <IconBox tone={step.tone}><StepIcon /></IconBox>
                  <span className={styles.stepText}>
                    <strong>{step.title}</strong>
                    <span>{step.description}</span>
                  </span>
                </li>
              );
            })}
          </ol>
          <OutlineButton className={styles.action} onClick={onClose}>Entendi</OutlineButton>
        </div>
      ) : (
        <div className={styles.content}>
          <p className={styles.notSafari}>Abra esta página no Safari para instalar a UniFlow.</p>
          <OutlineButton className={styles.action} onClick={copyLink}>
            {copied ? 'Link copiado!' : 'Copiar link'}
          </OutlineButton>
        </div>
      )}
    </Modal>
  );
}

export default PwaIosInstallGuide;
