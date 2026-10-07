import { UNI_RING_ORB_STATES, UniRingOrb } from '../../../components/ui/UniRingOrb/index.js';
import styles from './TypingIndicator.module.css';

// FASE ESTADOS DE PROCESSAMENTO: `message` (opcional) sobrescreve o rótulo
// estático -- alimentado por useUniProcessingMessage (interpreting), nunca
// persistido, nunca substitui a mensagem final quando ela chega (isTyping
// vira false e este componente para de ser renderizado antes disso).
// Redesign (épico #91): mesma forma da resposta da Uni, com o orb pensando.
export default function TypingIndicator({ message }) {
  return (
    <div className={styles.row} aria-live="polite">
      <span className={styles.avatar}>
        <UniRingOrb size={22} state={UNI_RING_ORB_STATES.THINKING} />
      </span>
      <span className={styles.label}>{message || 'Uni está pensando…'}</span>
    </div>
  );
}
