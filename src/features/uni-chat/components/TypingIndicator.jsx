import UniSignatureWave from './UniSignatureWave';
import styles from './TypingIndicator.module.css';

export default function TypingIndicator() {
  return (
    <div className={styles.row} aria-live="polite">
      <div className={styles.bubble}>
        <UniSignatureWave variant="thinking" size={34} />
        <span className={styles.label}>Uni está pensando…</span>
      </div>
    </div>
  );
}
