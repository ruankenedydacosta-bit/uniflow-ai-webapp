import { UniRingOrb, UNI_RING_ORB_STATES } from '../components/ui/UniRingOrb';
import styles from './AppBootScreen.module.css';

// Tela de espera enquanto o app abre (sessão e assinatura). Mostra a Uni
// girando, a mesma do assistente de voz, no lugar do spinner genérico.
function AppBootScreen({ label }) {
  return (
    <div className={styles.screen} role="status" aria-live="polite" aria-label={label || 'Carregando'}>
      <UniRingOrb size={112} state={UNI_RING_ORB_STATES.THINKING} />
      {label ? <p className={styles.label}>{label}</p> : null}
    </div>
  );
}

export default AppBootScreen;
