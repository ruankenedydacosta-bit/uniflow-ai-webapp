import { useLayoutEffect, useRef } from 'react';
import { UniRingOrb, UNI_RING_ORB_STATES } from '../components/ui/UniRingOrb';
import styles from './AppBootScreen.module.css';

// Tela de espera enquanto o app abre (sessão e assinatura). Mostra a Uni
// girando, a mesma do assistente de voz, no lugar do spinner genérico.
// A splash do index.html já está girando quando esta tela monta. Antes do
// primeiro desenho, as animações daqui passam a contar do mesmo instante
// que as da splash, e a splash sai: a Uni troca sem voltar o anel ao início.
// Os tempos de cada parte são iguais nas duas, então basta igualar o início.
function alignWithSplash(root) {
  try {
    const splash = document.getElementById('uniflow-splash');
    const startTime = splash?.getAnimations({ subtree: true })[0]?.startTime;
    if (startTime === null || startTime === undefined) return;
    root.getAnimations({ subtree: true }).forEach((animation) => {
      animation.startTime = startTime;
    });
  } catch {
    // Sem Web Animations, a troca só reinicia a animação.
  }
}

function AppBootScreen({ label }) {
  const rootRef = useRef(null);

  useLayoutEffect(() => {
    if (rootRef.current) alignWithSplash(rootRef.current);
    window.uniflowHideSplash?.();
  }, []);

  return (
    <div ref={rootRef} className={styles.screen} role="status" aria-live="polite" aria-label={label || 'Carregando'}>
      <UniRingOrb size={112} state={UNI_RING_ORB_STATES.THINKING} />
      {label ? <p className={styles.label}>{label}</p> : null}
    </div>
  );
}

export default AppBootScreen;
