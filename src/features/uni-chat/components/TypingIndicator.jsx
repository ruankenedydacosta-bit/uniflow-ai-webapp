import UniSignatureWave from './UniSignatureWave';
import styles from './TypingIndicator.module.css';

// FASE ESTADOS DE PROCESSAMENTO: `message` (opcional) sobrescreve o rótulo
// estático -- alimentado por useUniProcessingMessage (interpreting), nunca
// persistido, nunca substitui a mensagem final quando ela chega (isTyping
// vira false e este componente para de ser renderizado antes disso).
export default function TypingIndicator({ message }) {
  return (
    <div className={styles.row} aria-live="polite">
      <div className={styles.bubble}>
        <UniSignatureWave variant="thinking" size={34} />
        <span className={styles.label}>{message || 'Uni está pensando…'}</span>
      </div>
    </div>
  );
}
