import UniAvatar from './UniAvatar';
import styles from './ChatHeader.module.css';

export default function ChatHeader({ mode, onModeChange, onHistory, onNewChat, isThinking }) {
  return (
    <header className={styles.header}>
      <div className={styles.identity}>
        <UniAvatar status={isThinking ? 'thinking' : 'idle'} size="md" />
        <div className={styles.text}>
          <span className={styles.name}>Uni</span>
          <span className={styles.status}>
            {isThinking ? 'Pensando…' : 'Pronta para ajudar'}
          </span>
        </div>
      </div>

      <div className={styles.actions}>
        <div className={styles.toggle} role="tablist" aria-label="Selecionar perfil">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'pessoal'}
            className={`${styles.toggleBtn} ${mode === 'pessoal' ? styles.toggleActive : ''}`}
            onClick={() => onModeChange('pessoal')}
          >
            Pessoal
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'empresa'}
            className={`${styles.toggleBtn} ${mode === 'empresa' ? styles.toggleActive : ''}`}
            onClick={() => onModeChange('empresa')}
          >
            Empresa
          </button>
          <span
            className={styles.toggleThumb}
            style={{ transform: mode === 'empresa' ? 'translateX(100%)' : 'translateX(0)' }}
            aria-hidden="true"
          />
        </div>

        <button type="button" className={styles.iconBtn} onClick={onHistory} aria-label="Ver histórico de conversas">
          <HistoryIcon />
        </button>
        <button type="button" className={styles.iconBtn} onClick={onNewChat} aria-label="Iniciar nova conversa">
          <PlusIcon />
        </button>
      </div>
    </header>
  );
}

function HistoryIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v4h4" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
